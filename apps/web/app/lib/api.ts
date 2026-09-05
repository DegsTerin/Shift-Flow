// en-GB: Provides shared API and session recovery so frontend requests follow one bounded authentication lifecycle.
import type { ApiEnvelope, Filters, LoginResponse, SessionCompany } from "./types";
import { isNamedTimezone } from "./zoned-datetime";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const csrfCookieName = "shiftflow_csrf";
const refreshPath = "/api/auth/refresh";
const refreshLockName = "shiftflow-auth-refresh";
const sessionBootstrapPaths = new Set(["/api/auth/demo", "/api/auth/login", "/api/auth/portfolio"]);
const authenticationPaths = new Set([...sessionBootstrapPaths, refreshPath, "/api/auth/logout"]);
const reauthenticationKey = "shiftflow.reauthentication-required";

let activeSession: LoginResponse | null = null;
let sessionGeneration = 0;
let authCookieTail: Promise<void> = Promise.resolve();
let companySwitchPending = false;
let protectedUnsafeRequests = 0;
let refreshFlight:
  | {
      generation: number;
      identity: string | null;
      promise: Promise<LoginResponse>;
    }
  | undefined;
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

export class CompanySwitchError extends ApiError {
  constructor(readonly reason: "BLOCKED" | "REJECTED" | "UNCERTAIN") {
    super(`Company authentication ${reason.toLowerCase()}`, reason === "REJECTED" ? 401 : 409);
  }
}

function isCompany(value: unknown): value is SessionCompany {
  if (!value || typeof value !== "object") return false;
  const company = value as Partial<SessionCompany>;
  return (
    typeof company.id === "string" &&
    Boolean(company.id.trim()) &&
    typeof company.name === "string" &&
    Boolean(company.name.trim()) &&
    typeof company.timezone === "string" &&
    isNamedTimezone(company.timezone)
  );
}

export function apiCompanyContext(session: LoginResponse | null) {
  const user = session?.user;
  const active =
    isCompany(user?.company) && user.company.id === user.companyId ? user.company : null;
  const companies = user?.companies;
  const validProjection =
    Array.isArray(companies) &&
    companies.every(isCompany) &&
    new Set(companies.map((company) => company.id)).size === companies.length;
  const projectedActive = validProjection
    ? companies.find((company) => company.id === active?.id)
    : undefined;
  const coherent =
    active &&
    (!companies ||
      (projectedActive?.name === active.name && projectedActive.timezone === active.timezone));
  return {
    active: coherent ? active : null,
    destinations:
      coherent &&
      validProjection &&
      session?.authenticationMode === "required" &&
      typeof user?.id === "string" &&
      Boolean(user.id.trim()) &&
      typeof user.email === "string" &&
      Boolean(user.email.trim())
        ? companies.filter((company) => company.id !== active.id)
        : []
  };
}

export function isApiCompanySwitchPending() {
  return companySwitchPending;
}

export function isApiReauthenticationRequired() {
  try {
    return (
      typeof sessionStorage !== "undefined" && sessionStorage.getItem(reauthenticationKey) !== null
    );
  } catch {
    return true;
  }
}

function establishReauthenticationMarker() {
  try {
    sessionStorage.setItem(reauthenticationKey, "1");
    if (sessionStorage.getItem(reauthenticationKey) !== "1") throw new Error();
  } catch {
    throw new CompanySwitchError("BLOCKED");
  }
}

function clearReauthenticationMarker() {
  sessionStorage.removeItem(reauthenticationKey);
  if (sessionStorage.getItem(reauthenticationKey) !== null)
    throw new Error("Reauthentication protection could not be cleared");
}

function validatedLogin(
  value: unknown,
  email: string,
  userId?: string,
  companyId?: string
): LoginResponse {
  const session = value as LoginResponse | null | undefined;
  if (
    !session ||
    typeof session.accessToken !== "string" ||
    !session.accessToken.trim() ||
    session.authenticationMode !== "required" ||
    !session.user ||
    typeof session.user.id !== "string" ||
    !session.user.id.trim() ||
    session.user.email !== email ||
    (userId !== undefined && session.user.id !== userId) ||
    (companyId !== undefined && session.user.companyId !== companyId) ||
    !Array.isArray(session.user.permissions) ||
    !session.user.permissions.every((permission) => typeof permission === "string") ||
    !Array.isArray(session.user.companies) ||
    !session.user.companies.length ||
    !apiCompanyContext(session).active
  ) {
    throw new CompanySwitchError("UNCERTAIN");
  }
  return session;
}

