// en-GB: Encapsulates users persistence so data access remains consistent and testable.
import { getPrisma } from "../../shared/lib/prisma.js";
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

type UserRecord = Record<string, unknown> & {
  id: string;
  passwordChangedAt?: Date | null;
};

type RoleRecord = {
  id: string;
  companyId?: string | null;
  scope?: string;
  isActive?: boolean;
};

type PermissionGraphRow = {
  roleId: string;
  resource: string;
  action: string;
};

export type UserRoleDelegationContext = {
  actorId: string;
  portfolioCeiling?: readonly string[];
};

type TransactionClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  user: {
    create(args: unknown): Promise<UserRecord>;
    findFirst(args: unknown): Promise<UserRecord | null>;
    update(args: unknown): Promise<UserRecord>;
  };
  userCompany: {
    create(args: unknown): Promise<unknown>;
  };
  userRoleAssignment: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    updateMany(args: unknown): Promise<unknown>;
  };
  refreshToken: {
    updateMany(args: unknown): Promise<unknown>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type TransactionPrisma = {
  $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
};

type AuditDataFactory = (before: unknown, after: unknown) => Record<string, unknown>;

type UserAggregateUpdate = {
  data?: Record<string, unknown>;
  roleId?: string;
  roleDelegation?: UserRoleDelegationContext;
  credentialChange?: boolean;
  revokeSessions?: boolean;
};

function isRecordNotFoundError(cause: unknown) {
  return Boolean(
    cause && typeof cause === "object" && (cause as { code?: unknown }).code === "P2025"
  );
}

const activeCompanyRoles = (companyId: string, now: Date) => ({
  roleAssignments: {
    where: {
      companyId,
      deletedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }]
    },
    include: { role: true }
  }
});

function canonicalUuid(value: string) {
  return value.toLowerCase();
}

function sameUuid(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && canonicalUuid(left) === canonicalUuid(right));
}

export class UsersRepository extends BaseRepository {
  constructor(
    private readonly prismaProvider: () => Promise<TransactionPrisma> = async () =>
      (await getPrisma()) as TransactionPrisma
  ) {
    super("user");
  }

  async createAggregate(
    data: Record<string, unknown>,
    companyId: string,
    roleId: string,
    delegation: UserRoleDelegationContext,
    auditData: AuditDataFactory
  ) {
    const prisma = await this.prisma();
    return prisma.$transaction(async (tx) => {
      await this.assertAuthorisedRoleDelegation(tx, companyId, roleId, delegation);
      const created = await tx.user.create({ data });
      const membership = { companyId, userId: created.id, isDefault: true };
      const assignment = { companyId, userId: created.id, roleId };
      await tx.userCompany.create({ data: membership });
      await tx.userRoleAssignment.create({ data: assignment });
      await tx.auditLog.create({
        data: auditData(undefined, {
          ...created,
          companies: [membership],
          roleAssignments: [assignment]
        })
      });
      return created;
    });
  }

