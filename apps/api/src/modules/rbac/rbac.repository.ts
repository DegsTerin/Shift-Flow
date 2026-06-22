import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type AssignmentDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  create(args: unknown): Promise<unknown>;
};

type RolePermissionDelegate = {
  create(args: unknown): Promise<unknown>;
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

  async findAssignmentsForUser(userId: string, companyId?: string) {
    return (await this.assignments()).findMany({
      where: {
        userId,
        ...(companyId ? { companyId } : {}),
        deletedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
  }

  async assignRole(data: Record<string, unknown>) {
    return (await this.assignments()).create({ data });
  }

  async assignPermission(roleId: string, permissionId: string, companyId?: string) {
    return (await this.rolePermissions()).create({
      data: { roleId, permissionId, companyId },
    });
  }
}
