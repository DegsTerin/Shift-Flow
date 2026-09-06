// en-GB: Encapsulates dashboard persistence so data access remains consistent and testable.
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors/app-error.js";
import { getDelegate, getPrisma } from "../../shared/lib/prisma.js";

type ActivityGroupField = "teamId" | "clientId" | "status" | "priority" | "shiftId";
export const completedResolutionSampleLimit = 500;

type ActivityDelegate = {
  count(args?: unknown): Promise<number>;
  groupBy(args: unknown): Promise<unknown[]>;
  findMany(args: unknown): Promise<unknown[]>;
};

type DashboardConfigurationDelegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
};

type DashboardWidgetDelegate = {
  deleteMany(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
};

type TransactionClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  activity: ActivityDelegate;
  dashboardConfiguration: DashboardConfigurationDelegate;
  dashboardWidget: DashboardWidgetDelegate;
};

type PrismaClient = {
  $transaction<T>(
    callback: (tx: TransactionClient) => Promise<T>,
    options?: { isolationLevel?: "RepeatableRead" }
  ): Promise<T>;
};

export type DashboardConfigurationContext = {
  companyId: string;
  userId: string;
  dashboardType: "MAIN" | "TEAM" | "EXECUTIVE";
  teamId: string | null;
};

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
};

const configurationWidgets = {
  where: { deletedAt: null },
  orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }]
};

const repeatableRead = { isolationLevel: "RepeatableRead" } as const;

export class DashboardRepository {
  private async activities() {
    return getDelegate<ActivityDelegate>("activity");
  }

  private async prisma() {
    return (await getPrisma()) as PrismaClient;
  }

  async summarySnapshot(
    where: Record<string, unknown>,
    slaRiskWhere: Record<string, unknown>,
    overdueWhere: Record<string, unknown>
  ) {
    const prisma = await this.prisma();
    return prisma.$transaction(async (tx) => {
      const total = await tx.activity.count({ where });
      const byStatus = await this.groupBy(tx.activity, "status", where);
      const byPriority = await this.groupBy(tx.activity, "priority", where);
      const slaAtRisk = await tx.activity.count({ where: slaRiskWhere });
      const overdue = await tx.activity.count({ where: overdueWhere });
      const completedActivities = await this.completedForAverage(tx.activity, where);
      return { total, byStatus, byPriority, slaAtRisk, overdue, completedActivities };
    }, repeatableRead);
  }

  async chartsSnapshot(where: Record<string, unknown>) {
    const prisma = await this.prisma();
    return prisma.$transaction(async (tx) => {
      const byTeam = await this.groupBy(tx.activity, "teamId", where);
      const byClient = await this.groupBy(tx.activity, "clientId", where);
      const byStatus = await this.groupBy(tx.activity, "status", where);
      const byPriority = await this.groupBy(tx.activity, "priority", where);
      const byShift = await this.groupBy(tx.activity, "shiftId", where);
      return { byTeam, byClient, byStatus, byPriority, byShift };
    }, repeatableRead);
  }

  async operationalList(where: Record<string, unknown>) {
    return (await this.activities()).findMany({
      where,
      take: 50,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      include: { client: true, team: true, assignee: { select: publicUserSelect }, shift: true }
    });
  }

  async findConfiguration(where: Record<string, unknown>) {
    const prisma = await this.prisma();
    return prisma.$transaction(
      (tx) => this.findOneConfiguration(tx.dashboardConfiguration, where),
      repeatableRead
    );
  }

