// en-GB: Implements dashboard rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest } from "../../shared/errors/app-error.js";
import { activeCompanyId, assertTeamInCompany } from "../../shared/services/scope.service.js";
import type {
  DashboardConfigurationDto,
  DashboardTypeDto,
  DashboardWidgetDto
} from "./dashboard.dto.js";
import { DashboardRepository } from "./dashboard.repository.js";

const mainDashboardWidgets: DashboardWidgetDto[] = [
  {
    key: "summary-total",
    widgetType: "SUMMARY_CARD",
    title: "Atividades totais",
    gridColumn: 1,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 0
  },
  {
    key: "summary-pending",
    widgetType: "SUMMARY_CARD",
    title: "Pendentes",
    gridColumn: 3,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 1
  },
  {
    key: "summary-running",
    widgetType: "SUMMARY_CARD",
    title: "Em andamento",
    gridColumn: 5,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 2
  },
  {
    key: "summary-done",
    widgetType: "SUMMARY_CARD",
    title: "Finalizadas",
    gridColumn: 7,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 3
  },
  {
    key: "summary-critical",
    widgetType: "SUMMARY_CARD",
    title: "Criticas",
    gridColumn: 9,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 4
  },
  {
    key: "summary-risk",
    widgetType: "INDICATOR",
    title: "SLA em risco",
    gridColumn: 11,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 5
  },
  {
    key: "summary-overdue",
    widgetType: "SUMMARY_CARD",
    title: "Atividades atrasadas",
    gridColumn: 1,
    gridRow: 3,
    gridWidth: 3,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 6
  },
  {
    key: "summary-average-resolution",
    widgetType: "INDICATOR",
    title: "Tempo medio",
    gridColumn: 4,
    gridRow: 3,
    gridWidth: 3,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 7
  },
  {
    key: "kanban-summary",
    widgetType: "BAR_CHART",
    title: "Kanban resumido",
    gridColumn: 7,
    gridRow: 3,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 8
  },
  {
    key: "operational-alerts",
    widgetType: "LIST",
    title: "Alertas operacionais",
    gridColumn: 1,
    gridRow: 6,
    gridWidth: 12,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 9
  },
  {
    key: "team-summary",
    widgetType: "LIST",
    title: "Equipes",
    gridColumn: 1,
    gridRow: 8,
    gridWidth: 12,
    gridHeight: 1,
    isVisible: true,
    isPinned: false,
    order: 10
  },
  {
    key: "chart-team",
    widgetType: "BAR_CHART",
    title: "Atividades por equipe",
    gridColumn: 1,
    gridRow: 9,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 11
  },
  {
    key: "chart-client",
    widgetType: "BAR_CHART",
    title: "Atividades por cliente",
    gridColumn: 7,
    gridRow: 9,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 12
  },
  {
    key: "chart-priority",
    widgetType: "BAR_CHART",
    title: "Atividades por prioridade",
    gridColumn: 1,
    gridRow: 12,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 13
  },
  {
    key: "chart-shift",
    widgetType: "BAR_CHART",
    title: "Incidentes por turno",
    gridColumn: 7,
    gridRow: 12,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 14
  },
  {
    key: "chart-status",
    widgetType: "BAR_CHART",
    title: "Evolucao mensal",
    gridColumn: 1,
    gridRow: 15,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 15
  },
  {
    key: "status-legend",
    widgetType: "INDICATOR",
    title: "Legenda de status",
    gridColumn: 7,
    gridRow: 15,
    gridWidth: 6,
    gridHeight: 1,
    isVisible: true,
    isPinned: false,
    order: 16
  },
  {
    key: "activity-list",
    widgetType: "RECENT_ACTIVITIES",
    title: "Ultimas atividades",
    gridColumn: 1,
    gridRow: 18,
    gridWidth: 12,
    gridHeight: 4,
    isVisible: true,
    isPinned: false,
    order: 17
  }
];

