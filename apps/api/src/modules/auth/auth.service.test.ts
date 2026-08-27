// en-GB: Exercises authentication rules so tenant, credential and token lifecycle regressions are detected automatically.
import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { LoginDto } from "./auth.dto.js";
import type { AuthRepository } from "./auth.repository.js";

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
    recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
    recordFailedLogin: vi.fn().mockResolvedValue({ failedCount: 1, lockedUntil: null }),
    writeAuthAudit: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    rotateRefreshToken: vi.fn().mockResolvedValue("ROTATED"),
    revokeRefreshToken: vi.fn().mockResolvedValue(true),
    revokeActiveRefreshTokensForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function request() {
  return {
    context: {
      requestId: "request-1",
      userAgent: "test-agent",
      ipAddress: "127.0.0.1"
    }
  } as ApiRequest;
}

function refreshRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "refresh-1",
    userId: "user-1",
    companyId: "company-b",
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
      expect.objectContaining({ companyId: "company-b", userId: "user-1" }),
      {
        userId: "user-1",
        companyId: "company-b",
        passwordChangedAt: past
      }
    );
    expect(mockRepository.recordSuccessfulLogin).toHaveBeenCalled();
    expect(mockRepository.writeAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCESS", userId: "user-1" })
    );
  });

  it("does not expose a session when the credential changes during login", async () => {
    const mockRepository = repository({
      createRefreshToken: vi.fn().mockResolvedValue(false)
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password",
        companyId: "company-b"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockRepository.updateLastLogin).not.toHaveBeenCalled();
    expect(mockRepository.recordSuccessfulLogin).not.toHaveBeenCalled();
    expect(mockRepository.writeAuthAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCESS" })
    );
  });

  it("does not create a companyless session", async () => {
    const mockRepository = repository({
      findUserByEmail: vi.fn().mockResolvedValue(activeUser({ companies: [] }))
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password"
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it("records failed login attempts without exposing whether the user exists", async () => {
    const mockRepository = repository({
      findLoginAttempt: vi.fn().mockResolvedValue({ failedCount: 4, lockedUntil: null }),
      findUserByEmail: vi.fn().mockResolvedValue(null),
      recordFailedLogin: vi.fn().mockResolvedValue({ failedCount: 5, lockedUntil: future })
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => false);

    await expect(
      service.login(request(), { email: "missing@example.com", password: "wrong-password" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockRepository.recordFailedLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        maxAttempts: expect.any(Number),
        lockoutWindowMs: expect.any(Number)
      })
    );
    expect(compare).toHaveBeenCalledWith(
      "wrong-password",
      expect.stringMatching(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/)
    );
    expect(mockRepository.writeAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_LOCKED" })
    );
  });

  it("rejects locked login attempts before password verification", async () => {
    const mockRepository = repository({
      findLoginAttempt: vi.fn().mockResolvedValue({ failedCount: 5, lockedUntil: future })
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(
      service.login(request(), {
        email: "user@example.com",
        password: "test-login-password"
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(mockRepository.writeAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_LOCKED" })
    );
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
      expect.objectContaining({ companyId: "company-b" }),
      {
        userId: "user-1",
        companyId: "company-b",
        passwordChangedAt: past
      }
    );
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
    expect(mockRepository.revokeActiveRefreshTokensForUser).toHaveBeenCalledWith(
      "user-1",
      "companyId" in invalid && invalid.companyId === null ? null : "company-b"
    );
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
    expect(mockRepository.revokeActiveRefreshTokensForUser).toHaveBeenCalledWith(
      "user-1",
      "company-b"
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

    expect(mockRepository.revokeActiveRefreshTokensForUser).toHaveBeenCalledWith(
      "user-1",
      "company-b"
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

    expect(mockRepository.revokeActiveRefreshTokensForUser).not.toHaveBeenCalled();
  });

  it("conditionally revokes a refresh token during logout", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord())
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await expect(service.logout("valid-refresh-token")).resolves.toEqual({ loggedOut: true });

    expect(mockRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(mockRepository.revokeActiveRefreshTokensForUser).not.toHaveBeenCalled();
  });

  it("revokes active successors when logout loses a concurrent token-consumption race", async () => {
    const mockRepository = repository({
      findRefreshToken: vi.fn().mockResolvedValue(refreshRecord()),
      revokeRefreshToken: vi.fn().mockResolvedValue(false)
    });
    const service = new AuthService(mockRepository as unknown as AuthRepository);

    await service.logout("racing-refresh-token");

    expect(mockRepository.revokeActiveRefreshTokensForUser).toHaveBeenCalledWith(
      "user-1",
      "company-b"
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
    expect(mockRepository.revokeActiveRefreshTokensForUser).toHaveBeenCalledWith(
      "user-1",
      "company-a"
    );
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
    expect(mockRepository.revokeActiveRefreshTokensForUser).not.toHaveBeenCalled();
  });
});
