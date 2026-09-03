// en-GB: Exercises authentication rules so tenant, credential and token lifecycle regressions are detected automatically.
import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { LoginDto } from "./auth.dto.js";
import { PortfolioSessionCapacityError, type AuthRepository } from "./auth.repository.js";
import { logger } from "../../shared/observability/logger.js";
import {
  authenticationBackoffMs,
  LoginFailureAuditGate,
  LoginSuccessTelemetryGate,
  LoginVerificationGate,
  UnknownLoginBackoffGate
} from "./login-verification-gate.js";

const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 60_000);

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

function repository(overrides: Record<string, unknown> = {}) {
  return {
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

  it("does not create a companyless session", async () => {
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(activeUser({ companies: [] }))
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
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });

    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "authentication_failures",
      expect.objectContaining({
        principalKind: "known",
        reason: "NO_ACTIVE_COMPANY_MEMBERSHIP"
      })
    );
    expect(delay).toHaveBeenCalledOnce();
    expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(900);
  });

  it("does not reveal a correct password through an invalid company selection", async () => {
    const mockRepository = repository();
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
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password",
        companyId: "company-not-linked"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });

    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "authentication_failures",
      expect.objectContaining({ principalKind: "known", reason: "INVALID_COMPANY_SELECTION" })
    );
    expect(delay).toHaveBeenCalledOnce();
    expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(900);
  });

  it("uses a dummy hash without persisting attacker-controlled unknown identities", async () => {
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(null)
    });
    const failureAudit = new LoginFailureAuditGate();
    const unknownBackoff = new UnknownLoginBackoffGate();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      failureAudit,
      unknownBackoff
    );
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    await expect(
      service.login(request(), { email: "missing@example.com", password: "wrong-password" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockRepository.findLoginAttempt).toHaveBeenCalledOnce();
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();
    expect(compare).toHaveBeenCalledWith(
      "wrong-password",
      expect.stringMatching(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/)
    );
    expect(warn).toHaveBeenCalledWith(
      "authentication_failures",
      expect.objectContaining({ principalKind: "unknown", attemptCount: 1 })
    );
  });

  it("keeps durable unknown-identity state at zero across thousands of e-mails", async () => {
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(null)
    });
    const failureAudit = new LoginFailureAuditGate(60_000, () => 1_000);
    const unknownBackoff = new UnknownLoginBackoffGate(
      256,
      new Uint8Array(32).fill(7),
      () => 1_000
    );
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      failureAudit,
      unknownBackoff
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

    expect(mockRepository.findUserByEmail).toHaveBeenCalledTimes(2_000);
    expect(mockRepository.findLoginAttempt).toHaveBeenCalledTimes(2_000);
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("uses the same persisted-state read boundary for known and unknown principals", async () => {
    const stateFailure = new Error("synthetic authentication-state read failure");
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);

    for (const candidate of [activeUser(), null]) {
      const mockRepository = repository({
        findUserByEmail: vi.fn().mockResolvedValue(candidate),
        findLoginAttempt: vi.fn().mockRejectedValue(stateFailure)
      });
      const service = new AuthService(
        mockRepository as unknown as AuthRepository,
        undefined,
        undefined,
        new LoginVerificationGate(),
        vi.fn().mockResolvedValue(undefined)
      );

      await expect(
        service.login(request(), { email: "principal@example.com", password: "wrong-password" })
      ).rejects.toBe(stateFailure);
      expect(mockRepository.findUserByEmail).toHaveBeenCalledOnce();
      expect(mockRepository.findLoginAttempt).toHaveBeenCalledOnce();
    }

    expect(compare).not.toHaveBeenCalled();
  });

  it("keeps known, unknown and company-selection failures on the same capped timing curve", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00.000Z"));
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(bcrypt, "compare").mockImplementation(async (password) => password === "correct");

    async function measure(kind: "known" | "unknown" | "wrong-company" | "companyless") {
      let failedCount = 0;
      let lockedUntil: Date | undefined;
      const candidate =
        kind === "unknown"
          ? null
          : activeUser({
              id: `user-${kind}`,
              email: `${kind}@example.com`,
              ...(kind === "companyless" ? { companies: [] } : {})
            });
      const mockRepository = repository({
        findUserByEmail: vi.fn().mockResolvedValue(candidate),
        findLoginAttempt: vi.fn().mockImplementation(async () => ({
          failedCount,
          lockedUntil
        })),
        recordFailedLogin: vi.fn().mockImplementation(async (data) => {
          failedCount += 1;
          lockedUntil =
            failedCount < data.maxAttempts
              ? undefined
              : new Date(Date.now() + authenticationBackoffMs(failedCount, data.maxAttempts));
          return { failedCount, lockedUntil };
        })
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
        new UnknownLoginBackoffGate(256, new Uint8Array(32).fill(5), Date.now)
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

      return durations;
    }

    try {
      const known = await measure("known");
      const unknown = await measure("unknown");
      const wrongCompany = await measure("wrong-company");
      const companyless = await measure("companyless");

      expect(known).toEqual([
        1_000, 1_000, 1_000, 1_000, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000
      ]);
      expect(unknown).toEqual(known);
      expect(wrongCompany).toEqual(known);
      expect(companyless).toEqual(known);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aggregates sustained known-principal failures without append-only audit growth", async () => {
    const mockRepository = repository();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(60_000, () => 1_000),
      new UnknownLoginBackoffGate()
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    for (let index = 0; index < 2_000; index += 1) {
      await expect(
        service.login(request(), {
          email: "user@example.com",
          password: `wrong-password-${index}`
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    expect(mockRepository.recordFailedLogin).toHaveBeenCalledTimes(2_000);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("coalesces process telemetry independently of canonical per-login audit writes", async () => {
    const mockRepository = repository();
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      new LoginVerificationGate(),
      vi.fn().mockResolvedValue(undefined),
      new LoginFailureAuditGate(),
      new UnknownLoginBackoffGate(),
      new LoginSuccessTelemetryGate(60_000, () => 1_000)
    );
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);

    for (let index = 0; index < 2_000; index += 1) {
      await service.login(request(), {
        email: "user@example.com",
        password: "correct-password"
      });
    }

    expect(mockRepository.createRefreshToken).toHaveBeenCalledTimes(2_000);
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("authentication_successes", { successCount: 1 });
  });

  it("waits out persisted backoff and still accepts a correct password", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-03T12:00:00.000Z");
    vi.setSystemTime(now);
    const mockRepository = repository({
      findLoginAttempt: vi
        .fn()
        .mockResolvedValue({ failedCount: 5, lockedUntil: new Date(now.getTime() + 1_000) })
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    try {
      const login = service.login(request(), {
        email: "user@example.com",
        password: "test-login-password"
      });
      await vi.waitFor(() => expect(mockRepository.findLoginAttempt).toHaveBeenCalledOnce());
      expect(compare).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(login).resolves.toMatchObject({ user: { id: "user-1" } });

      expect(mockRepository.findUserByEmail).toHaveBeenCalledWith("user@example.com");
      expect(mockRepository.createRefreshToken).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          emailHash: expect.any(String),
          ipHash: expect.any(String),
          userId: "user-1",
          companyId: "company-a",
          requestId: "request-1",
          ipAddress: "127.0.0.1",
          userAgent: "test-agent"
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects overlapping rotating-IP work and accepts the correct password after failures", async () => {
    const mockRepository = repository();
    const gate = new LoginVerificationGate(1, 8, 8);
    const delay = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      gate,
      delay
    );
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    let releaseFailure: () => void = () => undefined;
    const failureBlocked = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    const compare = vi
      .spyOn(bcrypt, "compare")
      .mockImplementationOnce(async () => {
        await failureBlocked;
        return false;
      })
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);

    const firstAttack = service.login(request("198.51.100.10"), {
      email: "user@example.com",
      password: "wrong-password"
    });
    await vi.waitFor(() => expect(compare).toHaveBeenCalledTimes(1));
    const secondAttack = service.login(request("192.0.2.30"), {
      email: "user@example.com",
      password: "another-wrong-password"
    });
    await expect(secondAttack).rejects.toMatchObject({ code: "AUTHENTICATION_BUSY" });
    expect(compare).toHaveBeenCalledTimes(1);

    releaseFailure();
    await expect(firstAttack).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      service.login(request("192.0.2.30"), {
        email: "user@example.com",
        password: "another-wrong-password"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const legitimate = service.login(request("203.0.113.20"), {
      email: "user@example.com",
      password: "test-login-password"
    });
    await expect(legitimate).resolves.toMatchObject({ user: { id: "user-1" } });
    expect(compare).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it("rejects a saturated verification lane without mutating account state", async () => {
    const mockRepository = repository();
    const gate = new LoginVerificationGate(1, 1, 1);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      gate,
      vi.fn().mockResolvedValue(undefined)
    );
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(bcrypt, "compare").mockImplementationOnce(async () => {
      await blocked;
      return true;
    });
    const admitted = service.login(request("198.51.100.10"), {
      email: "first@example.com",
      password: "test-login-password"
    });
    await vi.waitFor(() => expect(mockRepository.findLoginAttempt).toHaveBeenCalledOnce());

    await expect(
      service.login(request("203.0.113.20"), {
        email: "second@example.com",
        password: "test-login-password"
      })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_BUSY", statusCode: 429 });
    expect(mockRepository.recordFailedLogin).not.toHaveBeenCalled();

    release();
    await admitted;
  });

  it("keeps the verification lane delayed when failed-login persistence rolls back", async () => {
    const persistenceFailure = new Error("synthetic persistence rollback");
    const mockRepository = repository({
      recordFailedLogin: vi.fn().mockRejectedValue(persistenceFailure)
    });
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const gate = new LoginVerificationGate(1, 4, 4);
    let releaseDelay: () => void = () => undefined;
    const delayed = new Promise<void>((resolve) => {
      releaseDelay = resolve;
    });
    const delay = vi.fn().mockImplementation(async () => delayed);
    const service = new AuthService(
      mockRepository as unknown as AuthRepository,
      undefined,
      undefined,
      gate,
      delay
    );
    const compare = vi
      .spyOn(bcrypt, "compare")
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);

    const failed = service
      .login(request("198.51.100.10"), {
        email: "user@example.com",
        password: "wrong-password"
      })
      .then(
        () => undefined,
        (error: unknown) => error
      );
    await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());
    expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(29_900);
    const legitimate = service.login(request("203.0.113.20"), {
      email: "user@example.com",
      password: "test-login-password"
    });
    await expect(legitimate).rejects.toMatchObject({ code: "AUTHENTICATION_BUSY" });
    expect(compare).toHaveBeenCalledTimes(1);

    releaseDelay();
    await expect(failed).resolves.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid credentials"
    });
    await expect(
      service.login(request("203.0.113.20"), {
        email: "user@example.com",
        password: "test-login-password"
      })
    ).resolves.toMatchObject({ user: { id: "user-1" } });
    expect(compare).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "principal lookup",
      overrides: { findUserByEmail: vi.fn().mockRejectedValue(new Error("lookup failed")) },
      compare: async (): Promise<boolean> => true
    },
    {
      name: "persisted backoff lookup",
      overrides: { findLoginAttempt: vi.fn().mockRejectedValue(new Error("state read failed")) },
      compare: async (): Promise<boolean> => true
    },
    {
      name: "password comparison",
      overrides: {},
      compare: async (): Promise<boolean> => {
        throw new Error("comparison failed");
      }
    },
    {
      name: "session issuance",
      overrides: { createRefreshToken: vi.fn().mockResolvedValue(false) },
      compare: async (): Promise<boolean> => true
    }
  ])(
    "holds the identity admission during fail-closed cooldown after $name failure",
    async (testCase) => {
      const mockRepository = repository(testCase.overrides);
      let releaseDelay: () => void = () => undefined;
      const delayed = new Promise<void>((resolve) => {
        releaseDelay = resolve;
      });
      const delay = vi.fn().mockImplementation(async () => delayed);
      const service = new AuthService(
        mockRepository as unknown as AuthRepository,
        undefined,
        undefined,
        new LoginVerificationGate(1, 4, 4),
        delay
      );
      vi.spyOn(bcrypt, "compare").mockImplementation(testCase.compare);

      const failed = service
        .login(request("198.51.100.10"), {
          email: "user@example.com",
          password: "test-login-password"
        })
        .then(
          () => undefined,
          (error: unknown) => error
        );
      await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());
      expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(900);

      await expect(
        service.login(request("203.0.113.20"), {
          email: "user@example.com",
          password: "test-login-password"
        })
      ).rejects.toMatchObject({ code: "AUTHENTICATION_BUSY" });

      releaseDelay();
      await expect(failed).resolves.toBeDefined();
    }
  );

  it("holds identity admission when the global password budget rejects work", async () => {
    let active = false;
    const budgetError = new Error("password budget unavailable");
    const gate = {
      async run<T>(
        _key: string,
        operation: (
          withPasswordBudget: <R>(passwordOperation: () => Promise<R>) => Promise<R>
        ) => Promise<T>
      ) {
        if (active) {
          throw Object.assign(new Error("busy"), { code: "AUTHENTICATION_BUSY", statusCode: 429 });
        }
        active = true;
        try {
          return await operation(async () => {
            throw budgetError;
          });
        } finally {
          active = false;
        }
      }
    };
    let releaseDelay: () => void = () => undefined;
    const delayed = new Promise<void>((resolve) => {
      releaseDelay = resolve;
    });
    const delay = vi.fn().mockImplementation(async () => delayed);
    const service = new AuthService(
      repository() as unknown as AuthRepository,
      undefined,
      undefined,
      gate,
      delay
    );

    const failed = service
      .login(request(), { email: "user@example.com", password: "test-login-password" })
      .then(
        () => undefined,
        (error: unknown) => error
      );
    await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());
    expect(delay.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(900);
    await expect(
      service.login(request(), { email: "user@example.com", password: "test-login-password" })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_BUSY", statusCode: 429 });

    releaseDelay();
    await expect(failed).resolves.toBe(budgetError);
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