// en-GB: Fetch, validation and publication share cookie custody; the marker protects reloads of this tab, not other tabs.
async function loginWithCookieAdmission(
  email: string,
  password: string,
  expectedGeneration: number,
  userId?: string,
  companyId?: string,
  signal?: AbortSignal
) {
  if (companySwitchPending || protectedUnsafeRequests || !password)
    throw new CompanySwitchError("BLOCKED");
  companySwitchPending = true;
  try {
    return await serialiseAuthCookieOperation(async () => {
      throwIfAuthRequestAborted(signal);
      if (sessionGeneration !== expectedGeneration) throw new CompanySwitchError("BLOCKED");
      assertCookieHostCompatibility();
      const wasRequired = isApiReauthenticationRequired();
      establishReauthenticationMarker();
      try {
        const body = JSON.stringify({ email, password, ...(companyId ? { companyId } : {}) });
        const result = await performRequest<unknown>("/api/auth/login", undefined, {
          method: "POST",
          body,
          signal
        });
        throwIfAuthRequestAborted(signal);
        if (sessionGeneration !== expectedGeneration) throw new CompanySwitchError("UNCERTAIN");
        const nextSession = validatedLogin(result, email, userId, companyId);
        clearReauthenticationMarker();
        installSession(nextSession, true);
        return nextSession;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          error.message === "Invalid credentials"
        ) {
          if (!wasRequired) clearReauthenticationMarker();
          throw new CompanySwitchError("REJECTED");
        }
        // en-GB: A dispatched failure cannot prove which cookies survived. Never revoke a newer local session.
        if (sessionGeneration === expectedGeneration) clearApiSession();
        throw new CompanySwitchError("UNCERTAIN");
      }
    }, signal);
  } finally {
    companySwitchPending = false;
  }
}

export function switchApiCompany(
  companyId: string,
  password: string,
  originEpoch: number | null,
  signal?: AbortSignal
) {
  if (
    !isApiSessionEpochCurrent(originEpoch) ||
    !activeSession ||
    !apiCompanyContext(activeSession).destinations.some((company) => company.id === companyId)
  ) {
    return Promise.reject(new CompanySwitchError("BLOCKED"));
  }
  return loginWithCookieAdmission(
    activeSession.user.email,
    password,
    sessionGeneration,
    activeSession.user.id,
    companyId,
    signal
  );
}

export function reauthenticateApiSession(email: string, password: string) {
  return loginWithCookieAdmission(email, password, sessionGeneration);
}

function isAbortFailure(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function assertCookieHostCompatibility() {
  if (typeof window === "undefined") return;
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBaseUrl, window.location.href);
  } catch {
    throw new ApiError("API base URL is invalid", 0);
  }
  const sameOriginAuthority =
    apiUrl.hostname === window.location.hostname && apiUrl.protocol === window.location.protocol;
  const explicitlyAllowedLocalHttp =
    process.env.NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK === "true" &&
    apiUrl.protocol === "http:" &&
    isLoopbackHost(apiUrl.hostname);
  const secureProductionTransport =
    process.env.NODE_ENV !== "production" ||
    apiUrl.protocol === "https:" ||
    explicitlyAllowedLocalHttp;
  if (!sameOriginAuthority || !secureProductionTransport) {
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
  return isUnsafeMethod(init.method) && !sessionBootstrapPaths.has(path);
}

function publishSession(session: LoginResponse | null) {
  for (const subscriber of sessionSubscribers) {
    subscriber(session);
  }
}

function installSession(session: LoginResponse | null, advanceGeneration: boolean) {
  if (advanceGeneration || !sameSecurityContext(activeSession, session)) {
    sessionGeneration += 1;
  }
  activeSession = session;
  publishSession(session);
}

function sameSessionIdentity(left: LoginResponse, right: LoginResponse) {
  return left.user.id === right.user.id && left.user.companyId === right.user.companyId;
}

function sessionIdentity(session: LoginResponse | null) {
  return session ? `${session.user.id}:${session.user.companyId ?? ""}` : null;
}

function permissionKey(session: LoginResponse | null) {
  return [...new Set(session?.user.permissions ?? [])].sort().join("\u0000");
}