const teamDashboardWidgets: DashboardWidgetDto[] = [
  {
    key: "team-summary",
    widgetType: "LIST",
    title: "Equipes",
    gridColumn: 1,
    gridRow: 1,
    gridWidth: 12,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 0
  },
  {
    key: "team-productivity",
    widgetType: "BAR_CHART",
    title: "Produtividade por analista",
    gridColumn: 1,
    gridRow: 3,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 1
  },
  {
    key: "team-risk",
    widgetType: "BAR_CHART",
    title: "SLA em risco",
    gridColumn: 7,
    gridRow: 3,
    gridWidth: 6,
    gridHeight: 3,
    isVisible: true,
    isPinned: false,
    order: 2
  },
  {
    key: "team-activity-list",
    widgetType: "RECENT_ACTIVITIES",
    title: "Ultimas atividades",
    gridColumn: 1,
    gridRow: 6,
    gridWidth: 12,
    gridHeight: 4,
    isVisible: true,
    isPinned: false,
    order: 3
  }
];

const allowedWidgetKeysByDashboardType: Record<DashboardTypeDto, Set<string>> = {
  MAIN: new Set(mainDashboardWidgets.map((widget) => widget.key)),
  TEAM: new Set(teamDashboardWidgets.map((widget) => widget.key)),
  EXECUTIVE: new Set(mainDashboardWidgets.map((widget) => widget.key))
};

function withConditions(where: Record<string, unknown>, ...conditions: Record<string, unknown>[]) {
  const existing = Array.isArray(where.AND) ? where.AND : [];
  return { ...where, AND: [...existing, ...conditions] };
}

export class DashboardService {
  constructor(private readonly repository = new DashboardRepository()) {}

  private countFromGroup(rows: unknown[], field: string, value: string) {
    const row = rows.find((item) => {
      const record = item as Record<string, unknown>;
      return record[field] === value;
    }) as { _count?: { _all?: number } } | undefined;
    return row?._count?._all ?? 0;
  }