  async updateAggregate(
    id: string,
    companyId: string,
    update: UserAggregateUpdate,
    auditData: AuditDataFactory
  ) {
    const prisma = await this.prisma();
    return prisma.$transaction(async (tx) => {
      if (update.roleId) {
        if (!update.roleDelegation) {
          throw forbidden("Authenticated role delegation is required");
        }
        await this.assertAuthorisedRoleDelegation(
          tx,
          companyId,
          update.roleId,
          update.roleDelegation,
          id
        );
      }
      const current = await this.lockActiveUser(tx, id);
      const activeMemberships = await this.lockMemberships(tx, id);
      this.assertCompanyMutationBoundary(activeMemberships, companyId, Boolean(update.data));
      const now = new Date();
      const before = await tx.user.findFirst({
        where: { id, deletedAt: null },
        include: activeCompanyRoles(companyId, now)
      });
      if (!before) throw notFound("User not found");

      let updated: UserRecord = before;
      if (update.data) {
        const nextData = { ...update.data };
        if (update.credentialChange) {
          const passwordChangedAt = current.passwordChangedAt;
          if (passwordChangedAt !== null && !(passwordChangedAt instanceof Date)) {
            throw new Error("Locked password credential version is invalid");
          }
          const previousVersion = passwordChangedAt?.getTime() ?? 0;
          nextData.passwordChangedAt = new Date(Math.max(Date.now(), previousVersion + 1));
        }
        try {
          updated = await tx.user.update({
            where: { id, deletedAt: null },
            data: nextData
          });
        } catch (cause) {
          if (isRecordNotFoundError(cause)) throw notFound("User not found");
          throw cause;
        }
      }

      if (update.revokeSessions) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }
      if (update.roleId) {
        await this.replacePermanentCompanyRole(tx, id, companyId, update.roleId, now);
      }

      const after = update.data?.deletedAt
        ? updated
        : ((await tx.user.findFirst({
            where: { id, deletedAt: null },
            include: activeCompanyRoles(companyId, now)
          })) ?? updated);
      await tx.auditLog.create({ data: auditData(before, after) });
      return after;
    });
  }

  private async prisma() {
    return this.prismaProvider();
  }

  private async lockActiveUser(tx: TransactionClient, id: string) {
    const locked = await tx.$queryRawUnsafe<Array<UserRecord>>(
      'SELECT "id", "passwordChangedAt" FROM "users" WHERE "id" = $1::uuid AND "deletedAt" IS NULL FOR UPDATE',
      id
    );
    const current = locked[0];
    if (!current) throw notFound("User not found");
    return current;
  }

  private async lockMemberships(tx: TransactionClient, id: string) {
    return tx.$queryRawUnsafe<Array<{ companyId: string; deletedAt: Date | null }>>(
      'SELECT "companyId", "deletedAt" FROM "user_companies" WHERE "userId" = $1::uuid ORDER BY "companyId" FOR UPDATE',
      id
    );
  }

  private assertCompanyMutationBoundary(
    memberships: Array<{ companyId: string; deletedAt: Date | null }>,
    companyId: string,
    changesGlobalIdentity: boolean
  ) {
    const activeMemberships = memberships.filter((membership) => membership.deletedAt === null);
    if (!activeMemberships.some((membership) => membership.companyId === companyId)) {
      throw notFound("User not found");
    }
    if (
      changesGlobalIdentity &&
      activeMemberships.some((membership) => membership.companyId !== companyId)
    ) {
      throw forbidden("Shared user identity cannot be changed from a tenant context");
    }
  }

  private async assertAuthorisedRoleDelegation(
    tx: TransactionClient,
    companyId: string,
    roleId: string,
    context: UserRoleDelegationContext,
    targetUserId?: string
  ) {
    const canonicalCompanyId = canonicalUuid(companyId);
    const actorId = canonicalUuid(context.actorId);
    const targetId = targetUserId ? canonicalUuid(targetUserId) : undefined;
    const companies = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "companies" WHERE "id" = $1::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE',
      canonicalCompanyId
    );
    if (companies.length !== 1) throw forbidden("The active company is unavailable");

    const userIds = [...new Set([actorId, ...(targetId ? [targetId] : [])])].sort();
    for (const userId of userIds) {
      const targetLock = targetId === userId;
      const lockStatement = targetLock
        ? 'SELECT u."id" FROM "users" AS u INNER JOIN "user_companies" AS uc ON uc."userId" = u."id" AND uc."companyId" = $2::uuid AND uc."deletedAt" IS NULL WHERE u."id" = $1::uuid AND u."status" = \'ACTIVE\' AND u."deletedAt" IS NULL FOR UPDATE OF u, uc'
        : 'SELECT u."id" FROM "users" AS u INNER JOIN "user_companies" AS uc ON uc."userId" = u."id" AND uc."companyId" = $2::uuid AND uc."deletedAt" IS NULL WHERE u."id" = $1::uuid AND u."status" = \'ACTIVE\' AND u."deletedAt" IS NULL FOR SHARE OF u, uc';
      const memberships = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        lockStatement,
        userId,
        canonicalCompanyId
      );
      if (memberships.length !== 1) {
        if (userId === actorId) throw forbidden("The actor is not active in the current company");
        throw notFound("User not found");
      }
    }

    const now = new Date();
    const assignments = await tx.$queryRawUnsafe<Array<{ id: string; roleId: string }>>(
      'SELECT "id", "roleId" FROM "user_role_assignments" WHERE "userId" = $1::uuid AND "companyId" = $2::uuid AND "clientId" IS NULL AND "teamId" IS NULL AND "deletedAt" IS NULL AND "startsAt" <= $3 AND ("endsAt" IS NULL OR "endsAt" > $3) ORDER BY "id" FOR SHARE',
      actorId,
      canonicalCompanyId,
      now
    );
    const canonicalTargetRoleId = canonicalUuid(roleId);
    const roleIds = [
      ...new Set([
        ...assignments.map((assignment) => canonicalUuid(assignment.roleId)),
        canonicalTargetRoleId
      ])
    ].sort();
    const roles = new Map<string, RoleRecord>();
    const permissionsByRole = new Map<string, readonly PermissionGraphRow[]>();
    for (const currentRoleId of roleIds) {
      const roleLockStatement =
        currentRoleId === canonicalTargetRoleId
          ? 'SELECT "id", "companyId", "scope", "isActive" FROM "roles" WHERE "id" = $1::uuid AND ("companyId" = $2::uuid OR "companyId" IS NULL) AND "deletedAt" IS NULL FOR UPDATE'
          : 'SELECT "id", "companyId", "scope", "isActive" FROM "roles" WHERE "id" = $1::uuid AND ("companyId" = $2::uuid OR "companyId" IS NULL) AND "deletedAt" IS NULL FOR SHARE';
      const lockedRoles = await tx.$queryRawUnsafe<RoleRecord[]>(
        roleLockStatement,
        currentRoleId,
        canonicalCompanyId
      );
      const role = lockedRoles[0];
      if (!role) continue;
      roles.set(canonicalUuid(role.id), role);
      const permissions = await tx.$queryRawUnsafe<PermissionGraphRow[]>(
        'SELECT p."resource", p."action", rp."roleId" FROM "role_permissions" AS rp INNER JOIN "permissions" AS p ON p."id" = rp."permissionId" WHERE rp."roleId" = $1::uuid AND (rp."companyId" = $2::uuid OR rp."companyId" IS NULL) AND (p."companyId" = $2::uuid OR p."companyId" IS NULL) AND p."deletedAt" IS NULL ORDER BY rp."id" FOR SHARE OF rp, p',
        currentRoleId,
        canonicalCompanyId
      );
      permissionsByRole.set(currentRoleId, permissions);
    }

    const targetRole = roles.get(canonicalTargetRoleId);
    if (
      !targetRole ||
      !sameUuid(targetRole.companyId, canonicalCompanyId) ||
      targetRole.scope !== "COMPANY" ||
      targetRole.isActive !== true
    ) {
      throw badRequest("The user editor accepts active company-scoped profiles only");
    }
    const actorRoleIds = assignments
      .map((assignment) => canonicalUuid(assignment.roleId))
      .filter((assignmentRoleId) => {
        const role = roles.get(assignmentRoleId);
        return Boolean(
          role &&
          role.isActive === true &&
          (role.scope === "GLOBAL" || role.scope === "COMPANY") &&
          (!role.companyId || sameUuid(role.companyId, canonicalCompanyId))
        );
      });
    const actorPermissions = new Set(
      actorRoleIds.flatMap((assignmentRoleId) =>
        (permissionsByRole.get(assignmentRoleId) ?? []).map(
          (permission) => `${permission.resource}:${permission.action}`
        )
      )
    );
    const canUse = (permission: string) => {
      const live = actorPermissions.has(permission) || actorPermissions.has("*:*");
      const ceiling =
        context.portfolioCeiling === undefined ||
        context.portfolioCeiling.includes(permission) ||
        context.portfolioCeiling.includes("*:*");
      return live && ceiling;
    };
    if (!canUse("users:write")) {
      throw forbidden("Current company-wide users:write authority is required");
    }
    if (
      (permissionsByRole.get(canonicalTargetRoleId) ?? []).some(
        (permission) => !canUse(`${permission.resource}:${permission.action}`)
      )
    ) {
      throw forbidden("A profile cannot be delegated beyond the actor's current permissions");
    }
  }

  private async replacePermanentCompanyRole(
    tx: TransactionClient,
    userId: string,
    companyId: string,
    roleId: string,
    now: Date
  ) {
    await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "user_role_assignments" WHERE "userId" = $1::uuid AND "companyId" = $2::uuid ORDER BY "id" FOR UPDATE',
      userId,
      companyId
    );
    const permanentScope = {
      companyId,
      userId,
      deletedAt: null,
      clientId: null,
      teamId: null,
      startsAt: { lte: now },
      endsAt: null,
      role: { scope: "COMPANY" }
    };
    await tx.userRoleAssignment.updateMany({
      where: { ...permanentScope, NOT: { roleId } },
      data: { deletedAt: now }
    });
    const matchingAssignments = await tx.userRoleAssignment.findMany({
      where: { ...permanentScope, roleId },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }]
    });
    if (matchingAssignments.length === 0) {
      await tx.userRoleAssignment.create({ data: { companyId, userId, roleId, startsAt: now } });
    } else if (matchingAssignments.length > 1) {
      await tx.userRoleAssignment.updateMany({
        where: { id: { in: matchingAssignments.slice(1).map((assignment) => assignment.id) } },
        data: { deletedAt: now }
      });
    }
  }
}
