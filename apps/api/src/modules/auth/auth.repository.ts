// en-GB: Encapsulates auth persistence so data access remains consistent and testable.
import {
  getDelegateFrom,
  getPrisma,
  type PrismaTransactionClient
} from "../../shared/lib/prisma.js";
import { authenticationBackoffMs } from "./login-verification-gate.js";

type UserDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<unknown>;
};

type RefreshTokenDelegate = {
  create(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown | null>;
  findMany(args: unknown): Promise<Array<{ id: string; expiresAt?: Date }>>;
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

type AuthenticationSessionObservationDelegate = {
  create(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<Array<{ id: string }>>;
};

type TransactionClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  user: UserDelegate;
  refreshToken: RefreshTokenDelegate;
  authLoginAttempt: AuthLoginAttemptDelegate;
  authenticationSessionObservation: AuthenticationSessionObservationDelegate;
  auditLog: AuditDelegate;
};

export type SessionCredentialContext = {
  userId: string;
  companyId: string;
  sessionKind: AuthenticationSessionKind;
  passwordChangedAt: Date | null;
};

export type AuthenticationSessionKind = "PASSWORD" | "DEMO" | "PORTFOLIO";

export type BoundedSessionObservationData = {
  sessionKind: AuthenticationSessionKind;
  emailHash: string;
  userId: string;
  companyId: string;
  requestId?: string;
  ipAddress?: string;
  ipHash?: string;
  userAgent?: string;
};

type RefreshTokenWriteData = {
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  createdAt?: Date;
};

export type RefreshRotationResult =
  | "ROTATED"
  | "EXPIRED"
  | "REUSED"
  | "SESSION_STALE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_SOON";

export const maximumActiveRefreshTokensPerUserCompany = 5;
export const maximumActivePortfolioSessionsPerUserCompany = 1_000;
export const minimumRefreshTokenRotationIntervalSeconds = 60;
export const maximumBoundedSessionObservationsPerUserCompany = 20;
const minimumRefreshTokenRotationIntervalMs = minimumRefreshTokenRotationIntervalSeconds * 1_000;

export class PortfolioSessionCapacityError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Portfolio session capacity is temporarily busy");
  }
}

async function lockUser(tx: TransactionClient, userId: string) {
  const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "users" WHERE "id" = $1::uuid FOR UPDATE',
    userId
  );
  return locked.length === 1;
}

