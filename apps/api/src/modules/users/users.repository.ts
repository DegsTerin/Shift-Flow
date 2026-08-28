// en-GB: Encapsulates users persistence so data access remains consistent and testable.
import { getPrisma } from "../../shared/lib/prisma.js";
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

type UserRecord = Record<string, unknown> & {
  id: string;
  passwordChangedAt?: Date | null;
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
    auditData: AuditDataFactory
  ) {
    const prisma = await this.prisma();
    return prisma.$transaction(async (tx) => {
      await this.lockAssignableRole(tx, roleId, companyId);
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

  private async lockAssignableRole(tx: TransactionClient, roleId: string, companyId: string) {
    const roles = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "roles" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "scope" = \'COMPANY\' AND "isActive" = TRUE AND "deletedAt" IS NULL FOR SHARE',
      roleId,
      companyId
    );
    if (!roles[0]) {
      throw badRequest("The user editor accepts active company-scoped profiles only");
    }
  }

  private async replacePermanentCompanyRole(
    tx: TransactionClient,
    userId: string,
    companyId: string,
    roleId: string,
    now: Date
  ) {
    await this.lockAssignableRole(tx, roleId, companyId);
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
