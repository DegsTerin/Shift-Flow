// en-GB: Encapsulates rbac persistence so data access remains consistent and testable.
import { badRequest, notFound } from "../../shared/errors/app-error.js";
import {
  getDelegate,
  getDelegateFrom,
  getPrisma,
  type PrismaTransactionClient
} from "../../shared/lib/prisma.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

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
    companyId?: string | null;
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

type ScopedResourceDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

type RoleRecord = Record<string, unknown> & {
  id: string;
  scope: string;
  isSystem: boolean;
};

type RoleMutationClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  role: {
    update(args: unknown): Promise<RoleRecord>;
  };
  userRoleAssignment: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<unknown>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type RoleMutationPrisma = {
  $transaction<T>(callback: (tx: RoleMutationClient) => Promise<T>): Promise<T>;
};

type RoleAuditFactory = (before: unknown, after: unknown) => Record<string, unknown>;

export class RbacRepository {
  roles = new BaseRepository("role");
  permissions = new BaseRepository("permission");

  constructor(
    private readonly prismaProvider: () => Promise<RoleMutationPrisma> = async () =>
      (await getPrisma()) as RoleMutationPrisma
  ) {}

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

  async findAssignmentsForUser(
    userId: string,
    companyId: string,
    transaction?: PrismaTransactionClient
  ) {
    const now = new Date();
    const delegate = transaction
      ? getDelegateFrom<AssignmentDelegate>(transaction, "userRoleAssignment")
      : await this.assignments();
    return delegate.findMany({
      where: {
        userId,
        companyId,
        deletedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        AND: [
          {
            OR: [{ clientId: null }, { client: { status: "ACTIVE", deletedAt: null } }]
          },
          {
            OR: [{ teamId: null }, { team: { deletedAt: null } }]
          }
        ],
        company: { status: "ACTIVE", deletedAt: null },
        user: {
          status: "ACTIVE",
          deletedAt: null,
          companies: {
            some: {
              companyId,
              deletedAt: null,
              company: { status: "ACTIVE", deletedAt: null }
            }
          }
        },
        role: {
          isActive: true,
          deletedAt: null,
          OR: [{ companyId }, { companyId: null }]
        }
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                OR: [{ companyId }, { companyId: null }],
                permission: {
                  deletedAt: null,
                  OR: [{ companyId }, { companyId: null }]
                }
              },
              include: { permission: true }
            }
          }
        }
      }
    });
  }

  async assignRole(data: Record<string, unknown>) {
    const roleId = String(data.roleId);
    const companyId = String(data.companyId);
    const prisma = await this.prismaProvider();
    return prisma.$transaction(async (tx) => {
      const roles = await tx.$queryRawUnsafe<Array<{ id: string; scope: string }>>(
        'SELECT "id", "scope" FROM "roles" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "isActive" = TRUE AND "deletedAt" IS NULL FOR SHARE',
        roleId,
        companyId
      );
      const role = roles[0];
      if (!role) throw badRequest("Role is not active in the current company");
      if (role.scope === "CLIENT" && !data.clientId) {
        throw badRequest("Client-scoped roles require a client");
      }
      if (role.scope === "TEAM" && !data.teamId) {
        throw badRequest("Team-scoped roles require a team");
      }
      return tx.userRoleAssignment.create({ data });
    });
  }

  async assignPermission(roleId: string, permissionId: string, companyId?: string) {
    const delegate = await this.rolePermissions();
    const existing = await delegate.findFirst({
      where: { roleId, permissionId }
    });
    return (
      existing ??
      delegate.create({
        data: { roleId, permissionId, companyId }
      })
    );
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

  async mutateRole(
    roleId: string,
    companyId: string,
    data: Record<string, unknown>,
    action: "UPDATE" | "SOFT_DELETE",
    auditData: RoleAuditFactory
  ) {
    const prisma = await this.prismaProvider();
    return prisma.$transaction(async (tx) => {
      const roles = await tx.$queryRawUnsafe<RoleRecord[]>(
        'SELECT * FROM "roles" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
        roleId,
        companyId
      );
      const before = roles[0];
      if (!before) throw notFound("Role not found");
      if (before.isSystem) {
        throw badRequest(
          action === "SOFT_DELETE"
            ? "System profiles cannot be deleted"
            : "System profiles cannot be edited"
        );
      }

      const changesScope = data.scope !== undefined && data.scope !== before.scope;
      if (action === "SOFT_DELETE" || changesScope) {
        const now = new Date();
        const assignmentCount = await tx.userRoleAssignment.count({
          where: {
            roleId,
            companyId,
            deletedAt: null,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }]
          }
        });
        if (assignmentCount > 0) {
          throw badRequest(
            action === "SOFT_DELETE"
              ? "Profile is in use and cannot be deleted"
              : "Profile scope cannot change while active assignments exist"
          );
        }
      }

      const after = await tx.role.update({
        where: { id: roleId, companyId, deletedAt: null },
        data
      });
      await tx.auditLog.create({ data: auditData(before, after) });
      return after;
    });
  }

  async duplicateRole(roleId: string, companyId: string, name: string) {
    const role = await (
      await this.roleDelegate()
    ).findFirst({
      where: { id: roleId, companyId, deletedAt: null },
      include: { permissions: true }
    });
    if (!role) return null;
    const created = (await (
      await this.roleDelegate()
    ).create({
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
      where: {
        userId,
        companyId,
        deletedAt: null,
        user: { status: "ACTIVE", deletedAt: null },
        company: { status: "ACTIVE", deletedAt: null }
      }
    });
  }

  async findClient(clientId: string, companyId: string) {
    return (await getDelegate<ScopedResourceDelegate>("client")).findFirst({
      where: { id: clientId, companyId, status: "ACTIVE", deletedAt: null }
    });
  }

  async findTeam(teamId: string, companyId: string) {
    return (await getDelegate<ScopedResourceDelegate>("team")).findFirst({
      where: { id: teamId, companyId, deletedAt: null }
    });
  }
}
