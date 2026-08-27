// en-GB: Encapsulates auth persistence so data access remains consistent and testable.
import { getDelegate, getPrisma } from "../../shared/lib/prisma.js";

type UserDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<unknown>;
};

type RefreshTokenDelegate = {
  create(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

type AuthLoginAttemptDelegate = {
  findUnique(args: unknown): Promise<unknown | null>;
  upsert(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

type AuditDelegate = {
  create(args: unknown): Promise<unknown>;
};

type TransactionClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  user: UserDelegate;
  refreshToken: RefreshTokenDelegate;
  authLoginAttempt: AuthLoginAttemptDelegate;
};

export type SessionCredentialContext = {
  userId: string;
  companyId: string;
  passwordChangedAt: Date | null;
};

export type RefreshRotationResult =
  | "ROTATED"
  | "EXPIRED"
  | "REUSED"
  | "SESSION_STALE"
  | "NOT_FOUND"
  | "CONFLICT";

async function credentialIsCurrent(tx: TransactionClient, context: SessionCredentialContext) {
  const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "users" WHERE "id" = $1::uuid FOR UPDATE',
    context.userId
  );
  if (locked.length !== 1) {
    return false;
  }

  return Boolean(
    await tx.user.findFirst({
      where: {
        id: context.userId,
        status: "ACTIVE",
        deletedAt: null,
        passwordChangedAt: context.passwordChangedAt,
        companies: {
          some: {
            companyId: context.companyId,
            deletedAt: null,
            company: { status: "ACTIVE", deletedAt: null }
          }
        }
      },
      select: { id: true }
    })
  );
}

function activeUserInclude(now = new Date()) {
  return {
    companies: {
      where: {
        deletedAt: null,
        company: { status: "ACTIVE", deletedAt: null }
      },
      include: { company: true }
    },
    roleAssignments: {
      where: {
        deletedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        clientId: null,
        teamId: null,
        company: { status: "ACTIVE", deletedAt: null },
        role: {
          scope: "COMPANY",
          isActive: true,
          deletedAt: null
        }
      },
      include: {
        company: true,
        role: {
          include: {
            permissions: {
              where: { permission: { deletedAt: null } },
              include: { permission: true }
            }
          }
        }
      }
    }
  };
}

export class AuthRepository {
  private async users() {
    return getDelegate<UserDelegate>("user");
  }

  private async refreshTokens() {
    return getDelegate<RefreshTokenDelegate>("refreshToken");
  }

  private async loginAttempts() {
    return getDelegate<AuthLoginAttemptDelegate>("authLoginAttempt");
  }

  private async auditLogs() {
    return getDelegate<AuditDelegate>("auditLog");
  }

  async findUserByEmail(email: string) {
    return (await this.users()).findFirst({
      where: { email, status: "ACTIVE", deletedAt: null },
      include: activeUserInclude()
    });
  }

  async updateLastLogin(userId: string) {
    return (await this.users()).update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });
  }

  async findLoginAttempt(emailHash: string) {
    return (await this.loginAttempts()).findUnique({ where: { emailHash } });
  }

  async recordFailedLogin(data: {
    emailHash: string;
    maxAttempts: number;
    lockoutWindowMs: number;
    ipHash?: string;
    userAgent?: string;
  }) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      const failedAt = new Date();
      const reset = (await tx.authLoginAttempt.updateMany({
        where: {
          emailHash: data.emailHash,
          OR: [
            { lastFailureAt: null },
            {
              lastFailureAt: {
                lt: new Date(failedAt.getTime() - data.lockoutWindowMs)
              }
            }
          ]
        },
        data: {
          failedCount: 1,
          lockedUntil: null,
          lastFailureAt: failedAt,
          ipHash: data.ipHash,
          userAgent: data.userAgent
        }
      })) as { count?: number };
      const attempt = (
        reset.count === 1
          ? await tx.authLoginAttempt.findUnique({ where: { emailHash: data.emailHash } })
          : await tx.authLoginAttempt.upsert({
              where: { emailHash: data.emailHash },
              create: {
                emailHash: data.emailHash,
                failedCount: 1,
                lastFailureAt: failedAt,
                ipHash: data.ipHash,
                userAgent: data.userAgent
              },
              update: {
                failedCount: { increment: 1 },
                lastFailureAt: failedAt,
                ipHash: data.ipHash,
                userAgent: data.userAgent
              }
            })
      ) as { failedCount: number; lockedUntil?: Date | null } | null;

      if (!attempt) {
        throw new Error("Failed-login state disappeared during its transaction");
      }

      if (attempt.failedCount < data.maxAttempts) {
        return attempt;
      }

      return tx.authLoginAttempt.update({
        where: { emailHash: data.emailHash },
        data: { lockedUntil: new Date(failedAt.getTime() + data.lockoutWindowMs) }
      });
    });
  }

  async recordSuccessfulLogin(emailHash: string) {
    return (await this.loginAttempts()).upsert({
      where: { emailHash },
      create: {
        emailHash,
        failedCount: 0,
        lockedUntil: null,
        lastSuccessAt: new Date()
      },
      update: {
        failedCount: 0,
        lockedUntil: null,
        lastSuccessAt: new Date()
      }
    });
  }

  async writeAuthAudit(data: {
    action: string;
    emailHash: string;
    userId?: string;
    companyId?: string;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    detail?: Record<string, unknown>;
  }) {
    return (await this.auditLogs()).create({
      data: {
        entityType: "Auth",
        entityId: data.emailHash,
        action: data.action,
        actorUserId: data.userId,
        companyId: data.companyId,
        requestId: data.requestId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        after: data.detail
      }
    });
  }

  async createRefreshToken(
    data: Record<string, unknown>,
    credentialContext: SessionCredentialContext
  ) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      if (!(await credentialIsCurrent(tx, credentialContext))) {
        return false;
      }

      await tx.refreshToken.create({ data });
      return true;
    });
  }

  async findRefreshToken(tokenHash: string) {
    return (await this.refreshTokens()).findFirst({
      where: { tokenHash },
      include: {
        user: {
          include: activeUserInclude()
        }
      }
    });
  }

  async revokeRefreshToken(id: string) {
    const result = (await (
      await this.refreshTokens()
    ).updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() }
    })) as { count?: number };
    return result.count === 1;
  }

  async revokeActiveRefreshTokensForUser(userId: string, companyId?: string | null) {
    return (await this.refreshTokens()).updateMany({
      where: {
        userId,
        ...(companyId ? { companyId } : {}),
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
  }

  async rotateRefreshToken(
    id: string,
    data: Record<string, unknown>,
    credentialContext: SessionCredentialContext
  ) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      if (!(await credentialIsCurrent(tx, credentialContext))) {
        return "SESSION_STALE" satisfies RefreshRotationResult;
      }

      const lockedTokens = await tx.$queryRawUnsafe<
        Array<{ revokedAt: Date | null; expiresAt: Date }>
      >(
        'SELECT "revokedAt", "expiresAt" FROM "refresh_tokens" WHERE "id" = $1::uuid FOR UPDATE',
        id
      );
      const lockedToken = lockedTokens[0];
      const checkedAt = new Date();
      if (!lockedToken) {
        return "NOT_FOUND" satisfies RefreshRotationResult;
      }
      if (!(lockedToken.expiresAt instanceof Date) || lockedToken.expiresAt <= checkedAt) {
        return "EXPIRED" satisfies RefreshRotationResult;
      }
      if (lockedToken.revokedAt !== null) {
        return "REUSED" satisfies RefreshRotationResult;
      }

      const consumed = (await tx.refreshToken.updateMany({
        where: {
          id,
          revokedAt: null,
          expiresAt: { gt: checkedAt }
        },
        data: { revokedAt: new Date() }
      })) as { count?: number };
      if (consumed.count !== 1) {
        return "CONFLICT" satisfies RefreshRotationResult;
      }

      await tx.refreshToken.create({ data });
      return "ROTATED" satisfies RefreshRotationResult;
    });
  }
}
