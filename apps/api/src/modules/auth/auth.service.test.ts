// en-GB: Exercises authentication rules so tenant, credential and token lifecycle regressions are detected automatically.
import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { LoginDto } from "./auth.dto.js";
import { PortfolioSessionCapacityError, type AuthRepository } from "./auth.repository.js";
import { logger } from "../../shared/observability/logger.js";
import { env } from "../../shared/config/env.js";
import {
  AuthenticationRequestCancelledError,
  authenticationBackoffMs,
  LoginFailureAuditGate,
  LoginFailureDelayGate,
  LoginVerificationGate
} from "./login-verification-gate.js";

const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 60_000);

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function deferredResult<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function membership(companyId: string, isDefault = false) {
  return {
    companyId,
    isDefault,
    deletedAt: null,
    company: { status: "ACTIVE", deletedAt: null }
  };
}

function assignment(
  companyId: string,
  resource = "dashboard",
  action = "read",
  overrides: Record<string, unknown> = {}
) {
  return {
    companyId,
    clientId: null,
    teamId: null,
    startsAt: past,
    endsAt: null,
    deletedAt: null,
    company: { status: "ACTIVE", deletedAt: null },
    role: {
      companyId,
      scope: "COMPANY",
      isActive: true,
      deletedAt: null,
      permissions: [
        {
          companyId,
          permission: { companyId, resource, action, deletedAt: null }
        }
      ]
    },
    ...overrides
  };
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: "stored-bcrypt-password-hash",
    displayName: "Jane Doe",
    status: "ACTIVE",
    deletedAt: null,
    passwordChangedAt: past,
    companies: [membership("company-a", true), membership("company-b")],
    roleAssignments: [assignment("company-b")],
    ...overrides
  };
}

function loginCredential(overrides: Record<string, unknown> = {}) {
  const user = activeUser(overrides);
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    passwordChangedAt: user.passwordChangedAt
  };
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    findLoginCredentialByEmail: vi.fn().mockResolvedValue(loginCredential()),
    findUserByEmail: vi.fn().mockResolvedValue(activeUser()),
    findLoginAttempt: vi.fn().mockResolvedValue(null),
    createRefreshToken: vi.fn().mockResolvedValue(true),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
    recordFailedLogin: vi.fn().mockResolvedValue({ failedCount: 1, lockedUntil: null }),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    rotateRefreshToken: vi.fn().mockResolvedValue("ROTATED"),
    revokeRefreshToken: vi.fn().mockResolvedValue(true),
    revokeActiveRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
    deletePortfolioRefreshToken: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

function request(ipAddress = "127.0.0.1") {
  return {
    context: {
      requestId: "request-1",
      userAgent: "test-agent",
      ipAddress
    }
  } as ApiRequest;
}

function refreshRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "refresh-1",
    userId: "user-1",
    companyId: "company-b",
    sessionKind: "PASSWORD",
    familyId: "00000000-0000-4000-8000-000000000001",
    expiresAt: future,
    revokedAt: null,
    createdAt: new Date(past.getTime() + 1),
    user: activeUser(),
    ...overrides
  };
}

