// en-GB: Provides shared API and session recovery so frontend requests follow one bounded authentication lifecycle.
import type { ApiEnvelope, Filters, LoginResponse } from "./types";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const csrfCookieName = "shiftflow_csrf";
const refreshPath = "/api/auth/refresh";
const refreshLockName = "shiftflow-auth-refresh";
const authenticationPaths = new Set(["/api/auth/login", refreshPath, "/api/auth/logout"]);

let activeSession: LoginResponse | null = null;
let sessionGeneration = 0;
let refreshPromise: Promise<LoginResponse> | null = null;
const sessionSubscribers = new Set<(session: LoginResponse | null) => void>();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function assertCookieHostCompatibility() {
  if (typeof window === "undefined") return;
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBaseUrl, window.location.href);
  } catch {
    throw new ApiError("API base URL is invalid", 0);
  }
  if (
    apiUrl.hostname !== window.location.hostname ||
    apiUrl.protocol !== window.location.protocol ||
    (process.env.NODE_ENV === "production" && apiUrl.protocol !== "https:")
  ) {
    throw new ApiError(
      "Web and API URLs must share a protocol and hostname for cookie-based CSRF",
      0
    );
  }
}

function csrfTokenFromCookie() {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${csrfCookieName}=`))
    ?.slice(csrfCookieName.length + 1);
}

function isUnsafeMethod(method: string | undefined) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());
}

function shouldAttachCsrf(path: string, init: RequestInit) {
  return isUnsafeMethod(init.method) && path !== "/api/auth/login";
}

function publishSession(session: LoginResponse | null) {
  for (const subscriber of sessionSubscribers) {
    subscriber(session);
  }
}

function installSession(session: LoginResponse | null, advanceGeneration: boolean) {
  if (advanceGeneration) {
    sessionGeneration += 1;
  }
  activeSession = session;
  publishSession(session);
}

function sameSessionIdentity(left: LoginResponse, right: LoginResponse) {
  return left.user.id === right.user.id && left.user.companyId === right.user.companyId;
}

export function setApiSession(session: LoginResponse) {
  installSession(session, true);
}

export function clearApiSession() {
  installSession(null, true);
}

export function subscribeApiSession(subscriber: (session: LoginResponse | null) => void) {
  sessionSubscribers.add(subscriber);
  return () => {
    sessionSubscribers.delete(subscriber);
  };
}

export function captureApiSessionEpoch() {
  return activeSession ? sessionGeneration : null;
}

export function isApiSessionEpochCurrent(epoch: number | null) {
  return epoch !== null && activeSession !== null && epoch === sessionGeneration;
}

export async function settleApiSessionOperation<T>(
  epoch: number,
  operation: Promise<T>,
  handlers: {
    onSuccess(value: T): void | Promise<void>;
    onFailure(error: unknown): void | Promise<void>;
  }
) {
  let value: T;
  try {
    value = await operation;
  } catch (error) {
    if (!isApiSessionEpochCurrent(epoch)) return "STALE" as const;
    await handlers.onFailure(error);
    return "FAILED" as const;
  }

  if (!isApiSessionEpochCurrent(epoch)) return "STALE" as const;
  await handlers.onSuccess(value);
  return "SUCCEEDED" as const;
}

async function performRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  assertCookieHostCompatibility();
  const csrfToken = shouldAttachCsrf(path, init) ? csrfTokenFromCookie() : undefined;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? `HTTP ${response.status}`, response.status);
  }
  return payload.data;
}

function refreshSession() {
  if (refreshPromise) return refreshPromise;

  const expectedGeneration = sessionGeneration;
  const expectedSession = activeSession;
  const requestRefresh = async () => {
    if (
      sessionGeneration !== expectedGeneration ||
      (expectedSession !== null &&
        (!activeSession || !sameSessionIdentity(expectedSession, activeSession))) ||
      (expectedSession === null && activeSession !== null)
    ) {
      throw new ApiError("Session changed before refresh", 401);
    }
    return performRequest<LoginResponse>(refreshPath, undefined, {
      method: "POST",
      body: JSON.stringify({})
    });
  };
  const lockedRefresh =
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(refreshLockName, requestRefresh)
      : requestRefresh();
  refreshPromise = lockedRefresh
    .then((session) => {
      if (sessionGeneration !== expectedGeneration) {
        throw new ApiError("Session changed during refresh", 401);
      }
      if (expectedSession && !sameSessionIdentity(expectedSession, session)) {
        throw new ApiError("Session identity changed during refresh", 401);
      }
      installSession(session, false);
      return session;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export function restoreApiSession() {
  return refreshSession();
}

export async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  const requestGeneration = sessionGeneration;
  const effectiveToken = authenticationPaths.has(path)
    ? token
    : (activeSession?.accessToken ?? token);
  try {
    const result = await performRequest<T>(path, effectiveToken, init);
    if (!authenticationPaths.has(path) && sessionGeneration !== requestGeneration) {
      throw new ApiError("Session changed during request", 401);
    }
    return result;
  } catch (error) {
    if (sessionGeneration !== requestGeneration) {
      throw new ApiError("Session changed during request", 401);
    }
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      Boolean(effectiveToken) &&
      Boolean(activeSession) &&
      !authenticationPaths.has(path);
    if (!canRefresh) {
      throw error;
    }

    let refreshedSession: LoginResponse;
    try {
      refreshedSession =
        activeSession && activeSession.accessToken !== effectiveToken
          ? activeSession
          : await refreshSession();
    } catch (refreshError) {
      if (sessionGeneration === requestGeneration) {
        clearApiSession();
      }
      throw refreshError;
    }

    try {
      const result = await performRequest<T>(path, refreshedSession.accessToken, init);
      if (sessionGeneration !== requestGeneration) {
        throw new ApiError("Session changed during request", 401);
      }
      return result;
    } catch (retryError) {
      if (sessionGeneration !== requestGeneration) {
        throw new ApiError("Session changed during request", 401);
      }
      if (retryError instanceof ApiError && retryError.status === 401) {
        if (activeSession?.accessToken === refreshedSession.accessToken) {
          clearApiSession();
        }
      }
      throw retryError;
    }
  }
}

export function queryString(filters: Filters, search: string) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (search.trim()) params.set("search", search.trim());
  return params.toString() ? `?${params.toString()}` : "";
}
