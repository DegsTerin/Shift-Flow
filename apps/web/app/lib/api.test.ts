// en-GB: Exercises the shared API client so authentication recovery remains bounded, single-flight and observable.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse } from "./types";
import {
  ApiError,
  apiRequest,
  captureApiSessionEpoch,
  clearApiSession,
  restoreApiSession,
  settleApiSessionOperation,
  setApiSession,
  subscribeApiSession
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

  it("uses the browser-wide refresh lock when available", async () => {
    const lockRequest = vi.fn(async (_name: string, callback: () => Promise<LoginResponse>) =>
      callback()
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    vi.mocked(fetch).mockResolvedValue(response(200, { data: session("restored-access-token") }));

    await restoreApiSession();

    expect(lockRequest).toHaveBeenCalledWith("shiftflow-auth-refresh", expect.any(Function));
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