  private where(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    const search = query.search ? String(query.search).trim() : "";
    const now = new Date();
    const uuidSearch =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    return {
      companyId: activeCompanyId(req),
      deletedAt: null,
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(query.attention === "OVERDUE"
        ? { AND: [{ status: { notIn: ["DONE", "CANCELLED"] }, slaDueAt: { lt: now } }] }
        : {}),
      ...(query.attention === "SLA_RISK"
        ? {
            AND: [
              {
                status: { notIn: ["DONE", "CANCELLED"] },
                slaDueAt: { gte: now, lte: new Date(now.getTime() + 60 * 60 * 1000) }
              }
            ]
          }
        : {}),
      ...(query.attention === "CRITICAL" ? { AND: [{ priority: "CRITICAL" }] } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from
                ? { gte: query.from instanceof Date ? query.from : new Date(String(query.from)) }
                : {}),
              ...(query.to
                ? { lte: query.to instanceof Date ? query.to : new Date(String(query.to)) }
                : {})
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              ...(uuidSearch ? [{ id: search }] : []),
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { systemName: { contains: search, mode: "insensitive" } },
              { serviceName: { contains: search, mode: "insensitive" } },
              { client: { name: { contains: search, mode: "insensitive" } } },
              { team: { name: { contains: search, mode: "insensitive" } } },
              { assignee: { displayName: { contains: search, mode: "insensitive" } } },
              { assignee: { email: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
  }

  async summary(req: ApiRequest) {
    const where = this.where(req);
    const now = new Date();
    const [total, byStatus, byPriority, slaAtRisk, overdue, completedActivities] =
      await Promise.all([
        this.repository.count(where),
        this.repository.groupBy("status", where),
        this.repository.groupBy("priority", where),
        this.repository.count(
          withConditions(
            where,
            { status: { notIn: ["DONE", "CANCELLED"] } },
            { slaDueAt: { gt: now, lte: new Date(now.getTime() + 60 * 60 * 1000) } }
          )
        ),
        this.repository.count(
          withConditions(
            where,
            { status: { notIn: ["DONE", "CANCELLED"] } },
            { slaDueAt: { lt: now } }
          )
        ),
        this.repository.completedForAverage(where)
      ]);
    const pending = this.countFromGroup(byStatus, "status", "PENDING");
    const inProgress = this.countFromGroup(byStatus, "status", "IN_PROGRESS");
    const done = this.countFromGroup(byStatus, "status", "DONE");
    const critical = this.countFromGroup(byPriority, "priority", "CRITICAL");

    const averageResolutionHours = this.averageResolutionHours(completedActivities);

    return {
      total,
      pending,
      inProgress,
      done,
      critical,
      slaAtRisk,
      overdue,
      averageResolutionHours
    };
  }

  async charts(req: ApiRequest) {
    const where = this.where(req);
    const [byTeam, byClient, byStatus, byPriority, byShift] = await Promise.all([
      this.repository.groupBy("teamId", where),
      this.repository.groupBy("clientId", where),
      this.repository.groupBy("status", where),
      this.repository.groupBy("priority", where),
      this.repository.groupBy("shiftId", where)
    ]);

    return { byTeam, byClient, byStatus, byPriority, byShift };
  }

  async operationalList(req: ApiRequest) {
    return this.repository.operationalList(this.where(req));
  }

  async configuration(req: ApiRequest, dashboardType: DashboardTypeDto, teamId?: string) {
    const companyId = activeCompanyId(req);
    const userId = req.auth?.id;
    if (!userId) throw new Error("Authenticated user is required");
    await assertTeamInCompany(teamId, companyId);
    const where = { companyId, userId, dashboardType, teamId: teamId ?? null, deletedAt: null };
    const existing = await this.repository.findConfiguration(where);
    if (existing) return this.serializeConfiguration(existing);
    return this.createDefaultConfiguration(companyId, userId, dashboardType, teamId ?? null);
  }

  async saveConfiguration(req: ApiRequest, data: DashboardConfigurationDto) {
    const companyId = activeCompanyId(req);
    const userId = req.auth?.id;
    if (!userId) throw new Error("Authenticated user is required");
    await assertTeamInCompany(data.teamId, companyId);
    const where = {
      companyId,
      userId,
      dashboardType: data.dashboardType,
      teamId: data.teamId ?? null,
      deletedAt: null
    };
    this.assertKnownWidgets(data.dashboardType, data.widgets);
    const existing =
      (await this.repository.findConfiguration(where)) ??
      (await this.repository.createConfiguration({
        companyId,
        userId,
        dashboardType: data.dashboardType,
        teamId: data.teamId ?? null,
        gridColumns: data.gridColumns,
        gridGap: data.gridGap,
        isDefault: Boolean(data.isDefault),
        metadata: data.metadata ?? {}
      }));
    const id = String(existing.id);
    await this.repository.replaceWidgets(
      id,
      companyId,
      data.widgets.map((widget, index) => this.toWidgetRecord(widget, companyId, id, index))
    );
    const updated = await this.repository.updateConfiguration(id, {
      gridColumns: data.gridColumns,
      gridGap: data.gridGap,
      isDefault: Boolean(data.isDefault),
      metadata: data.metadata ?? {}
    });
    return this.serializeConfiguration(updated);
  }

  async resetConfiguration(req: ApiRequest, dashboardType: DashboardTypeDto, teamId?: string) {
    const companyId = activeCompanyId(req);
    const userId = req.auth?.id;
    if (!userId) throw new Error("Authenticated user is required");
    await assertTeamInCompany(teamId, companyId);
    const current = await this.configuration(req, dashboardType, teamId);
    const widgets = this.defaultWidgets(dashboardType);
    await this.repository.replaceWidgets(
      String(current.id),
      companyId,
      widgets.map((widget, index) =>
        this.toWidgetRecord(widget, companyId, String(current.id), index)
      )
    );
    const updated = await this.repository.updateConfiguration(String(current.id), {
      gridColumns: 12,
      gridGap: 16,
      isDefault: true,
      metadata: {}
    });
    return this.serializeConfiguration(updated);
  }

  private async createDefaultConfiguration(
    companyId: string,
    userId: string,
    dashboardType: DashboardTypeDto,
    teamId: string | null
  ) {
    const widgets = this.defaultWidgets(dashboardType);
    const created = await this.repository.createConfiguration({
      companyId,
      userId,
      dashboardType,
      teamId,
      gridColumns: 12,
      gridGap: 16,
      isDefault: true,
      metadata: {}
    });
    await this.repository.replaceWidgets(
      String(created.id),
      companyId,
      widgets.map((widget, index) =>
        this.toWidgetRecord(widget, companyId, String(created.id), index)
      )
    );
    const updated = await this.repository.updateConfiguration(String(created.id), {});
    return this.serializeConfiguration(updated);
  }

  private defaultWidgets(dashboardType: DashboardTypeDto) {
    return dashboardType === "TEAM" ? teamDashboardWidgets : mainDashboardWidgets;
  }

  private assertKnownWidgets(dashboardType: DashboardTypeDto, widgets: DashboardWidgetDto[]) {
    const allowed = allowedWidgetKeysByDashboardType[dashboardType];
    const unknownWidget = widgets.find((widget) => {
      const sourceKey = String(widget.settings?.sourceKey ?? widget.key).replace(
        /-\d{13}-\d+$/,
        ""
      );
      return !allowed.has(sourceKey);
    });
    if (unknownWidget) {
      throw badRequest(`Unknown dashboard widget: ${unknownWidget.key}`);
    }
  }

  private averageResolutionHours(rows: unknown[]) {
    const durations = rows
      .map((item) => {
        const record = item as { createdAt?: Date; completedAt?: Date | null };
        if (!record.createdAt || !record.completedAt) return null;
        return Math.max(0, record.completedAt.getTime() - record.createdAt.getTime()) / 3600000;
      })
      .filter((item): item is number => typeof item === "number");
    if (!durations.length) return 0;
    return (
      Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
    );
  }

  private toWidgetRecord(
    widget: DashboardWidgetDto,
    companyId: string,
    dashboardConfigId?: string,
    fallbackOrder = 0
  ) {
    const settings = { ...(widget.settings ?? {}), key: widget.key };
    return {
      ...(dashboardConfigId ? { dashboardConfigId } : {}),
      companyId,
      widgetType: widget.widgetType,
      title: widget.title,
      description: widget.description ?? null,
      gridColumn: widget.gridColumn,
      gridRow: widget.gridRow,
      gridWidth: widget.gridWidth,
      gridHeight: widget.gridHeight,
      isVisible: widget.isVisible,
      isPinned: widget.isPinned,
      order: widget.order ?? fallbackOrder,
      refreshIntervalMs: widget.refreshIntervalMs ?? 60000,
      settings,
      metadata: widget.metadata ?? {}
    };
  }

  private serializeConfiguration(
    record: Record<string, unknown>
  ): DashboardConfigurationDto & { id: string } {
    const widgets = Array.isArray(record.widgets) ? record.widgets : [];
    return {
      id: String(record.id),
      dashboardType: record.dashboardType as DashboardTypeDto,
      teamId: (record.teamId as string | null | undefined) ?? null,
      gridColumns: Number(record.gridColumns ?? 12),
      gridGap: Number(record.gridGap ?? 16),
      isDefault: Boolean(record.isDefault),
      metadata: (record.metadata as Record<string, unknown> | null) ?? {},
      widgets: widgets.map((item) => this.serializeWidget(item as Record<string, unknown>))
    };
  }

  private serializeWidget(record: Record<string, unknown>): DashboardWidgetDto {
    const settings = (record.settings as Record<string, unknown> | null) ?? {};
    return {
      id: String(record.id),
      key: String(settings.key ?? record.id),
      widgetType: String(record.widgetType),
      title: String(record.title),
      description: (record.description as string | null | undefined) ?? null,
      gridColumn: Number(record.gridColumn ?? 1),
      gridRow: Number(record.gridRow ?? 1),
      gridWidth: Number(record.gridWidth ?? 3),
      gridHeight: Number(record.gridHeight ?? 2),
      isVisible: Boolean(record.isVisible),
      isPinned: Boolean(record.isPinned),
      order: Number(record.order ?? 0),
      refreshIntervalMs: (record.refreshIntervalMs as number | null | undefined) ?? 60000,
      settings,
      metadata: (record.metadata as Record<string, unknown> | null) ?? {}
    };
  }
}
