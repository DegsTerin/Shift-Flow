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
};

type AuditDelegate = {
  create(args: unknown): Promise<unknown>;
};

type TransactionClient = {
  refreshToken: RefreshTokenDelegate;
};

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
      where: { email, deletedAt: null },
      include: {
        companies: { where: { deletedAt: null } },
        roleAssignments: {
          where: { deletedAt: null },
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
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
    failedCount: number;
    lockedUntil?: Date;
    ipHash?: string;
    userAgent?: string;
  }) {
    return (await this.loginAttempts()).upsert({
      where: { emailHash: data.emailHash },
      create: {
        emailHash: data.emailHash,
        failedCount: data.failedCount,
        lockedUntil: data.lockedUntil,
        lastFailureAt: new Date(),
        ipHash: data.ipHash,
        userAgent: data.userAgent
      },
      update: {
        failedCount: data.failedCount,
        lockedUntil: data.lockedUntil,
        lastFailureAt: new Date(),
        ipHash: data.ipHash,
        userAgent: data.userAgent
      }
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

  async createRefreshToken(data: Record<string, unknown>) {
    return (await this.refreshTokens()).create({ data });
  }

  async findRefreshToken(tokenHash: string) {
    return (await this.refreshTokens()).findFirst({
      where: {
        tokenHash,
        user: {
          deletedAt: null
        }
      },
      include: {
        user: {
          include: {
            companies: { where: { deletedAt: null } },
            roleAssignments: {
              where: { deletedAt: null },
              include: {
                role: {
                  include: {
                    permissions: {
                      include: { permission: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  async revokeRefreshToken(id: string) {
    return (await this.refreshTokens()).update({
      where: { id },
      data: { revokedAt: new Date() }
    });
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

  async rotateRefreshToken(id: string, data: Record<string, unknown>) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id },
        data: { revokedAt: new Date() }
      });
      return tx.refreshToken.create({ data });
    });
  }
}
