import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type AssignmentDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  create(args: unknown): Promise<unknown>;
};

type RolePermissionDelegate = {
  create(args: unknown): Promise<unknown>;
};

type RoleDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

type PermissionDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

type UserCompanyDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

export class RbacRepository {
  roles = new BaseRepository("role");
  permissions = new BaseRepository("permission");

  async assignments() {
    return getDelegate<AssignmentDelegate>("userRoleAssignment");
  }

  async rolePermissions() {
    return getDelegate<RolePermissionDelegate>("rolePermission");
  }

  private async roleDelegate() {
    return getDelegate<RoleDelegate>("role");
  }

  private async permissionDelegate() {
    return getDelegate<PermissionDelegate>("permission");
  }

  private async userCompanies() {
    return getDelegate<UserCompanyDelegate>("userCompany");
  }

  async findAssignmentsForUser(userId: string, companyId?: string) {
    return (await this.assignments()).findMany({
      where: {
        userId,
        ...(companyId ? { companyId } : {}),
        deletedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true }
            }
          }
        }
      }
    });
  }

  async assignRole(data: Record<string, unknown>) {
    return (await this.assignments()).create({ data });
  }

  async assignPermission(roleId: string, permissionId: string, companyId?: string) {
    return (await this.rolePermissions()).create({
      data: { roleId, permissionId, companyId }
    });
  }

  async findRole(roleId: string, companyId: string) {
    return (await this.roleDelegate()).findFirst({
      where: { id: roleId, companyId, deletedAt: null }
    });
  }

  async findPermission(permissionId: string, companyId: string) {
    return (await this.permissionDelegate()).findFirst({
      where: {
        id: permissionId,
        deletedAt: null,
        OR: [{ companyId }, { companyId: null }]
      }
    });
  }

  async findUserCompany(userId: string, companyId: string) {
    return (await this.userCompanies()).findFirst({
      where: { userId, companyId, deletedAt: null }
    });
  }
}