  async writeConfiguration(
    context: DashboardConfigurationContext,
    configuration: Record<string, unknown>,
    widgets: Record<string, unknown>[]
  ) {
    const prisma = await this.prisma();
    return prisma.$transaction(async (tx) => {
      await this.lockConfigurationContext(tx, context);
      const where = { ...context, deletedAt: null };
      const existing = await this.findOneConfiguration(tx.dashboardConfiguration, where);
      const created = existing
        ? null
        : await tx.dashboardConfiguration.create({ data: { ...context, ...configuration } });
      const dashboardConfigId = String(existing?.id ?? created?.id);
      const reconciledWidgets = this.reconcileWidgetIds(
        existing && Array.isArray(existing.widgets) ? existing.widgets : [],
        widgets
      ).map((widget) => ({
        ...widget,
        companyId: context.companyId,
        dashboardConfigId
      }));

      await tx.dashboardWidget.deleteMany({
        where: { dashboardConfigId, companyId: context.companyId }
      });
      if (reconciledWidgets.length) {
        await tx.dashboardWidget.createMany({ data: reconciledWidgets });
      }
      await tx.dashboardConfiguration.update({
        where: { id: dashboardConfigId },
        data: configuration
      });

      const updated = await this.findOneConfiguration(tx.dashboardConfiguration, where);
      if (!updated) throw new Error("Dashboard configuration disappeared during its transaction");
      return updated;
    });
  }

  private groupBy(
    activity: ActivityDelegate,
    field: ActivityGroupField,
    where: Record<string, unknown>
  ) {
    return activity.groupBy({
      by: [field],
      where,
      _count: { _all: true },
      orderBy: { [field]: "asc" }
    });
  }

  private completedForAverage(activity: ActivityDelegate, where: Record<string, unknown>) {
    const existing = Array.isArray(where.AND) ? where.AND : [];
    return activity.findMany({
      where: {
        ...where,
        AND: [...existing, { status: "DONE" }, { completedAt: { not: null } }]
      },
      select: { createdAt: true, completedAt: true },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      take: completedResolutionSampleLimit
    });
  }

  private async findOneConfiguration(
    configurations: DashboardConfigurationDelegate,
    where: Record<string, unknown>
  ) {
    const rows = await configurations.findMany({
      where,
      take: 2,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { widgets: configurationWidgets }
    });
    if (rows.length > 1) {
      throw conflict("Multiple active dashboard configurations exist for the same context");
    }
    return rows[0] ?? null;
  }

  private async lockConfigurationContext(
    tx: TransactionClient,
    context: DashboardConfigurationContext
  ) {
    const memberships = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "user_companies" WHERE "userId" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
      context.userId,
      context.companyId
    );
    if (!memberships.length) throw forbidden("User does not belong to the active company");

    if (context.teamId) {
      const teams = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "teams" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE',
        context.teamId,
        context.companyId
      );
      if (!teams.length) throw notFound("Team not found in active company");
    }

    const configurations = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "dashboard_configurations" WHERE "companyId" = $1::uuid AND "userId" = $2::uuid AND "dashboardType" = $3::"DashboardType" AND "teamId" IS NOT DISTINCT FROM $4::uuid AND "deletedAt" IS NULL ORDER BY "id" FOR UPDATE',
      context.companyId,
      context.userId,
      context.dashboardType,
      context.teamId
    );
    if (configurations.length > 1) {
      throw conflict("Multiple active dashboard configurations exist for the same context");
    }
  }

  private reconcileWidgetIds(
    existingWidgets: unknown[],
    incomingWidgets: Record<string, unknown>[]
  ) {
    const existingById = new Map<string, Record<string, unknown>>();
    const existingByKey = new Map<string, Record<string, unknown>>();
    for (const candidate of existingWidgets) {
      const widget = candidate as Record<string, unknown>;
      const id = String(widget.id);
      const key = this.widgetKey(widget);
      existingById.set(id, widget);
      if (key) existingByKey.set(key, widget);
    }

    return incomingWidgets.map((widget) => {
      const key = this.widgetKey(widget);
      const requestedId = typeof widget.id === "string" ? widget.id : undefined;
      if (requestedId) {
        const existing = existingById.get(requestedId);
        if (!existing || this.widgetKey(existing) !== key) {
          throw badRequest("Dashboard widget does not belong to this configuration");
        }
        return widget;
      }
      const existing = key ? existingByKey.get(key) : undefined;
      return existing ? { ...widget, id: existing.id } : widget;
    });
  }

  private widgetKey(widget: Record<string, unknown>) {
    const settings = widget.settings as Record<string, unknown> | null | undefined;
    return typeof settings?.key === "string" ? settings.key : undefined;
  }
}