describe("AuthService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the selected company and only its current company-wide permissions", async () => {
    const otherCompany = assignment("company-a", "users", "write");
    const limited = assignment("company-b", "activities", "write", { clientId: "client-a" });
    const expired = assignment("company-b", "reports", "read", { endsAt: past });
    const inactiveRole = assignment("company-b", "rbac", "write", {
      role: {
        companyId: "company-b",
        scope: "COMPANY",
        isActive: false,
        deletedAt: null,
        permissions: [
          {
            companyId: "company-b",
            permission: {
              companyId: "company-b",
              resource: "rbac",
              action: "write",
              deletedAt: null
            }
          }
        ]
      }
    });
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(
        activeUser({
          roleAssignments: [
            assignment("company-b"),
            assignment("company-b"),
            otherCompany,
            limited,
            expired,
            inactiveRole
          ]
        })
      )
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const input: LoginDto = {
      email: "user@example.com",
      password: "test-login-password",
      companyId: "company-b"
    };
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    const result = await service.login(request(), input);

    expect(result.user).toMatchObject({
      companyId: "company-b",
      permissions: ["dashboard:read"]
    });
    expect(mockRepository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        expiresAt: expect.any(Date),
        tokenHash: expect.any(String)
      }),
      {
        userId: "user-1",
        companyId: "company-b",
        sessionKind: "PASSWORD",
        passwordChangedAt: past
      },
      {
        sessionKind: "PASSWORD",
        emailHash: expect.any(String),
        ipHash: expect.any(String),
        userId: "user-1",
        companyId: "company-b",
        requestId: "request-1",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent"
      }
    );
  });

  it("does not turn post-session bookkeeping failures into an ambiguous login retry", async () => {
    const mockRepository = repository({
      updateLastLogin: vi.fn().mockRejectedValue(new Error("last-login write failed"))
    });
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const service = new AuthService(mockRepository as unknown as AuthRepository);
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1", companyId: "company-a" } });

    expect(errorLog).toHaveBeenCalledWith(
      "authentication_last_login_update_failed",
      expect.objectContaining({ userId: "user-1" })
    );
  });

  it("opens a loopback demo session with the configured user's current authority", async () => {
    const mockRepository = repository();
    const service = new AuthService(mockRepository as unknown as AuthRepository, {
      enabled: true,
      email: "demo@shiftflow.local"
    });

    const result = await service.openDemoSession(request());

    expect(mockRepository.findUserByEmail).toHaveBeenCalledWith("demo@shiftflow.local");
    expect(result.user).toMatchObject({
      id: "user-1",
      companyId: "company-a",
      permissions: []
    });
    expect(mockRepository.createRefreshToken).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        sessionKind: "DEMO",
        userId: "user-1",
        companyId: "company-a"
      })
    );
  });

  it("does not expose demo access when disabled or requested outside loopback", async () => {
    const mockRepository = repository();
    const disabled = new AuthService(mockRepository as unknown as AuthRepository, {
      enabled: false,
      email: "demo@shiftflow.local"
    });
    const remote = new AuthService(mockRepository as unknown as AuthRepository, {
      enabled: true,
      email: "demo@shiftflow.local"
    });

    await expect(disabled.openDemoSession(request())).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    await expect(
      remote.openDemoSession({
        context: { requestId: "request-remote", ipAddress: "192.0.2.10" }
      } as ApiRequest)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it("opens public portfolio access remotely with only non-destructive operational permissions", async () => {
    const portfolioEmail = "observador.executivo@shiftflow.local";
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(
        activeUser({
          email: portfolioEmail,
          roleAssignments: [
            assignment("company-a", "*", "*"),
            assignment("company-a", "dashboard", "read"),
            assignment("company-a", "clients", "read"),
            assignment("company-a", "teams", "read"),
            assignment("company-a", "shifts", "read"),
            assignment("company-a", "activities", "read"),
            assignment("company-a", "comments", "read"),
            assignment("company-a", "notifications", "read"),
            assignment("company-a", "reports", "read"),
            assignment("company-a", "users", "read"),
            assignment("company-a", "rbac", "write"),
            assignment("company-a", "activities", "delete")
          ]
        })
      )
    });
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      { enabled: false, email: "demo@shiftflow.local" },
      { enabled: true, email: portfolioEmail }
    );
    const remoteRequest = {
      context: {
        requestId: "request-portfolio",
        userAgent: "portfolio-agent",
        ipAddress: "192.0.2.10"
      }
    } as ApiRequest;

    const result = await service.openPortfolioSession(remoteRequest);

    expect(mockRepository.findUserByEmail).toHaveBeenCalledWith(portfolioEmail);
    expect(result.refreshToken).toMatch(/^portfolio\./);
    expect(mockRepository.rotateRefreshToken).not.toHaveBeenCalled();
    expect(result.user).toMatchObject({
      email: portfolioEmail,
      companyId: "company-a",
      permissions: [
        "dashboard:read",
        "clients:read",
        "teams:read",
        "shifts:read",
        "activities:read",
        "comments:read",
        "notifications:read",
        "reports:read"
      ]
    });
    expect(result.user.permissions).not.toContain("*:*");
    expect(result.user.permissions).not.toContain("users:read");
    expect(result.user.permissions).not.toContain("rbac:write");
    expect(result.user.permissions).not.toContain("activities:delete");
    expect(mockRepository.createRefreshToken).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        sessionKind: "PORTFOLIO",
        userId: "user-1",
        companyId: "company-a",
        ipAddress: "192.0.2.10"
      })
    );
  });

  it("returns bounded retry guidance when the public portfolio pool is full", async () => {
    const portfolioEmail = "observador.executivo@shiftflow.local";
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(
        activeUser({
          email: portfolioEmail,
          roleAssignments: [assignment("company-a", "dashboard", "read")]
        })
      ),
      createRefreshToken: vi.fn().mockRejectedValue(new PortfolioSessionCapacityError(45))
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository, undefined, {
      enabled: true,
      email: portfolioEmail
    });

    await expect(service.openPortfolioSession(request("192.0.2.10"))).rejects.toMatchObject({
      code: "AUTHENTICATION_BUSY",
      statusCode: 429,
      retryAfterSeconds: 45
    });
    expect(mockRepository.updateLastLogin).not.toHaveBeenCalled();
  });

  it("keeps portfolio access undiscoverable when disabled", async () => {
    const mockRepository = repository();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      { enabled: false, email: "demo@shiftflow.local" },
      { enabled: false, email: "observador.executivo@shiftflow.local" }
    );

    await expect(service.openPortfolioSession(request())).rejects.toMatchObject({
      code: "NOT_FOUND"
    });

    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it("preserves the public portfolio permission boundary when its session refreshes", async () => {
    const portfolioEmail = "observador.executivo@shiftflow.local";
    const portfolioUser = activeUser({
      email: portfolioEmail,
      roleAssignments: [
        assignment("company-a", "*", "*"),
        assignment("company-a", "dashboard", "read"),
        assignment("company-a", "activities", "read"),
        assignment("company-a", "users", "delete")
      ]
    });
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(
        refreshRecord({
          companyId: "company-a",
          sessionKind: "PORTFOLIO",
          user: portfolioUser
        })
      )
    });
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      { enabled: false, email: "demo@shiftflow.local" },
      { enabled: true, email: portfolioEmail }
    );

    const result = await service.refresh(request(), "portfolio.portfolio-refresh-token");

    expect(result.user.permissions).toEqual(["dashboard:read", "activities:read"]);
    expect(result.refreshToken).toMatch(/^portfolio\./);
    expect(result.user.permissions).not.toContain("*:*");
    expect(result.user.permissions).not.toContain("users:delete");
  });

  it("does not expose a session when the credential changes during login", async () => {
    const mockRepository = repository({
      createRefreshToken: vi.fn().mockResolvedValue(false)
    });
    const delay = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      delay,
      new LoginFailureAuditGate()
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password",
        companyId: "company-b"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockRepository.updateLastLogin).not.toHaveBeenCalled();
    expect(delay).toHaveBeenCalledOnce();
    expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(900);
  });

  it("rejects a pre-aborted login without lookup, bcrypt or failure accounting", async () => {
    const mockRepository = repository();
    const delay = vi.fn().mockResolvedValue(undefined);
    const failureAudit = { takeAggregate: vi.fn().mockReturnValue(undefined) };
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      delay,
      failureAudit,
      failureDelay
    );
    const compare = vi.spyOn(bcrypt, "compare");
    const cancellation = new AbortController();
    cancellation.abort();

    await expect(
      service.login(
        request(),
        { email: "user@example.com", password: "correct-password" },
        cancellation.signal
      )
    ).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);

    expect(mockRepository.findLoginCredentialByEmail).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    expect(failureDelay.recordFailure).not.toHaveBeenCalled();
    expect(failureAudit.takeAggregate).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });

  it("holds admission until an abandoned credential lookup settles", async () => {
    const abandonedLookup = deferredResult<ReturnType<typeof loginCredential>>();
    const mockRepository = repository({
      findLoginCredentialByEmail: vi
        .fn()
        .mockImplementationOnce(async () => abandonedLookup.promise)
        .mockResolvedValue(loginCredential())
    });
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const delay = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 1, 1),
      delay,
      new LoginFailureAuditGate(),
      failureDelay
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const cancellation = new AbortController();
    const abandoned = service.login(
      request(),
      { email: "user@example.com", password: "correct-password" },
      cancellation.signal
    );
    await vi.waitFor(() =>
      expect(mockRepository.findLoginCredentialByEmail).toHaveBeenCalledOnce()
    );

    cancellation.abort();
    let settled = false;
    void abandoned.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "correct-password"
      })
    ).rejects.toMatchObject({ statusCode: 429, code: "AUTHENTICATION_BUSY" });

    abandonedLookup.resolve(loginCredential());
    await expect(abandoned).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "correct-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1" } });

    expect(bcrypt.compare).toHaveBeenCalledOnce();
    expect(failureDelay.recordFailure).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });

  it("observes a rejected abandoned credential lookup before recovering admission", async () => {
    const abandonedLookup = deferredResult<ReturnType<typeof loginCredential>>();
    const mockRepository = repository({
      findLoginCredentialByEmail: vi
        .fn()
        .mockImplementationOnce(async () => abandonedLookup.promise)
        .mockResolvedValue(loginCredential())
    });
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const delay = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 1, 1),
      delay,
      new LoginFailureAuditGate(),
      failureDelay
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const cancellation = new AbortController();
    const abandoned = service.login(
      request(),
      { email: "user@example.com", password: "correct-password" },
      cancellation.signal
    );
    await vi.waitFor(() =>
      expect(mockRepository.findLoginCredentialByEmail).toHaveBeenCalledOnce()
    );

    cancellation.abort();
    abandonedLookup.reject(new Error("synthetic abandoned lookup failure"));
    await expect(abandoned).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "correct-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1" } });

    expect(bcrypt.compare).toHaveBeenCalledOnce();
    expect(failureDelay.recordFailure).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });

  it("waits for active bcrypt to settle and then cancels before authority hydration", async () => {
    const passwordResult = deferredResult<boolean>();
    const mockRepository = repository();
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 1, 1),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(),
      failureDelay
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => passwordResult.promise);
    const cancellation = new AbortController();
    const login = service.login(
      request(),
      { email: "user@example.com", password: "correct-password" },
      cancellation.signal
    );
    await vi.waitFor(() => expect(bcrypt.compare).toHaveBeenCalledOnce());

    cancellation.abort();
    let settled = false;
    void login.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    passwordResult.resolve(true);
    await expect(login).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(failureDelay.recordFailure).not.toHaveBeenCalled();
  });

  it("checks cancellation immediately after bcrypt before authority hydration", async () => {
    const cancellation = new AbortController();
    const verificationGate = {
      run: async <T>(
        _key: string,
        operation: (
          withPasswordBudget: <TResult>(operation: () => Promise<TResult>) => Promise<TResult>
        ) => Promise<T>
      ) =>
        operation(async (passwordOperation) => {
          const result = await passwordOperation();
          cancellation.abort();
          return result;
        })
    };
    const mockRepository = repository();
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      verificationGate,
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(),
      failureDelay
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    await expect(
      service.login(
        request(),
        { email: "user@example.com", password: "correct-password" },
        cancellation.signal
      )
    ).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);

    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(failureDelay.recordFailure).not.toHaveBeenCalled();
  });

  it("lets an atomic session write settle before suppressing a cancelled response", async () => {
    const sessionWrite = deferredResult<boolean>();
    const mockRepository = repository({
      createRefreshToken: vi.fn().mockImplementation(async () => sessionWrite.promise)
    });
    const failureAudit = { takeAggregate: vi.fn().mockReturnValue(undefined) };
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const successTelemetry = { takeAggregate: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      failureAudit,
      failureDelay,
      successTelemetry
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const cancellation = new AbortController();
    const login = service.login(
      request(),
      { email: "user@example.com", password: "correct-password" },
      cancellation.signal
    );
    await vi.waitFor(() => expect(mockRepository.createRefreshToken).toHaveBeenCalledOnce());

    cancellation.abort();
    let settled = false;
    void login.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    sessionWrite.resolve(true);
    await expect(login).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    expect(mockRepository.updateLastLogin).toHaveBeenCalledWith("user-1");
    expect(successTelemetry.takeAggregate).toHaveBeenCalledOnce();
    expect(failureDelay.recordFailure).not.toHaveBeenCalled();
    expect(failureAudit.takeAggregate).not.toHaveBeenCalled();
  });

  it("cancels a failed-response delay after recording the completed comparison once", async () => {
    const delay = vi.fn(
      async (_milliseconds: number, signal?: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            signal?.removeEventListener("abort", onAbort);
            reject(new AuthenticationRequestCancelledError());
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          if (signal?.aborted) onAbort();
          void resolve;
        })
    );
    const failureAudit = { takeAggregate: vi.fn().mockReturnValue(undefined) };
    const failureDelay = { recordFailure: vi.fn().mockReturnValue(undefined) };
    const mockRepository = repository();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 1, 1),
      delay,
      failureAudit,
      failureDelay
    );
    vi.spyOn(bcrypt, "compare")
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);
    const cancellation = new AbortController();
    const abandoned = service.login(
      request(),
      { email: "user@example.com", password: "wrong-password" },
      cancellation.signal
    );
    await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());

    cancellation.abort();
    await expect(abandoned).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "correct-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1" } });

    expect(failureDelay.recordFailure).toHaveBeenCalledOnce();
    expect(failureAudit.takeAggregate).toHaveBeenCalledOnce();
  });

  it("clears the production failure-response timer when the transport is cancelled", async () => {
    vi.useFakeTimers();
    const cancellation = new AbortController();
    let login: Promise<unknown> | undefined;
    try {
      const failureRecorded = deferred();
      const mockRepository = repository();
      const failureAudit = { takeAggregate: vi.fn().mockReturnValue(undefined) };
      const failureDelay = {
        recordFailure: vi.fn().mockImplementation(() => {
          failureRecorded.resolve();
          return new Date(Date.now() + 30_000);
        })
      };
      const service = new AuthService(
        mockRepository as unknown as AuthRepository,
        undefined,
        undefined,
        new LoginVerificationGate(),
        undefined,
        failureAudit,
        failureDelay
      );
      vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);

      login = service.login(
        request(),
        { email: "user@example.com", password: "wrong-password" },
        cancellation.signal
      );
      await failureRecorded.promise;
      await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));

      cancellation.abort();
      await expect(login).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      cancellation.abort();
      await login?.catch(() => undefined);
      vi.useRealTimers();
    }
  });

  it("maps refresh-token persistence failure to the same public failure as a wrong password", async () => {
    const sessionFailure = new Error("synthetic refresh-token persistence failure");
    const wrongPasswordRepository = repository();
    const sessionFailureRepository = repository({
      createRefreshToken: vi.fn().mockRejectedValue(sessionFailure)
    });
    const wrongPasswordService = new AuthService(
      wrongPasswordRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined)
    );
    const sessionFailureService = new AuthService(
      sessionFailureRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined)
    );
    const compare = vi.spyOn(bcrypt, "compare");
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    compare.mockImplementationOnce(async () => false);
    const wrongPassword = await wrongPasswordService
      .login(request(), {
        email: "user@example.com",
        password: "wrong-password",
        companyId: "company-b"
      })
      .catch((failure: unknown) => failure);
    compare.mockImplementationOnce(async () => true);
    const sessionFailureResult = await sessionFailureService
      .login(request(), {
        email: "user@example.com",
        password: "correct-password",
        companyId: "company-b"
      })
      .catch((failure: unknown) => failure);

    const publicFailure = {
      code: "UNAUTHORIZED",
      message: "Invalid credentials",
      statusCode: 401
    };
    expect(wrongPassword).toMatchObject(publicFailure);
    expect(sessionFailureResult).toMatchObject(publicFailure);
    expect(sessionFailureRepository.updateLastLogin).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "authentication_session_issue_failed",
      expect.objectContaining({ userId: "user-1", companyId: "company-b", error: sessionFailure })
    );
  });

  it.each([
    { name: "companyless account", user: activeUser({ companies: [] }), companyId: undefined },
    { name: "invalid company", user: activeUser(), companyId: "company-not-linked" }
  ])("keeps $name inside the generic pre-session failure boundary", async ({ user, companyId }) => {
    const mockRepository = repository({ findUserByEmail: vi.fn().mockResolvedValue(user) });
    const delay = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      delay,
      new LoginFailureAuditGate(),
      new LoginFailureDelayGate()
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password",
        ...(companyId ? { companyId } : {})
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });

    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(mockRepository.findLoginAttempt).not.toHaveBeenCalled();
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "authentication_failures",
      expect.objectContaining({ attemptCount: 1 })
    );
    expect(warn.mock.calls[0]?.[1]).not.toHaveProperty("principalKind");
    expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(900);
  });

  it("uses one dummy bcrypt comparison and no principal-specific persistence for unknown input", async () => {
    const mockRepository = repository({
      findLoginCredentialByEmail: vi.fn().mockResolvedValue(null)
    });
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(),
      new LoginFailureDelayGate()
    );
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);

    await expect(
      service.login(request(), { email: "missing@example.com", password: "wrong-password" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockRepository.findLoginAttempt).not.toHaveBeenCalled();
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();
    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(compare).toHaveBeenCalledOnce();
    expect(compare).toHaveBeenCalledWith(
      "wrong-password",
      expect.stringMatching(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/)
    );
  });

  it("hydrates membership and authority only after the credential is valid", async () => {
    const mockRepository = repository();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(),
      new LoginFailureDelayGate()
    );
    vi.spyOn(bcrypt, "compare")
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "wrong-password"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "correct-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1" } });
    expect(mockRepository.findLoginCredentialByEmail).toHaveBeenCalledTimes(2);
    expect(mockRepository.findUserByEmail).toHaveBeenCalledOnce();
  });

  it("uses one real cost-12 bcrypt comparison for both known and unknown principals", async () => {
    const passwordHash = await bcrypt.hash("known-password", 12);
    const knownRepository = repository({
      findLoginCredentialByEmail: vi.fn().mockResolvedValue(loginCredential({ passwordHash }))
    });
    const unknownRepository = repository({
      findLoginCredentialByEmail: vi.fn().mockResolvedValue(null)
    });
    const compare = vi.spyOn(bcrypt, "compare");
    const delay = vi.fn().mockResolvedValue(undefined);

    for (const candidateRepository of [knownRepository, unknownRepository]) {
      const service = new AuthService(
        candidateRepository as unknown as AuthRepository,
        undefined,
        undefined,
        new LoginVerificationGate(),
        delay,
        new LoginFailureAuditGate(),
        new LoginFailureDelayGate()
      );
      await expect(
        service.login(request(), {
          email: "principal@example.com",
          password: "wrong-password"
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    expect(compare).toHaveBeenCalledTimes(2);
    expect(compare.mock.calls.map((call) => bcrypt.getRounds(call[1]))).toEqual([12, 12]);
  });

  it("keeps durable failure state at zero across thousands of attacker identities", async () => {
    const mockRepository = repository({
      findLoginCredentialByEmail: vi.fn().mockResolvedValue(null)
    });
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(60_000, () => 1_000),
      new LoginFailureDelayGate(256, new Uint8Array(32).fill(7), () => 1_000)
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    for (let index = 0; index < 2_000; index += 1) {
      await expect(
        service.login(request(), {
          email: `unknown-${index}@example.com`,
          password: "wrong-password"
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    expect(mockRepository.findLoginCredentialByEmail).toHaveBeenCalledTimes(2_000);
    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepository.findLoginAttempt).not.toHaveBeenCalled();
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("keeps known, unknown and company-selection failures on one controlled timing curve", async () => {
    vi.useFakeTimers();
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(bcrypt, "compare").mockImplementation(async (password) => password === "correct");

    async function measure(kind: "known" | "unknown" | "wrong-company" | "companyless") {
      vi.setSystemTime(new Date("2026-09-03T12:00:00.000Z"));
      const candidate =
        kind === "unknown"
          ? null
          : activeUser({
              id: `user-${kind}`,
              email: `${kind}@example.com`,
              ...(kind === "companyless" ? { companies: [] } : {})
            });
      const mockRepository = repository({
        findLoginCredentialByEmail: vi
          .fn()
          .mockResolvedValue(candidate ? loginCredential(candidate) : null),
        findUserByEmail: vi.fn().mockResolvedValue(candidate)
      });
      const delay = vi.fn().mockImplementation(async (milliseconds: number) => {
        vi.setSystemTime(Date.now() + milliseconds);
      });
      const service = new AuthService(
        mockRepository as unknown as AuthRepository,
        undefined,
        undefined,
        new LoginVerificationGate(),
        delay,
        new LoginFailureAuditGate(60_000, Date.now),
        new LoginFailureDelayGate(256, new Uint8Array(32).fill(5), Date.now)
      );
      const durations: number[] = [];

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const startedAt = Date.now();
        await expect(
          service.login(request(), {
            email: `${kind}@example.com`,
            password: kind === "known" || kind === "unknown" ? "wrong" : "correct",
            ...(kind === "wrong-company" ? { companyId: "company-not-linked" } : {})
          })
        ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        durations.push(Date.now() - startedAt);
      }

      expect(mockRepository.findLoginAttempt).not.toHaveBeenCalled();
      expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();
      return durations;
    }

    try {
      const known = await measure("known");
      const unknown = await measure("unknown");
      const wrongCompany = await measure("wrong-company");
      const companyless = await measure("companyless");

      expect(known).toEqual(
        Array.from({ length: 10 }, (_, index) =>
          authenticationBackoffMs(index + 1, env.AUTH_LOCKOUT_MAX_ATTEMPTS)
        )
      );
      expect(unknown).toEqual(known);
      expect(wrongCompany).toEqual(known);
      expect(companyless).toEqual(known);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits one bounded telemetry stream for password, demo and portfolio sessions", async () => {
    const telemetry = { takeAggregate: vi.fn().mockReturnValue(undefined) };
    const provisionedUser = activeUser({
      roleAssignments: [assignment("company-a", "dashboard", "read")]
    });
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(provisionedUser)
    });
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      { enabled: true, email: "demo@shiftflow.local" },
      { enabled: true, email: "portfolio@shiftflow.local" },
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(),
      new LoginFailureDelayGate(),
      telemetry
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    await service.openDemoSession(request());
    await service.openPortfolioSession(request());
    await service.login(request(), {
      email: "user@example.com",
      password: "correct-password"
    });

    expect(telemetry.takeAggregate).toHaveBeenCalledTimes(3);
    expect(mockRepository.createRefreshToken).toHaveBeenCalledTimes(3);
  });

  it("accepts a correct credential while an earlier same-identity failure is still delayed", async () => {
    const mockRepository = repository();
    const releaseDelay = deferred();
    const delay = vi.fn().mockImplementation(async () => releaseDelay.promise);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 8, 8),
      delay
    );
    const compare = vi
      .spyOn(bcrypt, "compare")
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);

    const hostile = service
      .login(request("198.51.100.10"), {
        email: "user@example.com",
        password: "wrong-password"
      })
      .then(
        () => undefined,
        (error: unknown) => error
      );
    await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());

    await expect(
      service.login(request("203.0.113.20"), {
        email: "user@example.com",
        password: "correct-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1" } });
    expect(compare).toHaveBeenCalledTimes(2);
    let hostileSettled = false;
    void hostile.finally(() => {
      hostileSettled = true;
    });
    await Promise.resolve();
    expect(hostileSettled).toBe(false);

    releaseDelay.resolve();
    await expect(hostile).resolves.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not let 128 delayed unknown flows retain bcrypt admission capacity", async () => {
    const releaseDelays = deferred();
    const mockRepository = repository({
      findLoginCredentialByEmail: vi
        .fn()
        .mockImplementation(async (email: string) =>
          email.startsWith("unknown-") ? null : loginCredential()
        )
    });
    const delay = vi.fn().mockImplementation(async () => releaseDelays.promise);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(4, 128, 128),
      delay
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async (password) => password === "correct");
    const hostile = Array.from({ length: 128 }, (_, index) =>
      service
        .login(request(), {
          email: `unknown-${index}@example.com`,
          password: "wrong"
        })
        .then(
          () => undefined,
          (error: unknown) => error
        )
    );
    await vi.waitFor(() => expect(delay).toHaveBeenCalledTimes(128));

    await expect(
      service.login(request(), { email: "user@example.com", password: "correct" })
    ).resolves.toMatchObject({ user: { id: "user-1" } });

    releaseDelays.resolve();
    const hostileResults = await Promise.all(hostile);
    expect(hostileResults).toHaveLength(128);
    expect(
      hostileResults.every(
        (result) =>
          typeof result === "object" &&
          result !== null &&
          "code" in result &&
          result.code === "UNAUTHORIZED"
      )
    ).toBe(true);
  });

  it("rejects a saturated bcrypt budget without durable failure-state mutation", async () => {
    const mockRepository = repository();
    const blocked = deferred();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 1, 1),
      vi.fn().mockResolvedValue(undefined)
    );
    vi.spyOn(bcrypt, "compare").mockImplementationOnce(async () => {
      await blocked.promise;
      return true;
    });
    const admitted = service.login(request(), {
      email: "user@example.com",
      password: "correct-password"
    });
    await vi.waitFor(() => expect(bcrypt.compare).toHaveBeenCalledOnce());

    await expect(
      service.login(request(), {
        email: "second@example.com",
        password: "correct-password"
      })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_BUSY", statusCode: 429 });
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();

    blocked.resolve();
    await admitted;
  });

  it("keeps legacy passwords above 72 UTF-8 bytes verifiable without rehashing", async () => {
    const legacyPassword = "é".repeat(37);
    const mockRepository = repository();
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const hash = vi.spyOn(bcrypt, "hash");
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(
      service.login(request(), { email: "user@example.com", password: legacyPassword })
    ).resolves.toMatchObject({ user: { id: "user-1" } });

    expect(new TextEncoder().encode(legacyPassword)).toHaveLength(74);
    expect(compare).toHaveBeenCalledWith(legacyPassword, "stored-bcrypt-password-hash");
    expect(hash).not.toHaveBeenCalled();
  });

  it("rotates a valid refresh token in its persisted company", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord())
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    const result = await service.refresh(request(), "valid-refresh-token");

    expect(result.user).toMatchObject({
      companyId: "company-b",
      permissions: ["dashboard:read"]
    });
    expect(mockRepository.rotateRefreshToken).toHaveBeenCalledWith(
      "refresh-1",
      expect.objectContaining({
        familyId: "00000000-0000-4000-8000-000000000001",
        expiresAt: expect.any(Date),
        tokenHash: expect.any(String)
      }),
      {
        userId: "user-1",
        companyId: "company-b",
        sessionKind: "PASSWORD",
        passwordChangedAt: past
      }
    );
  });

  it("preserves a valid token when refresh rotation is attempted too soon", async () => {
    const stored = refreshRecord();
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(stored),
      rotateRefreshToken: vi.fn().mockResolvedValue("TOO_SOON")
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "too-recent-refresh-token")).resolves.toMatchObject({
      refreshToken: "too-recent-refresh-token",
      expiresAt: stored.expiresAt,
      user: { id: "user-1", companyId: "company-b" }
    });

    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("accepts an unrevoked token created in the same millisecond as the current credential", async () => {
    const passwordChangedAt = new Date("2026-08-27T12:00:00.123Z");
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(
        refreshRecord({
          createdAt: passwordChangedAt,
          user: activeUser({ passwordChangedAt })
        })
      )
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "same-millisecond-token")).resolves.toMatchObject({
      user: { id: "user-1", companyId: "company-b" }
    });

    expect(mockRepository.rotateRefreshToken).toHaveBeenCalledWith(
      "refresh-1",
      expect.any(Object),
      {
        userId: "user-1",
        companyId: "company-b",
        sessionKind: "PASSWORD",
        passwordChangedAt
      }
    );
  });

  it.each([
    ["inactive user", { user: activeUser({ status: "INACTIVE" }) }],
    ["deleted user", { user: activeUser({ deletedAt: past }) }],
    ["missing company", { companyId: null }],
    ["removed membership", { user: activeUser({ companies: [membership("company-a", true)] }) }],
    [
      "inactive company",
      {
        user: activeUser({
          companies: [
            membership("company-a", true),
            {
              ...membership("company-b"),
              company: { status: "SUSPENDED", deletedAt: null }
            }
          ]
        })
      }
    ]
  ])("rejects refresh for an invalid session lifecycle: %s", async (_label, invalid) => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord(invalid))
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "invalid-refresh-token")).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });

    expect(mockRepository.rotateRefreshToken).not.toHaveBeenCalled();
    if ("companyId" in invalid && invalid.companyId === null) {
      expect(mockRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
      expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
    } else {
      expect(mockRepository.revokeActiveRefreshTokenFamily).toHaveBeenCalledWith(
        "user-1",
        "company-b",
        "PASSWORD",
        "00000000-0000-4000-8000-000000000001"
      );
    }
  });

  it("invalidates refresh tokens issued before a password change", async () => {
    const passwordChangedAt = new Date();
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(
        refreshRecord({
          createdAt: new Date(passwordChangedAt.getTime() - 1),
          user: activeUser({ passwordChangedAt })
        })
      )
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "old-refresh-token")).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });

    expect(mockRepository.rotateRefreshToken).not.toHaveBeenCalled();
    expect(mockRepository.revokeActiveRefreshTokenFamily).toHaveBeenCalledWith(
      "user-1",
      "company-b",
      "PASSWORD",
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("fails closed and revokes active tokens when atomic refresh consumption loses", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord()),
      rotateRefreshToken: vi.fn().mockResolvedValue("REUSED")
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "racing-refresh-token")).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });

    expect(mockRepository.revokeActiveRefreshTokenFamily).toHaveBeenCalledWith(
      "user-1",
      "company-b",
      "PASSWORD",
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("does not revoke current sessions when the refresh token expires while rotation waits", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord()),
      rotateRefreshToken: vi.fn().mockResolvedValue("EXPIRED")
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "just-expired-refresh-token")).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });

    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("conditionally revokes a refresh token during logout", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord())
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.logout("valid-refresh-token")).resolves.toEqual({ loggedOut: true });

    expect(mockRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("revokes active successors when logout loses a concurrent token-consumption race", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord()),
      revokeRefreshToken: vi.fn().mockResolvedValue(false)
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await service.logout("racing-refresh-token");

    expect(mockRepository.revokeActiveRefreshTokenFamily).toHaveBeenCalledWith(
      "user-1",
      "company-b",
      "PASSWORD",
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("returns success without persistence when no refresh token is supplied", async () => {
    const mockRepository = repository();
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.logout(undefined)).resolves.toEqual({ loggedOut: true });

    expect(mockRepository.findRefreshToken).not.toHaveBeenCalled();
    expect(mockRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("revokes active refresh tokens when a revoked refresh token is reused", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(
        refreshRecord({
          companyId: "company-a",
          revokedAt: new Date(),
          user: activeUser({ roleAssignments: [] })
        })
      )
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "reused-refresh-token")).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
    expect(mockRepository.revokeActiveRefreshTokenFamily).toHaveBeenCalledWith(
      "user-1",
      "company-a",
      "PASSWORD",
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("limits portfolio reuse revocation to portfolio sessions", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(
        refreshRecord({
          companyId: "company-a",
          sessionKind: "PORTFOLIO",
          revokedAt: new Date(),
          user: activeUser({ roleAssignments: [] })
        })
      )
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(
      service.refresh(request(), "portfolio.reused-refresh-token")
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockRepository.revokeActiveRefreshTokenFamily).toHaveBeenCalledWith(
      "user-1",
      "company-a",
      "PORTFOLIO",
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("rejects a legacy portfolio token backfilled as password without class-wide revocation", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord({ sessionKind: "PASSWORD" }))
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(
      service.refresh(request(), "portfolio.legacy-refresh-token")
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("deletes only one portfolio visitor on repeated logout", async () => {
    const mockRepository = repository({
      findRefreshToken: vi
        .fn()
        .mockResolvedValueOnce(refreshRecord({ sessionKind: "PORTFOLIO" }))
        .mockResolvedValueOnce(null)
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await service.logout("portfolio.racing-refresh-token");
    await service.logout("portfolio.racing-refresh-token");

    expect(mockRepository.deletePortfolioRefreshToken).toHaveBeenCalledOnce();
    expect(mockRepository.deletePortfolioRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("does not revoke a class when legacy portfolio logout conflicts with its backfilled kind", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord({ sessionKind: "PASSWORD" })),
      revokeRefreshToken: vi.fn().mockResolvedValue(false)
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await service.logout("portfolio.legacy-racing-refresh-token");

    expect(mockRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("does not let an expired revoked token affect current sessions", async () => {
    const mockRepository = repository({
      findRefreshToken: vi
        .fn()
        .mockResolvedValue(refreshRecord({ expiresAt: past, revokedAt: past }))
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.refresh(request(), "expired-revoked-token")).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
    await expect(service.logout("expired-revoked-token")).resolves.toEqual({ loggedOut: true });

    expect(mockRepository.revokeRefreshToken).not.toHaveBeenCalled();
    expect(mockRepository.revokeActiveRefreshTokenFamily).not.toHaveBeenCalled();
  });
});
