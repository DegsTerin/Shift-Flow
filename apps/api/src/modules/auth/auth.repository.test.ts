// en-GB: Exercises authentication persistence so session lifecycle filters and token consumption remain fail-closed.
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  userFindFirst,
  refreshFindFirst,
  refreshFindMany,
  refreshCreate,
  refreshDeleteMany,
  refreshUpdateMany,
  loginAttemptFindUnique,
  loginAttemptUpsert,
  loginAttemptUpdate,
  loginAttemptUpdateMany,
  auditCreate,
  observationCreate,
  observationDeleteMany,
  observationFindMany,
  queryRaw,
  transaction
} = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  refreshFindFirst: vi.fn(),
  refreshFindMany: vi.fn(),
  refreshCreate: vi.fn(),
  refreshDeleteMany: vi.fn(),
  refreshUpdateMany: vi.fn(),
  loginAttemptFindUnique: vi.fn(),
  loginAttemptUpsert: vi.fn(),
  loginAttemptUpdate: vi.fn(),
  loginAttemptUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  observationCreate: vi.fn(),
  observationDeleteMany: vi.fn(),
  observationFindMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegateFrom: vi.fn((_prisma: unknown, name: string) => {
    if (name === "user") {
      return { findFirst: userFindFirst, update: vi.fn() };
    }
    if (name === "refreshToken") {
      return {
        create: refreshCreate,
        deleteMany: refreshDeleteMany,
        findFirst: refreshFindFirst,
        findMany: refreshFindMany,
        update: vi.fn(),
        updateMany: refreshUpdateMany
      };
    }
    if (name === "authLoginAttempt") {
      return {
        findUnique: loginAttemptFindUnique,
        upsert: loginAttemptUpsert,
        update: loginAttemptUpdate,
        updateMany: loginAttemptUpdateMany
      };
    }
    if (name === "authenticationSessionObservation") {
      return {
        create: observationCreate,
        deleteMany: observationDeleteMany,
        findMany: observationFindMany
      };
    }
    return { create: auditCreate };
  }),
  getPrisma: vi.fn().mockResolvedValue({ $transaction: transaction })
}));

import { AuthRepository, PortfolioSessionCapacityError } from "./auth.repository.js";

