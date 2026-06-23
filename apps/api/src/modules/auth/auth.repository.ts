import { getDelegate } from "../../shared/lib/prisma.js";

type UserDelegate = {
  findUnique(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<unknown>;
};

type RefreshTokenDelegate = {
  create(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<unknown>;
};

export class AuthRepository {
  private async users() {
    return getDelegate<UserDelegate>("user");
  }

  private async refreshTokens() {
    return getDelegate<RefreshTokenDelegate>("refreshToken");
  }

  async findUserByEmail(email: string) {
    return (await this.users()).findUnique({
      where: { email },
      include: {
        companies: { where: { deletedAt: null } },
        roleAssignments: {
          where: { deletedAt: null },
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
  }

  async updateLastLogin(userId: string) {
    return (await this.users()).update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async createRefreshToken(data: Record<string, unknown>) {
    return (await this.refreshTokens()).create({ data });
  }

  async findRefreshToken(tokenHash: string) {
    return (await this.refreshTokens()).findUnique({
      where: { tokenHash },
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
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async revokeRefreshToken(id: string) {
    return (await this.refreshTokens()).update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async rotateRefreshToken(id: string, data: Record<string, unknown>) {
    await this.revokeRefreshToken(id);
    return this.createRefreshToken(data);
  }
}