async function credentialIsCurrent(tx: TransactionClient, context: SessionCredentialContext) {
  if (!(await lockUser(tx, context.userId))) {
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

async function reserveRefreshTokenSlot(
  tx: TransactionClient,
  context: SessionCredentialContext,
  observedAt = new Date()
) {
  const scope = { userId: context.userId, companyId: context.companyId };
  await tx.refreshToken.deleteMany({
    where: { ...scope, expiresAt: { lte: observedAt } }
  });

  if (context.sessionKind === "PORTFOLIO") {
    const activePortfolioSessions = await tx.refreshToken.findMany({
      where: {
        ...scope,
        sessionKind: "PORTFOLIO",
        revokedAt: null,
        expiresAt: { gt: observedAt }
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: maximumActivePortfolioSessionsPerUserCompany,
      select: { id: true, expiresAt: true }
    });
    if (activePortfolioSessions.length >= maximumActivePortfolioSessionsPerUserCompany) {
      const nextExpiryAt = activePortfolioSessions[0]?.expiresAt;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          ((nextExpiryAt?.getTime() ?? observedAt.getTime() + 60_000) - observedAt.getTime()) /
            1_000
        )
      );
      throw new PortfolioSessionCapacityError(retryAfterSeconds);
    }
    return;
  }

  const retainedActive = await tx.refreshToken.findMany({
    where: {
      ...scope,
      sessionKind: context.sessionKind,
      revokedAt: null,
      expiresAt: { gt: observedAt }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: maximumActiveRefreshTokensPerUserCompany - 1,
    select: { id: true }
  });
  const retainedIds = retainedActive.map((token) => token.id);

  await tx.refreshToken.deleteMany({
    where: {
      ...scope,
      sessionKind: context.sessionKind,
      revokedAt: null,
      expiresAt: { gt: observedAt },
      ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {})
    }
  });
}

async function persistBoundedSessionObservation(
  tx: TransactionClient,
  data: BoundedSessionObservationData,
  observedAt = new Date()
) {
  if (data.sessionKind === "PASSWORD") {
    await tx.authLoginAttempt.upsert({
      where: { emailHash: data.emailHash },
      create: {
        emailHash: data.emailHash,
        failedCount: 0,
        lockedUntil: null,
        lastSuccessAt: observedAt,
        ipHash: data.ipHash,
        userAgent: data.userAgent
      },
      update: {
        failedCount: 0,
        lockedUntil: null,
        lastSuccessAt: observedAt,
        ipHash: data.ipHash,
        userAgent: data.userAgent
      }
    });
    await tx.auditLog.create({
      data: {
        entityType: "Auth",
        entityId: data.emailHash,
        action: "LOGIN_SUCCESS",
        actorUserId: data.userId,
        companyId: data.companyId,
        requestId: data.requestId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      }
    });
  }
  await tx.authenticationSessionObservation.create({
    data: {
      userId: data.userId,
      companyId: data.companyId,
      sessionKind: data.sessionKind,
      emailHash: data.emailHash,
      requestId: data.requestId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      observedAt
    }
  });

  const retained = await tx.authenticationSessionObservation.findMany({
    where: {
      userId: data.userId,
      companyId: data.companyId,
      sessionKind: data.sessionKind
    },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    take: maximumBoundedSessionObservationsPerUserCompany,
    select: { id: true }
  });
  if (retained.length === 0) {
    throw new Error("Authentication session observation disappeared during its transaction");
  }
  await tx.authenticationSessionObservation.deleteMany({
    where: {
      userId: data.userId,
      companyId: data.companyId,
      sessionKind: data.sessionKind,
      id: { notIn: retained.map((entry) => entry.id) }
    }
  });
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
  constructor(private readonly prismaProvider: () => Promise<unknown> = getPrisma) {}

  private async delegate<T>(name: string) {
    return getDelegateFrom<T>((await this.prismaProvider()) as PrismaTransactionClient, name);
  }

  private async users() {
    return this.delegate<UserDelegate>("user");
  }

  private async refreshTokens() {
    return this.delegate<RefreshTokenDelegate>("refreshToken");
  }

  private async loginAttempts() {
    return this.delegate<AuthLoginAttemptDelegate>("authLoginAttempt");
  }

  async findUserByEmail(email: string) {
    return (await this.users()).findFirst({
      where: { email, status: "ACTIVE", deletedAt: null },
      include: activeUserInclude()
    });
  }

  async findLoginCredentialByEmail(email: string) {
    return (await this.users()).findFirst({
      where: { email, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        passwordChangedAt: true
      }
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
    const prisma = (await this.prismaProvider()) as {
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
        data: {
          lockedUntil: new Date(
            failedAt.getTime() + authenticationBackoffMs(attempt.failedCount, data.maxAttempts)
          )
        }
      });
    });
  }

  async createRefreshToken(
    data: RefreshTokenWriteData,
    credentialContext: SessionCredentialContext,
    sessionObservation: BoundedSessionObservationData
  ) {
    if (
      sessionObservation.userId !== credentialContext.userId ||
      sessionObservation.companyId !== credentialContext.companyId ||
      sessionObservation.sessionKind !== credentialContext.sessionKind
    ) {
      throw new Error("Session observation scope does not match the session scope");
    }
    const prisma = (await this.prismaProvider()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      if (!(await credentialIsCurrent(tx, credentialContext))) {
        return false;
      }

      await reserveRefreshTokenSlot(tx, credentialContext);
      await tx.refreshToken.create({
        data: {
          ...data,
          userId: credentialContext.userId,
          companyId: credentialContext.companyId,
          sessionKind: credentialContext.sessionKind
        }
      });
      await persistBoundedSessionObservation(tx, sessionObservation);
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

  async deletePortfolioRefreshToken(id: string) {
    const result = (await (
      await this.refreshTokens()
    ).deleteMany({
      where: { id, sessionKind: "PORTFOLIO" }
    })) as { count?: number };
    return result.count === 1;
  }

  async revokeActiveRefreshTokenFamily(
    userId: string,
    companyId: string,
    sessionKind: AuthenticationSessionKind,
    familyId: string
  ) {
    const prisma = (await this.prismaProvider()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      if (!(await lockUser(tx, userId))) {
        return { count: 0 };
      }
      return tx.refreshToken.updateMany({
        where: {
          userId,
          companyId,
          sessionKind,
          familyId,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      });
    });
  }

  async rotateRefreshToken(
    id: string,
    data: RefreshTokenWriteData,
    credentialContext: SessionCredentialContext
  ) {
    const prisma = (await this.prismaProvider()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      if (!(await credentialIsCurrent(tx, credentialContext))) {
        return "SESSION_STALE" satisfies RefreshRotationResult;
      }

      const lockedTokens = await tx.$queryRawUnsafe<
        Array<{
          revokedAt: Date | null;
          expiresAt: Date;
          createdAt: Date;
          sessionKind: AuthenticationSessionKind | null;
        }>
      >(
        'SELECT "revokedAt", "expiresAt", "createdAt", "sessionKind" FROM "refresh_tokens" WHERE "id" = $1::uuid FOR UPDATE',
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
      if (lockedToken.sessionKind && lockedToken.sessionKind !== credentialContext.sessionKind) {
        return "SESSION_STALE" satisfies RefreshRotationResult;
      }
      if (
        !(lockedToken.createdAt instanceof Date) ||
        checkedAt.getTime() - lockedToken.createdAt.getTime() <
          minimumRefreshTokenRotationIntervalMs
      ) {
        return "TOO_SOON" satisfies RefreshRotationResult;
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

      await reserveRefreshTokenSlot(tx, credentialContext, checkedAt);
      await tx.refreshToken.create({
        data: {
          ...data,
          userId: credentialContext.userId,
          companyId: credentialContext.companyId,
          sessionKind: credentialContext.sessionKind
        }
      });
      return "ROTATED" satisfies RefreshRotationResult;
    });
  }
}
