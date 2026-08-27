// en-GB: Encapsulates activities persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getPrisma } from "../../shared/lib/prisma.js";
import { toSkipTake, type Pagination } from "../../shared/http/pagination.js";
import { forbidden, notFound } from "../../shared/errors/app-error.js";

type HistoryDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  create(args: unknown): Promise<unknown>;
};

type ActivityDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
};

type AuditDelegate = {
  create(args: unknown): Promise<unknown>;
};

type ActivityTransaction = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  activity: ActivityDelegate;
  activityTaskColumn: {
    createMany(args: unknown): Promise<unknown>;
  };
  activityHistory: HistoryDelegate;
  auditLog: AuditDelegate;
};

export type ActivityMutationEvidence = {
  audit: Record<string, unknown>;
  history: Record<string, unknown>;
};

export type ActivityMutationPlan = {
  data: Record<string, unknown>;
  evidenceFor: (updated: Record<string, unknown>) => ActivityMutationEvidence;
};

export type ActivityCreateData = Record<string, unknown> & {
  companyId: string;
  clientId: string;
  teamId: string;
  reporterId: string;
};

export type ActivityTaskColumnSeed = {
  name: string;
  color: string;
  position: number;
};

const activityReferenceFields = [
  "clientId",
  "teamId",
  "shiftId",
  "assigneeId",
  "reporterId"
] as const;

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
};

export class ActivitiesRepository extends BaseRepository {
  constructor() {
    super("activity");
  }

  async filteredList(where: Record<string, unknown>, pagination: Pagination) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(
        callback: (tx: ActivityTransaction) => Promise<T>,
        options?: { isolationLevel?: "RepeatableRead" }
      ): Promise<T>;
    };
    return prisma.$transaction(
      async (tx) => {
        const [items, total] = await Promise.all([
          tx.activity.findMany({
            where,
            ...toSkipTake(pagination),
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
            include: {
              client: true,
              team: true,
              shift: true,
              assignee: { select: publicUserSelect },
              reporter: { select: publicUserSelect }
            }
          }),
          tx.activity.count({ where })
        ]);
        return { items, total, ...pagination };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }

  async createWithEvidence(
    data: ActivityCreateData,
    evidenceFor: (created: Record<string, unknown>) => ActivityMutationEvidence,
    taskColumns: ActivityTaskColumnSeed[] = []
  ) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: ActivityTransaction) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      await this.lockActivityReferences(tx, data.companyId, data);
      const created = await tx.activity.create({ data });
      if (taskColumns.length) {
        await tx.activityTaskColumn.createMany({
          data: taskColumns.map((column) => ({
            ...column,
            companyId: data.companyId,
            activityId: String(created.id)
          }))
        });
      }
      const evidence = evidenceFor(created);
      await tx.auditLog.create({ data: evidence.audit });
      await tx.activityHistory.create({ data: evidence.history });
      return created;
    });
  }

  async updateWithEvidence(
    companyId: string,
    id: string,
    planFor: (previous: Record<string, unknown>) => ActivityMutationPlan
  ) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: ActivityTransaction) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "activities" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
        id,
        companyId
      );
      if (!locked.length) return null;

      const previous = await tx.activity.findFirst({
        where: { id, companyId, deletedAt: null }
      });
      if (!previous) {
        throw new Error("Locked activity disappeared inside its transaction");
      }

      const plan = planFor(previous);
      await this.lockActivityReferences(
        tx,
        companyId,
        this.changedActivityReferences(previous, plan.data)
      );
      const updated = await tx.activity.update({ where: { id }, data: plan.data });
      const evidence = plan.evidenceFor(updated);
      await tx.auditLog.create({ data: evidence.audit });
      await tx.activityHistory.create({ data: evidence.history });
      return updated;
    });
  }

  private changedActivityReferences(
    previous: Record<string, unknown>,
    data: Record<string, unknown>
  ) {
    return Object.fromEntries(
      activityReferenceFields
        .filter(
          (field) =>
            Object.hasOwn(data, field) && (data[field] ?? null) !== (previous[field] ?? null)
        )
        .map((field) => [field, data[field]])
    );
  }

  private async lockActivityReferences(
    tx: ActivityTransaction,
    companyId: string,
    activity: Record<string, unknown>
  ) {
    const clientId = activity.clientId ? String(activity.clientId) : undefined;
    const teamId = activity.teamId ? String(activity.teamId) : undefined;
    const shiftId = activity.shiftId ? String(activity.shiftId) : undefined;
    if (clientId) {
      const clients = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "clients" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE',
        clientId,
        companyId
      );
      if (!clients.length) throw notFound("Client not found in active company");
    }
    if (teamId) {
      const teams = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "teams" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE',
        teamId,
        companyId
      );
      if (!teams.length) throw notFound("Team not found in active company");
    }
    if (shiftId) {
      const shifts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "shifts" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE',
        shiftId,
        companyId
      );
      if (!shifts.length) throw notFound("Shift not found in active company");
    }

    const userIds = [...new Set([activity.assigneeId, activity.reporterId])]
      .filter((value): value is string => typeof value === "string" && Boolean(value))
      .sort();
    for (const userId of userIds) {
      const memberships = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "user_companies" WHERE "userId" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE',
        userId,
        companyId
      );
      if (!memberships.length) {
        throw forbidden("User does not belong to the active company");
      }
    }
  }
}
