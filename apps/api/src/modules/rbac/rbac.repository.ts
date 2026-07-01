import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type AssignmentDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
};

type RolePermissionDelegate = {
  findMany(args: unknown): Promise<Array<{ permissionId: string }>>;
  create(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown | null>;
};

type RoleDelegate = {
  findFirst(args: unknown): Promise<{
    id: string;
    name?: string;
    description?: string | null;
    scope?: string;
    color?: string | null;
    isSystem?: boolean;
    isActive?: boolean;
  } | null>;
  create(args: unknown): Promise<unknown>;
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
    const delegate = await this.rolePermissions();
    const existing = await delegate.findFirst({
      where: { roleId, permissionId }
    });
    return existing ?? delegate.create({
      data: { roleId, permissionId, companyId }
    });
  }

  async removePermission(roleId: string, permissionId: string, companyId: string) {
    return (await this.rolePermissions()).deleteMany({
      where: {
        roleId,
        permissionId,
        OR: [{ companyId }, { companyId: null }]
      }
    });
  }

  async findRole(roleId: string, companyId: string) {
    return (await this.roleDelegate()).findFirst({
      where: { id: roleId, companyId, deletedAt: null }
    });
  }

  async countActiveAssignments(roleId: string, companyId: string) {
    return (await this.assignments()).count({
      where: {
        roleId,
        companyId,
        deletedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
      }
    });
  }

  async duplicateRole(roleId: string, companyId: string, name: string) {
    const role = await (await this.roleDelegate()).findFirst({
      where: { id: roleId, companyId, deletedAt: null },
      include: { permissions: true }
    });
    if (!role) return null;
    const created = (await (await this.roleDelegate()).create({
      data: {
        companyId,
        name,
        description: role.description ?? `Copia de ${role.name ?? "perfil"}`,
        scope: role.scope ?? "COMPANY",
        color: role.color ?? "#0f766e",
        isActive: role.isActive ?? true
      }
    })) as { id: string };
    const permissions = await (await this.rolePermissions()).findMany({ where: { roleId } });
    await Promise.all(
      permissions.map((permission) =>
        this.assignPermission(created.id, permission.permissionId, companyId)
      )
    );
    return created;
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
