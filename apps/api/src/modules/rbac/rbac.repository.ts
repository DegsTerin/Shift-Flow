// en-GB: Encapsulates rbac persistence so data access remains consistent and testable.
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors/app-error.js";
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
  companyId?: string | null;
  name?: string;
  description?: string | null;
  color?: string | null;
  scope: string;
  isSystem: boolean;
  isActive?: boolean;
};

type PermissionRecord = Record<string, unknown> & {
  id: string;
  companyId?: string | null;
  resource: string;
  action: string;
};

type PermissionGraphRow = PermissionRecord & {
  roleId: string;
  rolePermissionId: string;
};

type RoleAssignmentRecord = Record<string, unknown> & {
  id: string;
  companyId: string;
  userId: string;
  roleId: string;
  clientId?: string | null;
  teamId?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
};

function canonicalUuid(value: string) {
  return value.toLowerCase();
}

function sameUuid(left: string | null | undefined, right: string) {
  return left !== null && left !== undefined && canonicalUuid(left) === canonicalUuid(right);
}

type RoleMutationClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  role: {
    create(args: unknown): Promise<RoleRecord>;
    update(args: unknown): Promise<RoleRecord>;
  };
  permission: {
    create(args: unknown): Promise<PermissionRecord>;
  };
  rolePermission: {
    findFirst(args: unknown): Promise<(Record<string, unknown> & { id: string }) | null>;
    create(args: unknown): Promise<Record<string, unknown> & { id: string }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  userRoleAssignment: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<Record<string, unknown> & { id: string }>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type RoleMutationPrisma = {
  $transaction<T>(callback: (tx: RoleMutationClient) => Promise<T>): Promise<T>;
};

export type RbacAuditEvent = {
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "SOFT_DELETE";
  before?: unknown;
  after?: unknown;
};

export type RbacCommandContext = {
  companyId: string;
  actorId: string;
  portfolioCeiling?: readonly string[];
  requiredControlPermission: "rbac:write" | "rbac:delete";
  auditData(event: RbacAuditEvent): Record<string, unknown>;
};

type RbacMutationTargets = {
  roleIds?: readonly string[];
  userIds?: readonly string[];
};

type AuthorisedMutationState = {
  roles: ReadonlyMap<string, RoleRecord>;
  permissionsByRole: ReadonlyMap<string, readonly PermissionGraphRow[]>;
  canUse(permission: string): boolean;
};

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

  async createRole(context: RbacCommandContext, data: Record<string, unknown>) {
    return this.withAuthorisedMutation(context, {}, async (transaction) => {
      const role = await transaction.role.create({
        data: { ...data, companyId: context.companyId }
      });
      await transaction.auditLog.create({
        data: context.auditData({
          entityType: "Role",
          entityId: role.id,
          action: "CREATE",
          after: role
        })
      });
      return role;
    });
  }

  async createPermission(context: RbacCommandContext, data: Record<string, unknown>) {
    return this.withAuthorisedMutation(context, {}, async (transaction, authority) => {
      const permissionKey = `${String(data.resource)}:${String(data.action)}`;
      if (!authority.canUse(permissionKey)) {
        throw forbidden("Cannot create a permission outside current authority");
      }
      const permission = await transaction.permission.create({
        data: { ...data, companyId: context.companyId }
      });
      await transaction.auditLog.create({
        data: context.auditData({
          entityType: "Permission",
          entityId: permission.id,
          action: "CREATE",
          after: permission
        })
      });
      return permission;
    });
  }

  async assignRole(context: RbacCommandContext, data: Record<string, unknown>) {
    const companyId = canonicalUuid(context.companyId);
    const roleId = canonicalUuid(String(data.roleId));
    const userId = canonicalUuid(String(data.userId));
    const clientId = data.clientId ? canonicalUuid(String(data.clientId)) : null;
    const teamId = data.teamId ? canonicalUuid(String(data.teamId)) : null;
    const startsAt = data.startsAt instanceof Date ? data.startsAt : null;
    const endsAt = data.endsAt instanceof Date ? data.endsAt : null;
    return this.withAuthorisedMutation(
      context,
      { roleIds: [roleId], userIds: [userId] },
      async (transaction, authority) => {
        const role = authority.roles.get(roleId);
        if (!role || !sameUuid(role.companyId, companyId) || role.isActive !== true) {
          throw badRequest("Role is not active in the current company");
        }
        this.assertCanDelegateRole(authority, roleId);
        if (role.scope === "CLIENT" && !clientId) {
          throw badRequest("Client-scoped roles require a client");
        }
        if (role.scope === "TEAM" && !teamId) {
          throw badRequest("Team-scoped roles require a team");
        }
        if (clientId) {
          await this.lockScopedResource(transaction, "clients", clientId, companyId);
        }
        if (teamId) {
          await this.lockScopedResource(transaction, "teams", teamId, companyId);
        }
        if (startsAt && endsAt && endsAt <= startsAt) {
          throw badRequest("endsAt must be later than startsAt");
        }

        const existing = await this.lockEquivalentRoleAssignments(transaction, {
          companyId,
          userId,
          roleId,
          clientId,
          teamId,
          startsAt,
          endsAt
        });
        if (existing.length > 1) {
          throw conflict("Multiple equivalent active role assignments require data repair");
        }
        if (existing[0]) {
          return existing[0];
        }
        const effectiveStartsAt = startsAt ?? (await this.readStatementTimestamp(transaction));
        if (endsAt && endsAt <= effectiveStartsAt) {
          throw badRequest("endsAt must be later than startsAt");
        }

        const assignment = await transaction.userRoleAssignment.create({
          data: {
            companyId,
            userId,
            roleId,
            ...(clientId ? { clientId } : {}),
            ...(teamId ? { teamId } : {}),
            startsAt: effectiveStartsAt,
            ...(endsAt ? { endsAt } : {})
          }
        });
        await transaction.auditLog.create({
          data: {
            ...context.auditData({
              entityType: "UserRoleAssignment",
              entityId: assignment.id,
              action: "CREATE",
              after: assignment
            }),
            ...(clientId ? { clientId } : {}),
            ...(teamId ? { teamId } : {})
          }
        });
        return assignment;
      }
    );
  }

  async assignPermission(context: RbacCommandContext, roleId: string, permissionId: string) {
    const canonicalRoleId = canonicalUuid(roleId);
    const canonicalPermissionId = canonicalUuid(permissionId);
    return this.withAuthorisedMutation(
      context,
      { roleIds: [canonicalRoleId] },
      async (transaction, authority) => {
        const role = this.requireMutableCompanyRole(authority, canonicalRoleId, context.companyId);
        const permission = await this.lockPermission(
          transaction,
          canonicalPermissionId,
          context.companyId
        );
        if (!authority.canUse(`${permission.resource}:${permission.action}`)) {
          throw forbidden("Cannot grant a permission outside current authority");
        }
        const existing = await this.lockRolePermission(
          transaction,
          canonicalRoleId,
          canonicalPermissionId,
          context.companyId
        );
        if (existing) {
          return existing;
        }
        const mapping = await transaction.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id, companyId: context.companyId }
        });
        await transaction.auditLog.create({
          data: context.auditData({
            entityType: "RolePermission",
            entityId: mapping.id,
            action: "CREATE",
            after: mapping
          })
        });
        return mapping;
      }
    );
  }

  async removePermission(context: RbacCommandContext, roleId: string, permissionId: string) {
    const canonicalRoleId = canonicalUuid(roleId);
    const canonicalPermissionId = canonicalUuid(permissionId);
    return this.withAuthorisedMutation(
      context,
      { roleIds: [canonicalRoleId] },
      async (transaction, authority) => {
        this.requireMutableCompanyRole(authority, canonicalRoleId, context.companyId);
        const permission = await this.lockPermission(
          transaction,
          canonicalPermissionId,
          context.companyId
        );
        if (!authority.canUse(`${permission.resource}:${permission.action}`)) {
          throw forbidden("Cannot remove a permission outside current authority");
        }
        const existing = await this.lockRolePermission(
          transaction,
          canonicalRoleId,
          canonicalPermissionId,
          context.companyId
        );
        if (!existing) {
          return { count: 0 };
        }
        const result = await transaction.rolePermission.deleteMany({
          where: {
            id: existing.id,
            roleId: canonicalRoleId,
            permissionId: canonicalPermissionId
          }
        });
        if (result.count !== 1) {
          throw badRequest("Role permission changed during removal");
        }
        await transaction.auditLog.create({
          data: context.auditData({
            entityType: "RolePermission",
            entityId: existing.id,
            action: "DELETE",
            before: existing
          })
        });
        return result;
      }
    );
  }

  async findRole(roleId: string, companyId: string) {
    return (await this.roleDelegate()).findFirst({
      where: { id: roleId, companyId, deletedAt: null }
    });
  }

  async mutateRole(
    context: RbacCommandContext,
    roleId: string,
    data: Record<string, unknown>,
    action: "UPDATE" | "SOFT_DELETE"
  ) {
    const canonicalRoleId = canonicalUuid(roleId);
    return this.withAuthorisedMutation(
      context,
      { roleIds: [canonicalRoleId] },
      async (transaction, authority) => {
        const before = this.requireMutableCompanyRole(
          authority,
          canonicalRoleId,
          context.companyId
        );
        this.assertCanDelegateRole(authority, canonicalRoleId);
        const changesScope = data.scope !== undefined && data.scope !== before.scope;
        if (action === "SOFT_DELETE" || changesScope) {
          const now = await this.readStatementTimestamp(transaction);
          const assignmentCount = await transaction.userRoleAssignment.count({
            where: {
              roleId: canonicalRoleId,
              companyId: context.companyId,
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

        const after = await transaction.role.update({
          where: { id: canonicalRoleId, companyId: context.companyId, deletedAt: null },
          data
        });
        await transaction.auditLog.create({
          data: context.auditData({
            entityType: "Role",
            entityId: canonicalRoleId,
            action,
            before,
            after
          })
        });
        return after;
      }
    );
  }

  async duplicateRole(context: RbacCommandContext, roleId: string, name?: string) {
    const canonicalRoleId = canonicalUuid(roleId);
    return this.withAuthorisedMutation(
      context,
      { roleIds: [canonicalRoleId] },
      async (transaction, authority) => {
        const role = this.requireMutableCompanyRole(authority, canonicalRoleId, context.companyId);
        this.assertCanDelegateRole(authority, canonicalRoleId);
        const permissions = authority.permissionsByRole.get(canonicalRoleId) ?? [];
        const created = await transaction.role.create({
          data: {
            companyId: context.companyId,
            name: name ?? `${role.name ?? "Perfil"} - copia`,
            description: role.description ?? `Copia de ${role.name ?? "perfil"}`,
            scope: role.scope ?? "COMPANY",
            color: role.color ?? "#0f766e",
            isActive: role.isActive ?? true
          }
        });
        for (const permission of permissions) {
          await transaction.rolePermission.create({
            data: {
              companyId: context.companyId,
              roleId: created.id,
              permissionId: permission.id
            }
          });
        }
        await transaction.auditLog.create({
          data: context.auditData({
            entityType: "Role",
            entityId: created.id,
            action: "CREATE",
            after: {
              ...created,
              permissionIds: permissions.map((permission) => permission.id)
            }
          })
        });
        return created;
      }
    );
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

  private async withAuthorisedMutation<T>(
    context: RbacCommandContext,
    targets: RbacMutationTargets,
    operation: (transaction: RoleMutationClient, authority: AuthorisedMutationState) => Promise<T>
  ) {
    const prisma = await this.prismaProvider();
    return prisma.$transaction(async (transaction) => {
      const companyId = canonicalUuid(context.companyId);
      const actorId = canonicalUuid(context.actorId);
      const companies = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "companies" WHERE "id" = $1::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE',
        companyId
      );
      if (companies.length !== 1) {
        throw forbidden("The active company is unavailable");
      }

      const userIds = [...new Set([actorId, ...(targets.userIds ?? []).map(canonicalUuid)])].sort();
      for (const userId of userIds) {
        const memberships = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
          'SELECT u."id" FROM "users" AS u INNER JOIN "user_companies" AS uc ON uc."userId" = u."id" AND uc."companyId" = $2::uuid AND uc."deletedAt" IS NULL WHERE u."id" = $1::uuid AND u."status" = \'ACTIVE\' AND u."deletedAt" IS NULL FOR SHARE OF u, uc',
          userId,
          companyId
        );
        if (memberships.length !== 1) {
          if (userId === actorId) {
            throw forbidden("The actor is not active in the current company");
          }
          throw badRequest("User is not linked to the active company");
        }
      }

      const now = new Date();
      const assignments = await transaction.$queryRawUnsafe<Array<{ id: string; roleId: string }>>(
        'SELECT "id", "roleId" FROM "user_role_assignments" WHERE "userId" = $1::uuid AND "companyId" = $2::uuid AND "clientId" IS NULL AND "teamId" IS NULL AND "deletedAt" IS NULL AND "startsAt" <= $3 AND ("endsAt" IS NULL OR "endsAt" > $3) ORDER BY "id" FOR SHARE',
        actorId,
        companyId,
        now
      );
      const canonicalTargetRoleIds = (targets.roleIds ?? []).map(canonicalUuid);
      const roleIds = [
        ...new Set([
          ...assignments.map((assignment) => canonicalUuid(assignment.roleId)),
          ...canonicalTargetRoleIds
        ])
      ].sort();
      const roles = new Map<string, RoleRecord>();
      const permissionsByRole = new Map<string, readonly PermissionGraphRow[]>();
      const targetRoleIds = new Set(canonicalTargetRoleIds);
      for (const roleId of roleIds) {
        const roleLockStatement = targetRoleIds.has(roleId)
          ? 'SELECT * FROM "roles" WHERE "id" = $1::uuid AND ("companyId" = $2::uuid OR "companyId" IS NULL) AND "deletedAt" IS NULL FOR UPDATE'
          : 'SELECT * FROM "roles" WHERE "id" = $1::uuid AND ("companyId" = $2::uuid OR "companyId" IS NULL) AND "deletedAt" IS NULL FOR SHARE';
        const lockedRoles = await transaction.$queryRawUnsafe<RoleRecord[]>(
          roleLockStatement,
          roleId,
          companyId
        );
        const role = lockedRoles[0];
        if (!role) continue;
        roles.set(canonicalUuid(role.id), role);

        const permissions = await transaction.$queryRawUnsafe<PermissionGraphRow[]>(
          'SELECT p."id", p."companyId", p."resource", p."action", rp."roleId", rp."id" AS "rolePermissionId" FROM "role_permissions" AS rp INNER JOIN "permissions" AS p ON p."id" = rp."permissionId" WHERE rp."roleId" = $1::uuid AND (rp."companyId" = $2::uuid OR rp."companyId" IS NULL) AND (p."companyId" = $2::uuid OR p."companyId" IS NULL) AND p."deletedAt" IS NULL ORDER BY rp."id" FOR SHARE OF rp, p',
          roleId,
          companyId
        );
        permissionsByRole.set(roleId, permissions);
      }

      const companyWideRoleIds = new Set(
        assignments
          .map((assignment) => canonicalUuid(assignment.roleId))
          .filter((roleId) => {
            const role = roles.get(roleId);
            return Boolean(
              role &&
              role.isActive === true &&
              (role.scope === "GLOBAL" || role.scope === "COMPANY") &&
              (!role.companyId || sameUuid(role.companyId, companyId))
            );
          })
      );
      const livePermissions = new Set(
        [...companyWideRoleIds].flatMap((roleId) =>
          (permissionsByRole.get(roleId) ?? []).map(
            (permission) => `${permission.resource}:${permission.action}`
          )
        )
      );
      const liveAllows = (permission: string) =>
        livePermissions.has(permission) || livePermissions.has("*:*");
      const ceilingAllows = (permission: string) =>
        context.portfolioCeiling === undefined ||
        context.portfolioCeiling.includes(permission) ||
        context.portfolioCeiling.includes("*:*");
      const authority: AuthorisedMutationState = {
        roles,
        permissionsByRole,
        canUse: (permission) => liveAllows(permission) && ceilingAllows(permission)
      };
      if (!authority.canUse(context.requiredControlPermission)) {
        throw forbidden(`${context.requiredControlPermission} is required`);
      }

      return operation(transaction, authority);
    });
  }

  private requireMutableCompanyRole(
    authority: AuthorisedMutationState,
    roleId: string,
    companyId: string
  ) {
    const role = authority.roles.get(canonicalUuid(roleId));
    if (!role || !sameUuid(role.companyId, companyId)) {
      throw notFound("Role not found");
    }
    if (role.isSystem) {
      throw badRequest("System profiles cannot be changed");
    }
    return role;
  }

  private assertCanDelegateRole(authority: AuthorisedMutationState, roleId: string) {
    const permissions = authority.permissionsByRole.get(canonicalUuid(roleId)) ?? [];
    if (
      permissions.some(
        (permission) => !authority.canUse(`${permission.resource}:${permission.action}`)
      )
    ) {
      throw forbidden("Cannot delegate a profile outside current authority");
    }
  }

  private async lockEquivalentRoleAssignments(
    transaction: RoleMutationClient,
    identity: {
      companyId: string;
      userId: string;
      roleId: string;
      clientId: string | null;
      teamId: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
    }
  ) {
    return transaction.$queryRawUnsafe<RoleAssignmentRecord[]>(
      'SELECT * FROM "user_role_assignments" AS ura WHERE ura."companyId" = $1::uuid AND ura."userId" = $2::uuid AND ura."roleId" = $3::uuid AND ura."clientId" IS NOT DISTINCT FROM $4::uuid AND ura."teamId" IS NOT DISTINCT FROM $5::uuid AND ura."deletedAt" IS NULL AND (($6::timestamptz IS NULL AND ura."startsAt" <= statement_timestamp() AND (ura."endsAt" IS NULL OR ura."endsAt" > statement_timestamp())) OR ura."startsAt" = $6::timestamptz) AND ura."endsAt" IS NOT DISTINCT FROM $7::timestamptz ORDER BY ura."startsAt", ura."id" LIMIT 2 FOR UPDATE',
      identity.companyId,
      identity.userId,
      identity.roleId,
      identity.clientId,
      identity.teamId,
      identity.startsAt,
      identity.endsAt
    );
  }

  private async readStatementTimestamp(transaction: RoleMutationClient) {
    const timestamps = await transaction.$queryRawUnsafe<Array<{ startsAt: Date }>>(
      'SELECT statement_timestamp() AS "startsAt"'
    );
    const startsAt = timestamps[0]?.startsAt;
    if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
      throw new Error("PostgreSQL did not return a valid assignment timestamp");
    }
    return startsAt;
  }

  private async lockPermission(
    transaction: RoleMutationClient,
    permissionId: string,
    companyId: string
  ) {
    const permissions = await transaction.$queryRawUnsafe<PermissionRecord[]>(
      'SELECT "id", "companyId", "resource", "action" FROM "permissions" WHERE "id" = $1::uuid AND ("companyId" = $2::uuid OR "companyId" IS NULL) AND "deletedAt" IS NULL FOR SHARE',
      permissionId,
      companyId
    );
    if (!permissions[0]) {
      throw badRequest("Permission is not available in the active company");
    }
    return permissions[0];
  }

  private async lockRolePermission(
    transaction: RoleMutationClient,
    roleId: string,
    permissionId: string,
    companyId: string
  ) {
    const mappings = await transaction.$queryRawUnsafe<
      Array<Record<string, unknown> & { id: string }>
    >(
      'SELECT * FROM "role_permissions" WHERE "roleId" = $1::uuid AND "permissionId" = $2::uuid AND ("companyId" = $3::uuid OR "companyId" IS NULL) FOR UPDATE',
      roleId,
      permissionId,
      companyId
    );
    return mappings[0] ?? null;
  }

  private async lockScopedResource(
    transaction: RoleMutationClient,
    table: "clients" | "teams",
    id: string,
    companyId: string
  ) {
    const statement =
      table === "clients"
        ? 'SELECT "id" FROM "clients" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE'
        : 'SELECT "id" FROM "teams" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE';
    const resources = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      statement,
      id,
      companyId
    );
    if (!resources[0]) {
      throw badRequest(
        table === "clients"
          ? "Client does not belong to the active company"
          : "Team does not belong to the active company"
      );
    }
  }
}