describe("AuthRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockImplementation(async (query: string) =>
      query.includes('FROM "users"')
        ? [{ id: "user-1" }]
        : [
            {
              revokedAt: null,
              expiresAt: new Date(Date.now() + 60_000),
              createdAt: new Date(Date.now() - 120_000)
            }
          ]
    );
    userFindFirst.mockResolvedValue({ id: "user-1" });
    loginAttemptUpdateMany.mockResolvedValue({ count: 0 });
    refreshDeleteMany.mockResolvedValue({ count: 0 });
    refreshFindMany.mockResolvedValue([]);
    observationDeleteMany.mockResolvedValue({ count: 0 });
    observationFindMany.mockResolvedValue([{ id: "observation-current" }]);
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRawUnsafe: queryRaw,
        user: {
          findFirst: userFindFirst,
          update: vi.fn()
        },
        refreshToken: {
          create: refreshCreate,
          deleteMany: refreshDeleteMany,
          findFirst: refreshFindFirst,
          findMany: refreshFindMany,
          update: vi.fn(),
          updateMany: refreshUpdateMany
        },
        authLoginAttempt: {
          findUnique: loginAttemptFindUnique,
          upsert: loginAttemptUpsert,
          update: loginAttemptUpdate,
          updateMany: loginAttemptUpdateMany
        },
        authenticationSessionObservation: {
          create: observationCreate,
          deleteMany: observationDeleteMany,
          findMany: observationFindMany
        },
        auditLog: {
          create: auditCreate
        }
      })
    );
  });

  it("creates a login token only while the credential and membership remain current", async () => {
    refreshCreate.mockResolvedValue({ id: "refresh-next" });
    const passwordChangedAt = new Date("2026-08-27T12:00:00.123Z");
    const repository = new AuthRepository();

    await expect(
      repository.createRefreshToken(
        {
          tokenHash: "next-hash",
          familyId: "00000000-0000-4000-8000-000000000001",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PASSWORD",
          passwordChangedAt
        },
        {
          sessionKind: "PASSWORD",
          emailHash: "email-hash",
          userId: "user-1",
          companyId: "company-a"
        }
      )
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE "id" = $1::uuid FOR UPDATE',
      "user-1"
    );
    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        status: "ACTIVE",
        deletedAt: null,
        passwordChangedAt,
        companies: {
          some: {
            companyId: "company-a",
            deletedAt: null,
            company: { status: "ACTIVE", deletedAt: null }
          }
        }
      },
      select: { id: true }
    });
    expect(refreshDeleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        companyId: "company-a",
        expiresAt: { lte: expect.any(Date) }
      }
    });
    expect(refreshFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 4,
      select: { id: true }
    });
    expect(refreshDeleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) }
      }
    });
    expect(refreshCreate).toHaveBeenCalledWith({
      data: {
        tokenHash: "next-hash",
        familyId: "00000000-0000-4000-8000-000000000001",
        expiresAt: expect.any(Date),
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD"
      }
    });
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCreate.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("does not create a login token after the credential changes", async () => {
    userFindFirst.mockResolvedValue(null);
    const repository = new AuthRepository();

    await expect(
      repository.createRefreshToken(
        {
          tokenHash: "next-hash",
          familyId: "00000000-0000-4000-8000-000000000001",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PASSWORD",
          passwordChangedAt: null
        },
        {
          sessionKind: "PASSWORD",
          emailHash: "email-hash",
          userId: "user-1",
          companyId: "company-a"
        }
      )
    ).resolves.toBe(false);

    expect(refreshCreate).not.toHaveBeenCalled();
  });

  it("persists the refresh token and bounded success evidence in one transaction", async () => {
    refreshCreate.mockResolvedValue({ id: "refresh-next" });
    const repository = new AuthRepository();

    await expect(
      repository.createRefreshToken(
        {
          tokenHash: "next-hash",
          familyId: "00000000-0000-4000-8000-000000000001",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PASSWORD",
          passwordChangedAt: null
        },
        {
          sessionKind: "PASSWORD",
          emailHash: "email-hash",
          userId: "user-1",
          companyId: "company-a",
          requestId: "request-1",
          ipAddress: "192.0.2.10",
          ipHash: "ip-hash",
          userAgent: "test-agent"
        }
      )
    ).resolves.toBe(true);

    expect(transaction).toHaveBeenCalledOnce();
    expect(refreshCreate).toHaveBeenCalledOnce();
    expect(loginAttemptUpsert).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(observationCreate).toHaveBeenCalledOnce();
    expect(observationDeleteMany).toHaveBeenCalledOnce();
    expect(refreshCreate.mock.invocationCallOrder[0]).toBeLessThan(
      observationCreate.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("loads only an active login principal and current company-wide authority", async () => {
    userFindFirst.mockResolvedValue(null);
    const repository = new AuthRepository();

    await repository.findUserByEmail("user@example.com");

    expect(userFindFirst).toHaveBeenCalledOnce();
    const query = userFindFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      include: {
        companies: { where: Record<string, unknown> };
        roleAssignments: { where: Record<string, unknown> };
      };
    };
    expect(query.where).toEqual({
      email: "user@example.com",
      status: "ACTIVE",
      deletedAt: null
    });
    expect(query.include.companies.where).toEqual({
      deletedAt: null,
      company: { status: "ACTIVE", deletedAt: null }
    });
    expect(query.include.roleAssignments.where).toMatchObject({
      deletedAt: null,
      startsAt: { lte: expect.any(Date) },
      clientId: null,
      teamId: null,
      company: { status: "ACTIVE", deletedAt: null },
      role: {
        scope: "COMPANY",
        isActive: true,
        deletedAt: null
      }
    });
    expect(query.include.roleAssignments.where.OR).toEqual([
      { endsAt: null },
      { endsAt: { gt: expect.any(Date) } }
    ]);
  });

  it("loads only credential fields before password verification", async () => {
    userFindFirst.mockResolvedValue(null);
    const repository = new AuthRepository();

    await repository.findLoginCredentialByEmail("user@example.com");

    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        email: "user@example.com",
        status: "ACTIVE",
        deletedAt: null
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        passwordChangedAt: true
      }
    });
  });

  it("keeps invalid refresh principals observable for fail-closed family revocation", async () => {
    refreshFindFirst.mockResolvedValue(null);
    const repository = new AuthRepository();

    await repository.findRefreshToken("token-hash");

    expect(refreshFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: "token-hash" },
        include: {
          user: {
            include: expect.objectContaining({
              companies: expect.any(Object),
              roleAssignments: expect.any(Object)
            })
          }
        }
      })
    );
  });

  it("creates a refresh successor only after atomically consuming the current token", async () => {
    refreshUpdateMany.mockResolvedValue({ count: 1 });
    refreshCreate.mockResolvedValue({ id: "refresh-next" });
    const repository = new AuthRepository();

    await expect(
      repository.rotateRefreshToken(
        "refresh-current",
        {
          tokenHash: "next-hash",
          familyId: "00000000-0000-4000-8000-000000000001",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PASSWORD",
          passwordChangedAt: null
        }
      )
    ).resolves.toBe("ROTATED");

    expect(refreshUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "refresh-current",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) }
      },
      data: { revokedAt: expect.any(Date) }
    });
    expect(refreshCreate).toHaveBeenCalledWith({
      data: {
        tokenHash: "next-hash",
        familyId: "00000000-0000-4000-8000-000000000001",
        expiresAt: expect.any(Date),
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD"
      }
    });
    expect(refreshUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCreate.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("keeps a current token active when rotation is requested inside the minimum interval", async () => {
    queryRaw.mockImplementation(async (query: string) =>
      query.includes('FROM "users"')
        ? [{ id: "user-1" }]
        : [
            {
              revokedAt: null,
              expiresAt: new Date(Date.now() + 60_000),
              createdAt: new Date()
            }
          ]
    );
    const repository = new AuthRepository();

    await expect(
      repository.rotateRefreshToken(
        "refresh-current",
        {
          tokenHash: "next-hash",
          familyId: "00000000-0000-4000-8000-000000000001",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PASSWORD",
          passwordChangedAt: null
        }
      )
    ).resolves.toBe("TOO_SOON");

    expect(refreshUpdateMany).not.toHaveBeenCalled();
    expect(refreshCreate).not.toHaveBeenCalled();
  });

  it("serialises user-scoped refresh revocation through the same user lock", async () => {
    refreshUpdateMany.mockResolvedValue({ count: 2 });
    const repository = new AuthRepository();

    await expect(
      repository.revokeActiveRefreshTokenFamily(
        "user-1",
        "company-a",
        "PASSWORD",
        "00000000-0000-4000-8000-000000000001"
      )
    ).resolves.toEqual({ count: 2 });

    expect(queryRaw).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE "id" = $1::uuid FOR UPDATE',
      "user-1"
    );
    expect(refreshUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD",
        familyId: "00000000-0000-4000-8000-000000000001",
        revokedAt: null
      },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it("keeps mutable success state plus a bounded attributable observation window", async () => {
    const repository = new AuthRepository();

    await repository.createRefreshToken(
      {
        tokenHash: "observation-token",
        familyId: "00000000-0000-4000-8000-000000000001",
        expiresAt: new Date(Date.now() + 60_000)
      },
      {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD",
        passwordChangedAt: null
      },
      {
        sessionKind: "PASSWORD",
        emailHash: "email-hash",
        userId: "user-1",
        companyId: "company-a",
        requestId: "request-1",
        ipAddress: "192.0.2.10",
        ipHash: "ip-hash",
        userAgent: "test-agent"
      }
    );

    expect(loginAttemptUpsert).toHaveBeenCalledWith({
      where: { emailHash: "email-hash" },
      create: {
        emailHash: "email-hash",
        failedCount: 0,
        lockedUntil: null,
        lastSuccessAt: expect.any(Date),
        ipHash: "ip-hash",
        userAgent: "test-agent"
      },
      update: {
        failedCount: 0,
        lockedUntil: null,
        lastSuccessAt: expect.any(Date),
        ipHash: "ip-hash",
        userAgent: "test-agent"
      }
    });
    expect(observationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD",
        emailHash: "email-hash",
        requestId: "request-1",
        ipAddress: "192.0.2.10",
        userAgent: "test-agent",
        observedAt: expect.any(Date)
      }
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        entityType: "Auth",
        entityId: "email-hash",
        action: "LOGIN_SUCCESS",
        actorUserId: "user-1",
        companyId: "company-a",
        requestId: "request-1",
        ipAddress: "192.0.2.10",
        userAgent: "test-agent"
      }
    });
    expect(observationFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD"
      },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true }
    });
    expect(observationDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        companyId: "company-a",
        sessionKind: "PASSWORD",
        id: { notIn: ["observation-current"] }
      }
    });
  });

  it.each(["DEMO", "PORTFOLIO"] as const)(
    "keeps %s observations bounded without appending canonical audit history",
    async (sessionKind) => {
      const repository = new AuthRepository();

      await repository.createRefreshToken(
        {
          tokenHash: `${sessionKind.toLowerCase()}-token`,
          familyId: "00000000-0000-4000-8000-000000000002",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind,
          passwordChangedAt: null
        },
        {
          sessionKind,
          emailHash: "email-hash",
          userId: "user-1",
          companyId: "company-a"
        }
      );

      expect(observationCreate).toHaveBeenCalledOnce();
      expect(auditCreate).not.toHaveBeenCalled();
      expect(loginAttemptUpsert).not.toHaveBeenCalled();
    }
  );

  it("admits more than five portfolio visitors without evicting a live session", async () => {
    refreshFindMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        id: `portfolio-${index}`,
        expiresAt: new Date(Date.now() + 60_000)
      }))
    );
    const repository = new AuthRepository();

    await expect(
      repository.createRefreshToken(
        {
          tokenHash: "portfolio-token",
          familyId: "00000000-0000-4000-8000-000000000003",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PORTFOLIO",
          passwordChangedAt: null
        },
        {
          sessionKind: "PORTFOLIO",
          emailHash: "email-hash",
          userId: "user-1",
          companyId: "company-a"
        }
      )
    ).resolves.toBe(true);

    expect(refreshFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1_000, select: { id: true, expiresAt: true } })
    );
    expect(refreshDeleteMany).toHaveBeenCalledOnce();
    expect(refreshCreate).toHaveBeenCalledOnce();
  });

  it("sheds a new portfolio visitor when the bounded public pool is full", async () => {
    refreshFindMany.mockResolvedValue(
      Array.from({ length: 1_000 }, (_, index) => ({
        id: `portfolio-${index}`,
        expiresAt: new Date(Date.now() + 60_000)
      }))
    );
    const repository = new AuthRepository();

    await expect(
      repository.createRefreshToken(
        {
          tokenHash: "portfolio-token",
          familyId: "00000000-0000-4000-8000-000000000003",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PORTFOLIO",
          passwordChangedAt: null
        },
        {
          sessionKind: "PORTFOLIO",
          emailHash: "email-hash",
          userId: "user-1",
          companyId: "company-a"
        }
      )
    ).rejects.toBeInstanceOf(PortfolioSessionCapacityError);

    expect(refreshCreate).not.toHaveBeenCalled();
    expect(observationCreate).not.toHaveBeenCalled();
  });

  it("increments failed-login state atomically and schedules a bounded persisted backoff", async () => {
    loginAttemptUpsert.mockResolvedValue({ failedCount: 5, lockedUntil: null });
    loginAttemptUpdate.mockImplementation(async (args: unknown) => ({
      failedCount: 5,
      lockedUntil: (args as { data: { lockedUntil: Date } }).data.lockedUntil
    }));
    const repository = new AuthRepository();

    const outcome = (await repository.recordFailedLogin({
      emailHash: "email-hash",
      maxAttempts: 5,
      lockoutWindowMs: 60_000,
      ipHash: "ip-hash",
      userAgent: "test-agent"
    })) as { failedCount: number; lockedUntil: Date };

    expect(loginAttemptUpsert).toHaveBeenCalledWith({
      where: { emailHash: "email-hash" },
      create: {
        emailHash: "email-hash",
        failedCount: 1,
        lastFailureAt: expect.any(Date),
        ipHash: "ip-hash",
        userAgent: "test-agent"
      },
      update: {
        failedCount: { increment: 1 },
        lastFailureAt: expect.any(Date),
        ipHash: "ip-hash",
        userAgent: "test-agent"
      }
    });
    expect(loginAttemptUpdateMany).toHaveBeenCalledWith({
      where: {
        emailHash: "email-hash",
        OR: [{ lastFailureAt: null }, { lastFailureAt: { lt: expect.any(Date) } }]
      },
      data: {
        failedCount: 1,
        lockedUntil: null,
        lastFailureAt: expect.any(Date),
        ipHash: "ip-hash",
        userAgent: "test-agent"
      }
    });
    expect(loginAttemptUpdate).toHaveBeenCalledWith({
      where: { emailHash: "email-hash" },
      data: { lockedUntil: expect.any(Date) }
    });
    expect(outcome).toMatchObject({ failedCount: 5, lockedUntil: expect.any(Date) });
    expect(outcome.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(outcome.lockedUntil.getTime()).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it("does not lock before the atomically persisted threshold", async () => {
    loginAttemptUpsert.mockResolvedValue({ failedCount: 4, lockedUntil: null });
    const repository = new AuthRepository();

    await expect(
      repository.recordFailedLogin({
        emailHash: "email-hash",
        maxAttempts: 5,
        lockoutWindowMs: 60_000
      })
    ).resolves.toEqual({ failedCount: 4, lockedUntil: null });

    expect(loginAttemptUpdate).not.toHaveBeenCalled();
  });

  it("resets an attempt window that expired before counting the new failure", async () => {
    loginAttemptUpdateMany.mockResolvedValue({ count: 1 });
    loginAttemptFindUnique.mockResolvedValue({ failedCount: 1, lockedUntil: null });
    const repository = new AuthRepository();

    await expect(
      repository.recordFailedLogin({
        emailHash: "email-hash",
        maxAttempts: 5,
        lockoutWindowMs: 60_000
      })
    ).resolves.toEqual({ failedCount: 1, lockedUntil: null });

    expect(loginAttemptUpsert).not.toHaveBeenCalled();
    expect(loginAttemptUpdate).not.toHaveBeenCalled();
  });

  it("does not create a successor when another request already consumed the token", async () => {
    refreshUpdateMany.mockResolvedValue({ count: 0 });
    const repository = new AuthRepository();

    await expect(
      repository.rotateRefreshToken(
        "refresh-current",
        {
          tokenHash: "next-hash",
          familyId: "00000000-0000-4000-8000-000000000001",
          expiresAt: new Date(Date.now() + 60_000)
        },
        {
          userId: "user-1",
          companyId: "company-a",
          sessionKind: "PASSWORD",
          passwordChangedAt: null
        }
      )
    ).resolves.toBe("CONFLICT");

    expect(refreshCreate).not.toHaveBeenCalled();
  });

  it("distinguishes a token that expires after its initial service read", async () => {
    vi.useFakeTimers();
    const beforeLock = new Date("2026-08-27T12:00:00.000Z");
    vi.setSystemTime(beforeLock);
    queryRaw.mockImplementation(async (query: string) =>
      query.includes('FROM "users"')
        ? [{ id: "user-1" }]
        : (() => {
            const locked = {
              revokedAt: null,
              expiresAt: new Date(beforeLock.getTime() + 500)
            };
            vi.setSystemTime(new Date(beforeLock.getTime() + 1_000));
            return [locked];
          })()
    );
    const repository = new AuthRepository();

    try {
      await expect(
        repository.rotateRefreshToken(
          "refresh-current",
          {
            tokenHash: "next-hash",
            familyId: "00000000-0000-4000-8000-000000000001",
            expiresAt: new Date(Date.now() + 60_000)
          },
          {
            userId: "user-1",
            companyId: "company-a",
            sessionKind: "PASSWORD",
            passwordChangedAt: null
          }
        )
      ).resolves.toBe("EXPIRED");

      expect(refreshUpdateMany).not.toHaveBeenCalled();
      expect(refreshCreate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("revokes a current token with a conditional write", async () => {
    refreshUpdateMany.mockResolvedValue({ count: 1 });
    const repository = new AuthRepository();

    await expect(repository.revokeRefreshToken("refresh-current")).resolves.toBe(true);

    expect(refreshUpdateMany).toHaveBeenCalledWith({
      where: { id: "refresh-current", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });
});
