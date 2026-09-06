// en-GB: Exercises the shared API client so authentication recovery remains bounded, single-flight and observable.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse, SessionCompany } from "./types";
import {
  ApiError,
  apiCompanyContext,
  apiRequest,
  captureApiSessionEpoch,
  clearApiSession,
  isApiCompanySwitchPending,
  isApiReauthenticationRequired,
  reauthenticateApiSession,
  queryString,
  restoreApiSession,
  settleApiSessionOperation,
  setApiSession,
  subscribeApiSession,
  switchApiCompany
} from "./api";

function session(accessToken: string): LoginResponse {
  return {
    accessToken,
    user: {
      id: "user-1",
      email: "user@example.com",
      companyId: "company-a",
      permissions: ["dashboard:read"]
    }
  };
}

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload)
  } as unknown as Response;
}

function bearer(init?: RequestInit) {
  return new Headers(init?.headers).get("Authorization");
}

describe("apiRequest", () => {
  beforeEach(() => {
    clearApiSession();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearApiSession();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses one refresh for concurrent 401 responses and retries each request once", async () => {
    const fetchMock = vi.mocked(fetch);
    let refreshCalls = 0;
    let releaseLateResponse: (() => void) | undefined;
    const lateResponse = new Promise<void>((resolve) => {
      releaseLateResponse = resolve;
    });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        releaseLateResponse?.();
        return response(200, { data: session("new-access-token") });
      }
      if (bearer(init) === "Bearer old-access-token") {
        if (url.endsWith("/api/two")) {
          await lateResponse;
        }
        return response(401, { error: { message: "Expired" } });
      }
      return response(200, { data: url.endsWith("/api/one") ? "one" : "two" });
    });
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(session("old-access-token"));

    const result = await Promise.all([
      apiRequest<string>("/api/one", "old-access-token"),
      apiRequest<string>("/api/two", "old-access-token")
    ]);

    expect(result).toEqual(["one", "two"]);
    expect(refreshCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(observedSessions.at(-1)?.accessToken).toBe("new-access-token");
    unsubscribe();
  });

  it("clears the session when the single retry is also unauthorized", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/api/auth/refresh")
        ? response(200, { data: session("new-access-token") })
        : response(401, { error: { message: "Unauthorized" } })
    );
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(session("old-access-token"));

    await expect(apiRequest("/api/protected", "old-access-token")).rejects.toMatchObject({
      status: 401
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(observedSessions.at(-1)).toBeNull();
    unsubscribe();
  });

  it("keeps the renewed session when a retry fails for a non-authentication reason", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/auth/refresh")) {
        return response(200, { data: session("new-access-token") });
      }
      return bearer(init) === "Bearer old-access-token"
        ? response(401, { error: { message: "Expired" } })
        : response(403, { error: { message: "Forbidden" } });
    });
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(session("old-access-token"));

    await expect(apiRequest("/api/protected", "old-access-token")).rejects.toMatchObject({
      status: 403
    });

    expect(observedSessions.at(-1)?.accessToken).toBe("new-access-token");
    unsubscribe();
  });

  it("keeps the security epoch stable when refresh only rotates token and permission order", async () => {
    const original = {
      ...session("old-access-token"),
      user: {
        ...session("old-access-token").user,
        permissions: ["dashboard:read", "activities:read"]
      }
    };
    const refreshed = {
      ...session("new-access-token"),
      user: {
        ...session("new-access-token").user,
        permissions: ["activities:read", "dashboard:read", "activities:read"]
      }
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/auth/refresh")) {
        return response(200, { data: refreshed });
      }
      return bearer(init) === "Bearer old-access-token"
        ? response(401, { error: { message: "Expired" } })
        : response(200, { data: "current-result" });
    });
    setApiSession(original);
    const epoch = captureApiSessionEpoch();

    await expect(apiRequest<string>("/api/protected", original.accessToken)).resolves.toBe(
      "current-result"
    );

    expect(captureApiSessionEpoch()).toBe(epoch);
  });

  it("advances the security epoch and stops retry when refresh revokes a permission", async () => {
    const original = {
      ...session("old-access-token"),
      user: {
        ...session("old-access-token").user,
        permissions: ["dashboard:read", "activities:read"]
      }
    };
    const restricted = {
      ...session("restricted-access-token"),
      user: {
        ...session("restricted-access-token").user,
        permissions: ["dashboard:read"]
      }
    };
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/api/auth/refresh")
        ? response(200, { data: restricted })
        : response(401, { error: { message: "Expired" } })
    );
    setApiSession(original);
    const epoch = captureApiSessionEpoch();

    await expect(apiRequest("/api/protected", original.accessToken)).rejects.toMatchObject({
      message: "Authorisation changed during refresh",
      status: 401
    });

    expect(captureApiSessionEpoch()).not.toBe(epoch);
    expect(observedSessions.at(-1)).toEqual(restricted);
    expect(fetch).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not recursively refresh authentication endpoints", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(response(401, { error: { message: "Invalid credentials" } }));
    setApiSession(session("old-access-token"));

    await expect(
      apiRequest("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({})
      })
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats portfolio access as a credential-free session bootstrap request", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(response(401, { error: { message: "Unavailable" } }));
    vi.stubGlobal("document", { cookie: "shiftflow_csrf=stale-csrf-token" });
    setApiSession(session("old-access-token"));

    await expect(
      apiRequest("/api/auth/portfolio", undefined, {
        method: "POST",
        body: JSON.stringify({})
      })
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get("Authorization")).toBeNull();
    expect(requestHeaders.get("x-csrf-token")).toBeNull();
  });

  it("shares session restoration across duplicate mounts", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(response(200, { data: session("restored-access-token") }));

    const restored = await Promise.all([restoreApiSession(), restoreApiSession()]);

    expect(restored).toEqual([session("restored-access-token"), session("restored-access-token")]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not refresh a stale caller token after the session was cleared", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(response(401, { error: { message: "Expired" } }));
    setApiSession(session("old-access-token"));
    clearApiSession();

    await expect(apiRequest("/api/protected", "old-access-token")).rejects.toMatchObject({
      status: 401
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a refresh response that changes user or company identity", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/api/auth/refresh")
        ? response(200, {
            data: {
              ...session("other-access-token"),
              user: {
                ...session("other-access-token").user,
                id: "user-2",
                companyId: "company-b"
              }
            }
          })
        : response(401, { error: { message: "Expired" } })
    );
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(session("old-access-token"));

    await expect(apiRequest("/api/protected", "old-access-token")).rejects.toMatchObject({
      status: 401
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(observedSessions.at(-1)).toBeNull();
    unsubscribe();
  });

  it("rejects a retry response that completes after logout", async () => {
    const fetchMock = vi.mocked(fetch);
    let releaseRetry: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/auth/refresh")) {
        return response(200, { data: session("new-access-token") });
      }
      if (bearer(init) === "Bearer old-access-token") {
        return response(401, { error: { message: "Expired" } });
      }
      return new Promise<Response>((resolve) => {
        releaseRetry = resolve;
      });
    });
    setApiSession(session("old-access-token"));

    const pendingRequest = apiRequest("/api/protected", "old-access-token");
    await vi.waitFor(() => expect(releaseRetry).toBeTypeOf("function"));
    clearApiSession();
    releaseRetry?.(response(200, { data: "stale-data" }));

    await expect(pendingRequest).rejects.toMatchObject({ status: 401 });
  });

  it("does not clear a newer session when an older retry returns unauthorized", async () => {
    const fetchMock = vi.mocked(fetch);
    let refreshCalls = 0;
    let releaseOldRetry: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const authorization = bearer(init);
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        return response(200, {
          data: session(refreshCalls === 1 ? "access-one" : "access-two")
        });
      }
      if (url.endsWith("/api/one") && authorization === "Bearer access-zero") {
        return response(401, { error: { message: "Expired" } });
      }
      if (url.endsWith("/api/one") && authorization === "Bearer access-one") {
        return new Promise<Response>((resolve) => {
          releaseOldRetry = resolve;
        });
      }
      if (url.endsWith("/api/two") && authorization === "Bearer access-one") {
        return response(401, { error: { message: "Expired again" } });
      }
      if (url.endsWith("/api/two") && authorization === "Bearer access-two") {
        return response(200, { data: "current-result" });
      }
      return response(500, { error: { message: "Unexpected request" } });
    });
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(session("access-zero"));

    const oldRequest = apiRequest<string>("/api/one", "access-zero");
    await vi.waitFor(() => expect(releaseOldRetry).toBeTypeOf("function"));
    await expect(apiRequest<string>("/api/two", "access-one")).resolves.toBe("current-result");
    releaseOldRetry?.(response(401, { error: { message: "Late unauthorized" } }));

    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(observedSessions.at(-1)?.accessToken).toBe("access-two");
    expect(refreshCalls).toBe(2);
    unsubscribe();
  });

  it("does not reuse an older tenant refresh flight after the session changes", async () => {
    const tenantSession = (
      accessToken: string,
      userId: string,
      companyId: string
    ): LoginResponse => ({
      accessToken,
      user: {
        id: userId,
        email: `${userId}@example.com`,
        companyId,
        permissions: ["dashboard:read"]
      }
    });
    const sessionA = tenantSession("access-a", "user-a", "company-a");
    const sessionB = tenantSession("access-b", "user-b", "company-b");
    const refreshedB = tenantSession("access-b-refreshed", "user-b", "company-b");
    let refreshCalls = 0;
    let tenantBRequestObserved = false;
    let releaseRefreshA: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return new Promise<Response>((resolve) => {
            releaseRefreshA = resolve;
          });
        }
        return response(200, { data: refreshedB });
      }
      const authorization = bearer(init);
      if (authorization === "Bearer access-b") tenantBRequestObserved = true;
      if (authorization === "Bearer access-a" || authorization === "Bearer access-b") {
        return response(401, { error: { message: "Expired" } });
      }
      if (authorization === "Bearer access-b-refreshed") {
        return response(200, { data: "tenant-b-result" });
      }
      return response(500, { error: { message: `Unexpected request: ${url}` } });
    });
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(sessionA);

    const requestA = apiRequest("/api/a", sessionA.accessToken);
    await vi.waitFor(() => expect(releaseRefreshA).toBeTypeOf("function"));
    clearApiSession();
    setApiSession(sessionB);
    const requestB = apiRequest<string>("/api/b", sessionB.accessToken);
    await vi.waitFor(() => expect(tenantBRequestObserved).toBe(true));
    releaseRefreshA?.(response(401, { error: { message: "Old refresh rejected" } }));

    await expect(requestB).resolves.toBe("tenant-b-result");
    await expect(requestA).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(2);
    expect(observedSessions.at(-1)).toEqual(refreshedB);
    unsubscribe();
  });

  it("does not reuse a refresh flight after a new generation keeps the same identity", async () => {
    const sessionA = session("access-a");
    const sessionB = session("access-b");
    const refreshedB = session("access-b-refreshed");
    let refreshCalls = 0;
    let releaseRefreshA: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return new Promise<Response>((resolve) => {
            releaseRefreshA = resolve;
          });
        }
        return response(200, { data: refreshedB });
      }
      const authorization = bearer(init);
      if (authorization === "Bearer access-a" || authorization === "Bearer access-b") {
        return response(401, { error: { message: "Expired" } });
      }
      if (authorization === "Bearer access-b-refreshed") {
        return response(200, { data: "current-result" });
      }
      return response(500, { error: { message: `Unexpected request: ${url}` } });
    });
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(sessionA);

    const requestA = apiRequest("/api/a", sessionA.accessToken);
    await vi.waitFor(() => expect(releaseRefreshA).toBeTypeOf("function"));
    clearApiSession();
    setApiSession(sessionB);
    const requestB = apiRequest<string>("/api/b", sessionB.accessToken);
    releaseRefreshA?.(response(200, { data: session("access-a-refreshed") }));

    await expect(requestA).rejects.toMatchObject({ status: 401 });
    await expect(requestB).resolves.toBe("current-result");
    expect(refreshCalls).toBe(2);
    expect(observedSessions.at(-1)).toEqual(refreshedB);
    unsubscribe();
  });

  it.each([200, 401])(
    "serialises stale refresh status %i before logout and successor login",
    async (refreshStatus) => {
      const order: string[] = [];
      let cookieOwner = "session-a";
      let releaseRefresh: (() => void) | undefined;
      const refreshReleased = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      vi.mocked(fetch).mockImplementation(async (input) => {
        const path = new URL(String(input)).pathname;
        order.push(path);
        if (path === "/api/auth/refresh") {
          await refreshReleased;
          cookieOwner = refreshStatus === 200 ? "stale-refresh-a" : "cleared-by-refresh-a";
          return refreshStatus === 200
            ? response(200, { data: session("access-a-refreshed") })
            : response(401, { error: { message: "Old refresh rejected" } });
        }
        if (path === "/api/auth/logout") {
          cookieOwner = "cleared-by-logout-a";
          return response(200, { data: { loggedOut: true } });
        }
        if (path === "/api/auth/login") {
          cookieOwner = "session-b";
          return response(200, { data: session("access-b") });
        }
        return response(500, { error: { message: `Unexpected request: ${path}` } });
      });
      setApiSession(session("access-a"));

      const staleRefresh = restoreApiSession();
      await vi.waitFor(() => expect(order).toEqual(["/api/auth/refresh"]));
      clearApiSession();
      const logoutRequest = apiRequest("/api/auth/logout", "access-a", {
        method: "POST",
        body: JSON.stringify({})
      });
      const loginRequest = apiRequest<LoginResponse>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({})
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(order).toEqual(["/api/auth/refresh"]);
      releaseRefresh?.();

      await expect(staleRefresh).rejects.toMatchObject({ status: 401 });
      await expect(logoutRequest).resolves.toEqual({ loggedOut: true });
      await expect(loginRequest).resolves.toEqual(session("access-b"));
      expect(order).toEqual(["/api/auth/refresh", "/api/auth/logout", "/api/auth/login"]);
      expect(cookieOwner).toBe("session-b");
    }
  );

  it("does not send an aborted authentication request waiting in the local cookie queue", async () => {
    let releaseRefresh: ((value: Response) => void) | undefined;
    const paths: string[] = [];
    vi.stubGlobal("navigator", {});
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === "/api/auth/refresh") {
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      return response(200, { data: session("unexpected-login") });
    });

    const refresh = restoreApiSession();
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    const controller = new AbortController();
    const queuedLogin = apiRequest<LoginResponse>("/api/auth/login", undefined, {
      method: "POST",
      signal: controller.signal
    });
    controller.abort();
    releaseRefresh?.(response(200, { data: session("restored-access-token") }));

    await expect(refresh).resolves.toEqual(session("restored-access-token"));
    await expect(queuedLogin).rejects.toMatchObject({ name: "AbortError" });
    expect(paths).toEqual(["/api/auth/refresh"]);
  });

  it("passes abort through a queued browser Web Lock before acquisition", async () => {
    let firstLockFinished: (() => void) | undefined;
    const firstFinished = new Promise<void>((resolve) => {
      firstLockFinished = resolve;
    });
    let lockCalls = 0;
    const lockRequest = vi.fn(
      (
        _name: string,
        optionsOrCallback: { signal?: AbortSignal } | (() => Promise<unknown>),
        maybeCallback?: () => Promise<unknown>
      ) => {
        lockCalls += 1;
        const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
        const callback =
          typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
        if (!callback) throw new Error("Expected a Web Lock callback");
        if (lockCalls === 1) {
          return callback().finally(() => firstLockFinished?.());
        }
        return new Promise<unknown>((resolve, reject) => {
          let aborted = false;
          options?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("The operation was aborted.", "AbortError"));
            },
            { once: true }
          );
          void firstFinished.then(() => {
            if (aborted) return;
            callback().then(resolve, reject);
          });
        });
      }
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    let releaseRefresh: ((value: Response) => void) | undefined;
    const paths: string[] = [];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === "/api/auth/refresh") {
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      return response(200, { data: session("unexpected-login") });
    });

    const refresh = restoreApiSession();
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    const controller = new AbortController();
    const queuedLogin = apiRequest<LoginResponse>("/api/auth/login", undefined, {
      method: "POST",
      signal: controller.signal
    });
    controller.abort();
    releaseRefresh?.(response(200, { data: session("restored-access-token") }));

    await expect(refresh).resolves.toEqual(session("restored-access-token"));
    await expect(queuedLogin).rejects.toMatchObject({ name: "AbortError" });
    expect(lockRequest.mock.calls[1]?.[1]).toMatchObject({ signal: controller.signal });
    expect(paths).toEqual(["/api/auth/refresh"]);
  });

  it("uses the browser-wide refresh lock when available", async () => {
    const lockRequest = vi.fn(async (_name: string, callback: () => Promise<LoginResponse>) =>
      callback()
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    vi.mocked(fetch).mockResolvedValue(response(200, { data: session("restored-access-token") }));

    await restoreApiSession();

    expect(lockRequest).toHaveBeenCalledWith("shiftflow-auth-refresh", expect.any(Function));
  });

  it("uses the same browser-wide cookie lock for login and logout", async () => {
    const lockRequest = vi.fn(async (_name: string, callback: () => Promise<unknown>) =>
      callback()
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/api/auth/login")
        ? response(200, { data: session("logged-in") })
        : response(200, { data: { loggedOut: true } })
    );

    await apiRequest<LoginResponse>("/api/auth/login", undefined, { method: "POST" });
    await apiRequest("/api/auth/logout", "logged-in", { method: "POST" });

    expect(lockRequest).toHaveBeenCalledTimes(2);
    expect(lockRequest.mock.calls.map(([name]) => name)).toEqual([
      "shiftflow-auth-refresh",
      "shiftflow-auth-refresh"
    ]);
  });

  it("registers queued same-tab auth intents with the browser lock immediately", async () => {
    const pendingLocks: Array<() => void> = [];
    let lockHeld = false;
    const pump = () => {
      if (lockHeld) return;
      const next = pendingLocks.shift();
      if (!next) return;
      lockHeld = true;
      next();
    };
    const lockRequest = vi.fn(
      (_name: string, callback: () => Promise<unknown>) =>
        new Promise<unknown>((resolve, reject) => {
          pendingLocks.push(() => {
            callback()
              .then(resolve, reject)
              .finally(() => {
                lockHeld = false;
                pump();
              });
          });
          pump();
        })
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    let releaseRefresh: ((value: Response) => void) | undefined;
    const fetchOrder: string[] = [];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      fetchOrder.push(path);
      if (path === "/api/auth/refresh") {
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      if (path === "/api/auth/logout") {
        return response(200, { data: { loggedOut: true } });
      }
      if (path === "/api/auth/login") {
        return response(200, { data: session("access-b") });
      }
      return response(500, { error: { message: `Unexpected request: ${path}` } });
    });
    setApiSession(session("access-a"));

    const staleRefresh = restoreApiSession();
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    clearApiSession();
    const logoutRequest = apiRequest("/api/auth/logout", "access-a", { method: "POST" });
    const loginRequest = apiRequest<LoginResponse>("/api/auth/login", undefined, {
      method: "POST"
    });

    expect(lockRequest).toHaveBeenCalledTimes(3);
    expect(fetchOrder).toEqual(["/api/auth/refresh"]);
    releaseRefresh?.(response(200, { data: session("stale-refresh") }));

    await expect(staleRefresh).rejects.toMatchObject({ status: 401 });
    await expect(logoutRequest).resolves.toEqual({ loggedOut: true });
    await expect(loginRequest).resolves.toEqual(session("access-b"));
    expect(fetchOrder).toEqual(["/api/auth/refresh", "/api/auth/logout", "/api/auth/login"]);
  });

  it("does not send a queued refresh after logout changes the session generation", async () => {
    let runLockedRefresh: (() => void) | undefined;
    const lockRequest = vi.fn(
      (_name: string, callback: () => Promise<LoginResponse>) =>
        new Promise<LoginResponse>((resolve, reject) => {
          runLockedRefresh = () => {
            callback().then(resolve, reject);
          };
        })
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    const fetchMock = vi.mocked(fetch);
    setApiSession(session("old-access-token"));

    const pendingRefresh = restoreApiSession();
    await vi.waitFor(() => expect(runLockedRefresh).toBeTypeOf("function"));
    clearApiSession();
    runLockedRefresh?.();

    await expect(pendingRefresh).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not run a deferred tenant success callback after logout", async () => {
    setApiSession(session("old-access-token"));
    const operationEpoch = captureApiSessionEpoch();
    if (operationEpoch === null) throw new Error("Expected an active session epoch");
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const pending = settleApiSessionOperation(operationEpoch, operation, {
      onSuccess,
      onFailure
    });

    clearApiSession();
    resolveOperation?.("stale-detail");

    await expect(pending).resolves.toBe("STALE");
    expect(captureApiSessionEpoch()).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("does not run a deferred tenant rollback or fallback after logout", async () => {
    setApiSession(session("old-access-token"));
    const operationEpoch = captureApiSessionEpoch();
    if (operationEpoch === null) throw new Error("Expected an active session epoch");
    let rejectOperation: ((reason: Error) => void) | undefined;
    const operation = new Promise<string>((_resolve, reject) => {
      rejectOperation = reject;
    });
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const pending = settleApiSessionOperation(operationEpoch, operation, {
      onSuccess,
      onFailure
    });

    clearApiSession();
    rejectOperation?.(new Error("late failure"));

    await expect(pending).resolves.toBe("STALE");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("rejects a cross-host API configuration before sending cookie-backed requests", async () => {
    vi.stubGlobal("window", {
      location: {
        href: "http://app.shiftflow.example/",
        hostname: "app.shiftflow.example",
        protocol: "http:"
      }
    });

    await expect(apiRequest("/api/auth/login", undefined, { method: "POST" })).rejects.toEqual(
      new ApiError("Web and API URLs must share a protocol and hostname for cookie-based CSRF", 0)
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a mixed-protocol API configuration before sending requests", async () => {
    vi.stubGlobal("window", {
      location: {
        href: "https://localhost/",
        hostname: "localhost",
        protocol: "https:"
      }
    });

    await expect(
      apiRequest("/api/auth/login", undefined, { method: "POST" })
    ).rejects.toMatchObject({ status: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects matching HTTP Web and API URLs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", {
      location: {
        href: "http://localhost/",
        hostname: "localhost",
        protocol: "http:"
      }
    });

    await expect(
      apiRequest("/api/auth/login", undefined, { method: "POST" })
    ).rejects.toMatchObject({ status: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows explicit same-origin loopback HTTP for the local migration stack", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK", "true");
    vi.stubGlobal("window", {
      location: {
        href: "http://localhost:8080/",
        hostname: "localhost",
        protocol: "http:"
      }
    });
    vi.mocked(fetch).mockResolvedValue(response(200, { data: { loggedOut: true } }));

    await expect(apiRequest("/api/auth/logout", undefined, { method: "POST" })).resolves.toEqual({
      loggedOut: true
    });
  });

  it("preserves HTTP status for callers", async () => {
    vi.mocked(fetch).mockResolvedValue(response(403, { error: { message: "Forbidden" } }));

    await expect(apiRequest("/api/protected", "access-token")).rejects.toMatchObject({
      message: "Forbidden",
      status: 403
    });
  });

  it("attaches the CSRF cookie to unsafe session requests", async () => {
    vi.stubGlobal("document", { cookie: "theme=light; shiftflow_csrf=csrf-token" });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(response(200, { data: { loggedOut: true } }));

    await apiRequest("/api/auth/logout", "access-token", {
      method: "POST",
      body: JSON.stringify({})
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
    expect(headers.get("Authorization")).toBe("Bearer access-token");
  });

  it("does not restore a session after logout wins a refresh race", async () => {
    const fetchMock = vi.mocked(fetch);
    let releaseRefresh: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/auth/refresh")) {
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      if (bearer(init) === "Bearer old-access-token") {
        return response(401, { error: { message: "Expired" } });
      }
      return response(200, { data: "unexpected" });
    });
    const observedSessions: Array<LoginResponse | null> = [];
    const unsubscribe = subscribeApiSession((value) => observedSessions.push(value));
    setApiSession(session("old-access-token"));

    const pendingRequest = apiRequest("/api/protected", "old-access-token");
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    clearApiSession();
    releaseRefresh?.(response(200, { data: session("new-access-token") }));

    await expect(pendingRequest).rejects.toMatchObject({ status: 401 });
    expect(observedSessions.at(-1)).toBeNull();
    unsubscribe();
  });
});

describe("company authentication admission", () => {
  const companies: [SessionCompany, SessionCompany] = [
    { id: "company-a", name: "Company A", timezone: "Europe/London" },
    { id: "company-b", name: "Company B", timezone: "America/Sao_Paulo" }
  ];
  const companySession = (
    companyId = "company-a",
    accessToken = "company-access"
  ): LoginResponse => ({
    ...session(accessToken),
    authenticationMode: "required",
    user: {
      ...session(accessToken).user,
      companyId,
      company: companies.find((company) => company.id === companyId)!,
      companies
    }
  });
  function pending<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((complete, fail) => {
      resolve = complete;
      reject = fail;
    });
    return { promise, resolve, reject };
  }
  function cookieLock() {
    let tail = Promise.resolve();
    const request = vi.fn(
      (
        name: string,
        options: { signal?: AbortSignal } | (() => Promise<unknown>),
        callback?: () => Promise<unknown>
      ) => {
        void name;
        const operation = typeof options === "function" ? options : callback!;
        const signal = typeof options === "function" ? undefined : options.signal;
        const next = tail.then(() => {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          return operation();
        });
        tail = next.then(
          () => undefined,
          () => undefined
        );
        return next;
      }
    );
    vi.stubGlobal("navigator", { locks: { request } });
    return request;
  }
  beforeEach(() => {
    clearApiSession();
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key))
    });
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("navigator", {});
    setApiSession(companySession());
  });
  afterEach(() => {
    clearApiSession();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    "demo",
    "portfolio",
    "legacy",
    "singleton",
    "missing",
    "mismatch",
    "duplicate",
    "timezone"
  ])("does not admit %s metadata as a company selection", async (kind) => {
    const candidate = companySession();
    if (kind === "demo" || kind === "portfolio") candidate.authenticationMode = kind;
    if (kind === "legacy") delete candidate.authenticationMode;
    if (kind === "singleton") candidate.user.companies = [companies[0]];
    if (kind === "missing") delete candidate.user.company;
    if (kind === "mismatch") candidate.user.company = companies[1];
    if (kind === "duplicate") candidate.user.companies = [companies[0], companies[0], companies[1]];
    if (kind === "timezone") candidate.user.company = { ...companies[0], timezone: "Not/A_Zone" };
    setApiSession(candidate);
    expect(apiCompanyContext(candidate).destinations).toEqual([]);
    await expect(
      switchApiCompany("company-b", "test-only-password", captureApiSessionEpoch())
    ).rejects.toMatchObject({ reason: "BLOCKED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "serialises leading refresh, rejected password and successful installation with Web Locks=%s",
    async (webLocks) => {
      const locks = webLocks ? cookieLock() : undefined;
      const refresh = pending<Response>();
      const login = pending<Response>();
      const paths: string[] = [];
      let cookieOwner = "company-a";
      vi.mocked(fetch).mockImplementation(async (input) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path.endsWith("refresh")) {
          const result = await refresh.promise;
          cookieOwner = "refreshed-a";
          return result;
        }
        const result = await login.promise;
        if (result.ok) cookieOwner = "company-b";
        return result;
      });
      const observed: Array<LoginResponse | null> = [];
      const unsubscribe = subscribeApiSession((value) => observed.push(value));
      const epoch = captureApiSessionEpoch();
      const refreshing = restoreApiSession();
      await vi.waitFor(() => expect(paths).toEqual(["/api/auth/refresh"]));
      const switching = switchApiCompany("company-b", "test-only-password", epoch);
      expect(isApiCompanySwitchPending()).toBe(true);
      refresh.resolve(response(200, { data: companySession("company-a", "rotated-a") }));
      await refreshing;
      await vi.waitFor(() => expect(paths).toHaveLength(2));
      expect(captureApiSessionEpoch()).toBe(epoch);
      expect(isApiReauthenticationRequired()).toBe(true);
      login.resolve(response(401, { error: { message: "Invalid credentials" } }));
      await expect(switching).rejects.toMatchObject({ reason: "REJECTED" });
      expect(observed.at(-1)?.accessToken).toBe("rotated-a");
      expect(cookieOwner).toBe("refreshed-a");
      expect(isApiReauthenticationRequired()).toBe(false);
      const target = companySession("company-b", "new-b");
      vi.mocked(fetch).mockImplementationOnce(async () => {
        cookieOwner = "company-b";
        return response(200, { data: target });
      });
      await expect(switchApiCompany("company-b", "test-only-password", epoch)).resolves.toEqual(
        target
      );
      expect(observed.at(-1)).toEqual(target);
      expect(cookieOwner).toBe("company-b");
      const init = vi.mocked(fetch).mock.calls.at(-1)?.[1];
      expect(init).toMatchObject({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "user@example.com",
          password: "test-only-password",
          companyId: "company-b"
        })
      });
      expect([...new Headers(init?.headers).keys()]).toEqual(["content-type"]);
      expect(isApiReauthenticationRequired()).toBe(false);
      if (locks)
        expect(locks.mock.calls.every(([name]) => name === "shiftflow-auth-refresh")).toBe(true);
      unsubscribe();
    }
  );

  it.each([false, true])(
    "rejects queued cancellation before login fetch with Web Locks=%s",
    async (webLocks) => {
      if (webLocks) cookieLock();
      const refresh = pending<Response>();
      vi.mocked(fetch).mockReturnValueOnce(refresh.promise);
      const refreshing = restoreApiSession();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      const controller = new AbortController();
      const switching = switchApiCompany(
        "company-b",
        "test-only-password",
        captureApiSessionEpoch(),
        controller.signal
      );
      const rejected = expect(switching).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      refresh.resolve(response(200, { data: companySession("company-a", "rotated-a") }));
      await refreshing;
      await rejected;
      expect(fetch).toHaveBeenCalledOnce();
      expect(isApiReauthenticationRequired()).toBe(false);
      expect(isApiCompanySwitchPending()).toBe(false);
    }
  );

  it.each([false, true])(
    "holds cookie custody through response validation and rejects an old queued refresh with Web Locks=%s",
    async (webLocks) => {
      if (webLocks) cookieLock();
      const payload = pending<unknown>();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => payload.promise
      } as Response);
      const epoch = captureApiSessionEpoch();
      const switching = switchApiCompany("company-b", "test-only-password", epoch);
      const staleRefresh = restoreApiSession().catch((error: unknown) => error);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      expect(captureApiSessionEpoch()).toBe(epoch);
      payload.resolve({ data: companySession("company-b") });
      await switching;
      expect(await staleRefresh).toBeInstanceOf(ApiError);
      expect(fetch).toHaveBeenCalledOnce();
      expect(captureApiSessionEpoch()).not.toBe(epoch);
    }
  );

  it.each(
    [false, true].flatMap((webLocks) =>
      ["initial", "retry"].flatMap((stage) =>
        [false, true].map((loginSucceeds) => ({ webLocks, stage, loginSucceeds }))
      )
    )
  )(
    "preserves cookie custody for $stage read401 with Web Locks=$webLocks and login success=$loginSucceeds",
    async ({ webLocks, stage, loginSucceeds }) => {
      if (webLocks) cookieLock();
      const initial = pending<Response>();
      const retry = pending<Response>();
      const login = pending<Response>();
      const paths: string[] = [];
      let readCalls = 0;
      let cookieOwner = "original-a";
      const original = companySession("company-a", "original-a");
      const rotated = companySession("company-a", "rotated-a");
      const target = companySession("company-b", "target-b");
      const observed: Array<LoginResponse | null> = [];
      const unsubscribe = subscribeApiSession((value) => observed.push(value));
      setApiSession(original);
      const originEpoch = captureApiSessionEpoch();
      vi.mocked(fetch).mockImplementation(async (input) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path === "/api/read") {
          readCalls += 1;
          return readCalls === 1 ? initial.promise : retry.promise;
        }
        if (path === "/api/auth/refresh") {
          cookieOwner = "rotated-a";
          return response(200, { data: rotated });
        }
        if (path === "/api/auth/login") {
          const result = await login.promise;
          if (result.ok) cookieOwner = "target-b";
          return result;
        }
        throw new Error(`Unexpected request: ${path}`);
      });
      try {
        const reading = apiRequest("/api/read", original.accessToken).catch(
          (error: unknown) => error
        );
        await vi.waitFor(() => expect(readCalls).toBe(1));
        if (stage === "retry") {
          initial.resolve(response(401, { error: { message: "Expired" } }));
          await vi.waitFor(() => expect(readCalls).toBe(2));
        }
        const switching = switchApiCompany("company-b", "test-only-password", originEpoch).catch(
          (error: unknown) => error
        );
        await vi.waitFor(() => expect(paths.at(-1)).toBe("/api/auth/login"));
        expect(isApiReauthenticationRequired()).toBe(true);
        const expectedPaths =
          stage === "retry"
            ? ["/api/read", "/api/auth/refresh", "/api/read", "/api/auth/login"]
            : ["/api/read", "/api/auth/login"];
        (stage === "retry" ? retry : initial).resolve(
          response(401, { error: { message: "Expired" } })
        );
        expect(await reading).toMatchObject({ reason: "BLOCKED" });
        expect(paths).toEqual(expectedPaths);
        expect(captureApiSessionEpoch()).toBe(originEpoch);
        expect(observed).not.toContain(null);
        expect(observed.at(-1)).toEqual(stage === "retry" ? rotated : original);
        login.resolve(
          loginSucceeds
            ? response(200, { data: target })
            : response(401, { error: { message: "Invalid credentials" } })
        );
        if (loginSucceeds) {
          expect(await switching).toEqual(target);
          expect(captureApiSessionEpoch()).not.toBe(originEpoch);
          expect(observed.at(-1)).toEqual(target);
          expect(cookieOwner).toBe("target-b");
        } else {
          expect(await switching).toMatchObject({ reason: "REJECTED" });
          expect(captureApiSessionEpoch()).toBe(originEpoch);
          expect(observed.at(-1)).toEqual(stage === "retry" ? rotated : original);
          expect(cookieOwner).toBe(stage === "retry" ? "rotated-a" : "original-a");
        }
        expect(observed).not.toContain(null);
        expect(paths).toEqual(expectedPaths);
        expect(isApiReauthenticationRequired()).toBe(false);
        expect(isApiCompanySwitchPending()).toBe(false);
      } finally {
        unsubscribe();
      }
    }
  );

  it.each(
    [false, true].flatMap((webLocks) =>
      [200, 401].map((refreshStatus) => ({ webLocks, refreshStatus }))
    )
  )(
    "suspends a leading read refresh status $refreshStatus with Web Locks=$webLocks without revoking the reserved origin",
    async ({ webLocks, refreshStatus }) => {
      if (webLocks) cookieLock();
      const refresh = pending<Response>();
      const login = pending<Response>();
      const paths: string[] = [];
      const observed: Array<LoginResponse | null> = [];
      const unsubscribe = subscribeApiSession((value) => observed.push(value));
      const originEpoch = captureApiSessionEpoch();
      vi.mocked(fetch).mockImplementation(async (input) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path === "/api/read") return response(401, { error: { message: "Expired" } });
        if (path === "/api/auth/refresh") return refresh.promise;
        if (path === "/api/auth/login") return login.promise;
        throw new Error(`Unexpected request: ${path}`);
      });
      try {
        const reading = apiRequest("/api/read", "company-access").catch((error: unknown) => error);
        await vi.waitFor(() => expect(paths).toEqual(["/api/read", "/api/auth/refresh"]));
        const switching = switchApiCompany("company-b", "test-only-password", originEpoch);
        refresh.resolve(
          refreshStatus === 200
            ? response(200, { data: companySession("company-a", "rotated-a") })
            : response(401, { error: { message: "Refresh rejected" } })
        );
        expect(await reading).toMatchObject({ reason: "BLOCKED" });
        await vi.waitFor(() => expect(paths.at(-1)).toBe("/api/auth/login"));
        expect(captureApiSessionEpoch()).toBe(originEpoch);
        expect(observed).not.toContain(null);
        const target = companySession("company-b", "target-b");
        login.resolve(response(200, { data: target }));
        await expect(switching).resolves.toEqual(target);
        expect(paths).toEqual(["/api/read", "/api/auth/refresh", "/api/auth/login"]);
        expect(observed.at(-1)).toEqual(target);
        expect(observed).not.toContain(null);
        expect(isApiReauthenticationRequired()).toBe(false);
      } finally {
        unsubscribe();
      }
    }
  );

  it("excludes switching for the complete unsafe fetch, refresh and retry lifetime", async () => {
    const first = pending<Response>();
    const refresh = pending<Response>();
    const retry = pending<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(refresh.promise)
      .mockReturnValueOnce(retry.promise);
    const epoch = captureApiSessionEpoch();
    const writing = apiRequest("/api/activities/shared", "company-access", {
      method: "PATCH",
      body: "{}"
    });
    await expect(switchApiCompany("company-b", "test-only-password", epoch)).rejects.toMatchObject({
      reason: "BLOCKED"
    });
    first.resolve(response(401, { error: { message: "Expired" } }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await expect(switchApiCompany("company-b", "test-only-password", epoch)).rejects.toMatchObject({
      reason: "BLOCKED"
    });
    refresh.resolve(response(200, { data: companySession("company-a", "rotated-a") }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await expect(switchApiCompany("company-b", "test-only-password", epoch)).rejects.toMatchObject({
      reason: "BLOCKED"
    });
    retry.resolve(response(200, { data: "saved" }));
    await expect(writing).resolves.toBe("saved");
    vi.mocked(fetch).mockResolvedValueOnce(response(200, { data: companySession("company-b") }));
    await switchApiCompany("company-b", "test-only-password", epoch);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("reserves synchronously against duplicate switches, protected writes and logout", async () => {
    const login = pending<Response>();
    vi.mocked(fetch).mockReturnValueOnce(login.promise);
    const epoch = captureApiSessionEpoch();
    const switching = switchApiCompany("company-b", "test-only-password", epoch);
    await expect(switchApiCompany("company-b", "second-password", epoch)).rejects.toMatchObject({
      reason: "BLOCKED"
    });
    await expect(
      apiRequest("/api/activities", undefined, { method: "POST" })
    ).rejects.toMatchObject({ reason: "BLOCKED" });
    await expect(
      apiRequest("/api/auth/logout", undefined, { method: "POST" })
    ).rejects.toMatchObject({ reason: "BLOCKED" });
    login.resolve(response(200, { data: companySession("company-b") }));
    await switching;
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    "transport",
    "abort",
    "malformed",
    "user",
    "email",
    "mode",
    "permissions",
    "company",
    "metadata",
    "projection",
    "server"
  ])(
    "fails closed for an uncertain %s result and prevents same-tab reload restoration",
    async (failure) => {
      const controller = new AbortController();
      const target = companySession("company-b");
      if (failure === "user") target.user.id = "other-user";
      if (failure === "email") target.user.email = "other@example.com";
      if (failure === "mode") target.authenticationMode = "demo";
      if (failure === "permissions") delete target.user.permissions;
      if (failure === "company") target.user.companyId = "company-a";
      if (failure === "metadata")
        target.user.company = { ...companies[1], timezone: "Invalid/Zone" };
      if (failure === "projection") target.user.companies = [companies[1], companies[1]];
      vi.mocked(fetch).mockImplementationOnce(async () => {
        if (failure === "transport") throw new Error("Transport failed");
        if (failure === "abort") controller.abort();
        return response(
          failure === "server" ? 500 : 200,
          failure === "malformed" ? {} : { data: target }
        );
      });
      await expect(
        switchApiCompany(
          "company-b",
          "test-only-password",
          captureApiSessionEpoch(),
          controller.signal
        )
      ).rejects.toMatchObject({ reason: "UNCERTAIN" });
      expect(captureApiSessionEpoch()).toBeNull();
      expect(isApiReauthenticationRequired()).toBe(true);
      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        "shiftflow.reauthentication-required",
        "1"
      );
      expect(sessionStorage.setItem).toHaveBeenCalledOnce();
      vi.resetModules();
      const reloaded = await import("./api");
      await expect(reloaded.restoreApiSession()).rejects.toMatchObject({ reason: "UNCERTAIN" });
      await expect(
        reloaded.apiRequest("/api/auth/demo", undefined, { method: "POST" })
      ).rejects.toMatchObject({ reason: "UNCERTAIN" });
      expect(fetch).toHaveBeenCalledOnce();
      vi.mocked(fetch).mockResolvedValueOnce(
        response(200, {
          data: target.user.id === "other-user" ? companySession() : companySession("company-b")
        })
      );
      await reloaded.reauthenticateApiSession("user@example.com", "fresh-test-password");
      expect(reloaded.isApiReauthenticationRequired()).toBe(false);
      expect(reloaded.captureApiSessionEpoch()).not.toBeNull();
      reloaded.clearApiSession();
    }
  );

  it("rechecks a queued switch origin before fetch when a leading refresh loses its generation", async () => {
    const refresh = pending<Response>();
    vi.mocked(fetch).mockReturnValueOnce(refresh.promise);
    const refreshing = restoreApiSession().catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const switching = switchApiCompany(
      "company-b",
      "test-only-password",
      captureApiSessionEpoch()
    ).catch((error: unknown) => error);
    setApiSession(companySession("company-b", "independent-b"));
    const epochB = captureApiSessionEpoch();
    refresh.resolve(response(200, { data: companySession("company-a", "stale-refresh") }));
    expect(await refreshing).toBeInstanceOf(ApiError);
    expect(await switching).toMatchObject({ reason: "BLOCKED" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(captureApiSessionEpoch()).toBe(epochB);
    expect(isApiReauthenticationRequired()).toBe(false);
  });

  it("does not install or clear a newer session after a late login response", async () => {
    const login = pending<Response>();
    vi.mocked(fetch).mockReturnValueOnce(login.promise);
    const switching = switchApiCompany("company-b", "test-only-password", captureApiSessionEpoch());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    setApiSession(companySession("company-b", "independently-established"));
    const newerEpoch = captureApiSessionEpoch();
    login.resolve(response(200, { data: companySession("company-b", "late-response") }));
    await expect(switching).rejects.toMatchObject({ reason: "UNCERTAIN" });
    expect(captureApiSessionEpoch()).toBe(newerEpoch);
    expect(isApiReauthenticationRequired()).toBe(true);
  });

  it("rejects stale origins, unprojected destinations and missing storage before HTTP", async () => {
    const oldEpoch = captureApiSessionEpoch();
    setApiSession(companySession());
    await expect(
      switchApiCompany("company-b", "test-only-password", oldEpoch)
    ).rejects.toMatchObject({ reason: "BLOCKED" });
    await expect(
      switchApiCompany("company-z", "test-only-password", captureApiSessionEpoch())
    ).rejects.toMatchObject({ reason: "BLOCKED" });
    vi.mocked(sessionStorage.setItem).mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    await expect(
      switchApiCompany("company-b", "test-only-password", captureApiSessionEpoch())
    ).rejects.toMatchObject({ reason: "BLOCKED" });
    expect(fetch).not.toHaveBeenCalled();
    expect(captureApiSessionEpoch()).not.toBeNull();
  });

  it("retains an existing reauthentication requirement when another password is rejected", async () => {
    sessionStorage.setItem("shiftflow.reauthentication-required", "1");
    clearApiSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      response(401, { error: { message: "Invalid credentials" } })
    );
    await expect(
      reauthenticateApiSession("user@example.com", "test-only-password")
    ).rejects.toMatchObject({ reason: "REJECTED" });
    expect(isApiReauthenticationRequired()).toBe(true);
    expect(captureApiSessionEpoch()).toBeNull();
  });
});

describe("queryString", () => {
  it("bounds search input and carries explicit server pagination", () => {
    const value = queryString(
      {
        clientId: "",
        teamId: "",
        shiftId: "",
        assigneeId: "",
        priority: "",
        status: "",
        attention: "",
        from: "",
        to: ""
      },
      `  ${"x".repeat(220)}  `,
      { page: 3, pageSize: 12 }
    );
    const params = new URLSearchParams(value.slice(1));

    expect(params.get("search")).toHaveLength(200);
    expect(params.get("page")).toBe("3");
    expect(params.get("pageSize")).toBe("12");
  });
});