function sameSecurityContext(left: LoginResponse | null, right: LoginResponse | null) {
  if (!left || !right) return left === right;
  return sameSessionIdentity(left, right) && permissionKey(left) === permissionKey(right);
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

function throwIfAuthRequestAborted(signal?: AbortSignal | null) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function serialiseAuthCookieOperation<T>(operation: () => Promise<T>, signal?: AbortSignal | null) {
  throwIfAuthRequestAborted(signal);
  if (typeof navigator !== "undefined" && navigator.locks) {
    return signal
      ? navigator.locks.request(refreshLockName, { signal }, operation)
      : navigator.locks.request(refreshLockName, operation);
  }
  const run = () => {
    throwIfAuthRequestAborted(signal);
    return operation();
  };
  const result = authCookieTail.then(run, run);
  authCookieTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function refreshSession() {
  if (isApiReauthenticationRequired()) return Promise.reject(new CompanySwitchError("UNCERTAIN"));
  const expectedGeneration = sessionGeneration;
  const expectedSession = activeSession;
  const expectedIdentity = sessionIdentity(expectedSession);
  if (
    refreshFlight?.generation === expectedGeneration &&
    refreshFlight.identity === expectedIdentity
  ) {
    return refreshFlight.promise;
  }

  const requestRefresh = async () => {
    if (isApiReauthenticationRequired()) throw new CompanySwitchError("UNCERTAIN");
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
  const promise = serialiseAuthCookieOperation(async () => {
    const session = await requestRefresh();
    if (sessionGeneration !== expectedGeneration) {
      throw new ApiError("Session changed during refresh", 401);
    }
    if (expectedSession && !sameSessionIdentity(expectedSession, session)) {
      throw new ApiError("Session identity changed during refresh", 401);
    }
    installSession(session, false);
    return session;
  }).finally(() => {
    if (refreshFlight?.promise === promise) refreshFlight = undefined;
  });
  refreshFlight = {
    generation: expectedGeneration,
    identity: expectedIdentity,
    promise
  };
  return promise;
}

export function restoreApiSession() {
  return refreshSession();
}

export async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  const requestGeneration = sessionGeneration;
  const authenticationRequest = authenticationPaths.has(path);
  const protectedUnsafe = !authenticationRequest && isUnsafeMethod(init.method);
  if (companySwitchPending && (protectedUnsafe || authenticationRequest))
    throw new CompanySwitchError("BLOCKED");
  if (sessionBootstrapPaths.has(path) && isApiReauthenticationRequired())
    throw new CompanySwitchError("UNCERTAIN");
  if (protectedUnsafe) protectedUnsafeRequests += 1;
  const effectiveToken = authenticationRequest ? token : (activeSession?.accessToken ?? token);
  const initialRequest = () => {
    throwIfAuthRequestAborted(init.signal);
    if (authenticationRequest && sessionGeneration !== requestGeneration) {
      throw new ApiError("Session changed before authentication request", 401);
    }
    return performRequest<T>(path, effectiveToken, init);
  };
  try {
    const result = await (authenticationRequest
      ? serialiseAuthCookieOperation(initialRequest, init.signal)
      : initialRequest());
    if (!authenticationRequest && sessionGeneration !== requestGeneration) {
      throw new ApiError("Session changed during request", 401);
    }
    return result;
  } catch (error) {
    if (isAbortFailure(error)) throw error;
    if (sessionGeneration !== requestGeneration) {
      throw new ApiError("Session changed during request", 401);
    }
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      Boolean(effectiveToken) &&
      Boolean(activeSession) &&
      !authenticationRequest;
    if (!canRefresh) {
      throw error;
    }
    // en-GB: Reserved Company authentication owns the session; suspended read recovery must not revoke its origin.
    if (companySwitchPending) throw new CompanySwitchError("BLOCKED");

    let refreshedSession: LoginResponse;
    try {
      refreshedSession =
        activeSession && activeSession.accessToken !== effectiveToken
          ? activeSession
          : await refreshSession();
      if (sessionGeneration !== requestGeneration) {
        throw new ApiError("Authorisation changed during refresh", 401);
      }
    } catch (refreshError) {
      if (sessionGeneration === requestGeneration) {
        if (companySwitchPending) throw new CompanySwitchError("BLOCKED");
        clearApiSession();
      }
      throw refreshError;
    }

    if (companySwitchPending) throw new CompanySwitchError("BLOCKED");
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
        if (companySwitchPending) throw new CompanySwitchError("BLOCKED");
        if (activeSession?.accessToken === refreshedSession.accessToken) {
          clearApiSession();
        }
      }
      throw retryError;
    }
  } finally {
    if (protectedUnsafe) protectedUnsafeRequests -= 1;
  }
}

export function queryString(
  filters: Filters,
  search: string,
  pagination?: { page: number; pageSize: number }
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const boundedSearch = search.trim().slice(0, 200);
  if (boundedSearch) params.set("search", boundedSearch);
  if (pagination) {
    params.set("page", String(pagination.page));
    params.set("pageSize", String(pagination.pageSize));
  }
  return params.toString() ? `?${params.toString()}` : "";
}
