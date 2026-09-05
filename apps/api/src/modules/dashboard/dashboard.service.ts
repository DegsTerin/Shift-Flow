// en-GB: Implements dashboard rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest } from "../../shared/errors/app-error.js";
import { resolveDateRange, type DateRangeQuery } from "../../shared/services/date-range.service.js";
import { activeCompanyId, assertTeamInCompany } from "../../shared/services/scope.service.js";
import type {
  DashboardConfigurationDto,
  DashboardTypeDto,
  DashboardWidgetDto,
  DashboardWidgetTypeDto
} from "./dashboard.dto.js";
import { DashboardRepository, type DashboardConfigurationContext } from "./dashboard.repository.js";

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

  private async where(
    req: ApiRequest,
    checkedAt: Date,
    slaRiskUntil = new Date(checkedAt.getTime() + 60 * 60 * 1000)
  ) {
    const companyId = activeCompanyId(req);
    const query = req.query as Record<string, unknown>;
    const createdAt = await resolveDateRange(companyId, {
      from: query.from as DateRangeQuery["from"],
      to: query.to as DateRangeQuery["to"]
    });
    const search = query.search ? String(query.search).trim() : "";
    const uuidSearch =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    return {
      companyId,
      deletedAt: null,
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(query.attention === "OVERDUE"
        ? { AND: [{ status: { notIn: ["DONE", "CANCELLED"] }, slaDueAt: { lt: checkedAt } }] }
        : {}),
      ...(query.attention === "SLA_RISK"
        ? {
            AND: [
              {
                status: { notIn: ["DONE", "CANCELLED"] },
                slaDueAt: {
                  gte: checkedAt,
                  lte: slaRiskUntil
                }
              }
            ]
          }
        : {}),
      ...(query.attention === "CRITICAL" ? { AND: [{ priority: "CRITICAL" }] } : {}),
      ...(createdAt ? { createdAt } : {}),
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
    const checkedAt = new Date();
    const slaRiskUntil = new Date(checkedAt.getTime() + 60 * 60 * 1000);
    const where = await this.where(req, checkedAt, slaRiskUntil);
    const snapshot = await this.repository.summarySnapshot(
      where,
      withConditions(
        where,
        { status: { notIn: ["DONE", "CANCELLED"] } },
        {
          slaDueAt: {
            gte: checkedAt,
            lte: slaRiskUntil
          }
        }
      ),
      withConditions(
        where,
        { status: { notIn: ["DONE", "CANCELLED"] } },
        { slaDueAt: { lt: checkedAt } }
      )
    );
    const { total, byStatus, byPriority, slaAtRisk, overdue, completedActivities } = snapshot;
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
    const checkedAt = new Date();
    return this.repository.chartsSnapshot(await this.where(req, checkedAt));
  }

  async operationalList(req: ApiRequest) {
    const checkedAt = new Date();
    return this.repository.operationalList(await this.where(req, checkedAt));
  }

  async configuration(req: ApiRequest, dashboardType: DashboardTypeDto, teamId?: string) {
    const companyId = activeCompanyId(req);
    const userId = req.auth?.id;
    if (!userId) throw new Error("Authenticated user is required");
    await assertTeamInCompany(teamId, companyId);
    const where = { companyId, userId, dashboardType, teamId: teamId ?? null, deletedAt: null };
    const existing = await this.repository.findConfiguration(where);
    if (existing) return this.serializeConfiguration(existing);
    return this.defaultConfiguration(dashboardType, teamId ?? null);
  }

  async saveConfiguration(
    req: ApiRequest,
    dashboardType: DashboardTypeDto,
    data: DashboardConfigurationDto
  ) {
    if (dashboardType !== data.dashboardType) {
      throw badRequest("Dashboard type in the path must match the request body");
    }
    const companyId = activeCompanyId(req);
    const userId = req.auth?.id;
    if (!userId) throw new Error("Authenticated user is required");
    const context: DashboardConfigurationContext = {
      companyId,
      userId,
      dashboardType,
      teamId: data.teamId ?? null
    };
    const widgets = this.normaliseWidgets(data.widgets);
    this.assertKnownWidgets(dashboardType, widgets);
    const updated = await this.repository.writeConfiguration(
      context,
      {
        gridColumns: data.gridColumns,
        gridGap: data.gridGap,
        isDefault: Boolean(data.isDefault),
        metadata: data.metadata ?? {}
      },
      widgets.map((widget, index) => this.toWidgetRecord(widget, index))
    );
    return this.serializeConfiguration(updated);
  }

  async resetConfiguration(req: ApiRequest, dashboardType: DashboardTypeDto, teamId?: string) {
    const companyId = activeCompanyId(req);
    const userId = req.auth?.id;
    if (!userId) throw new Error("Authenticated user is required");
    const context: DashboardConfigurationContext = {
      companyId,
      userId,
      dashboardType,
      teamId: teamId ?? null
    };
    const widgets = this.defaultWidgets(dashboardType);
    const updated = await this.repository.writeConfiguration(
      context,
      { gridColumns: 12, gridGap: 16, isDefault: true, metadata: {} },
      widgets.map((widget, index) => this.toWidgetRecord(widget, index))
    );
    return this.serializeConfiguration(updated);
  }

  private defaultConfiguration(
    dashboardType: DashboardTypeDto,
    teamId: string | null
  ): DashboardConfigurationDto {
    return {
      dashboardType,
      teamId,
      gridColumns: 12,
      gridGap: 16,
      isDefault: true,
      metadata: {},
      widgets: this.defaultWidgets(dashboardType).map((widget) => ({
        ...widget,
        description: widget.description ?? null,
        refreshIntervalMs: widget.refreshIntervalMs ?? 60000,
        settings: { ...(widget.settings ?? {}), key: widget.key },
        metadata: widget.metadata ?? {}
      }))
    };
  }

  private defaultWidgets(dashboardType: DashboardTypeDto) {
    return dashboardType === "TEAM" ? teamDashboardWidgets : mainDashboardWidgets;
  }

  private normaliseWidgets(widgets: DashboardWidgetDto[]) {
    return widgets
      .map((widget, inputOrder) => ({ widget, inputOrder }))
      .sort(
        (left, right) =>
          left.widget.order - right.widget.order || left.inputOrder - right.inputOrder
      )
      .map(({ widget }, order) => ({ ...widget, order }));
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
        const duration = record.completedAt.getTime() - record.createdAt.getTime();
        return duration >= 0 ? duration / 3600000 : null;
      })
      .filter((item): item is number => typeof item === "number");
    if (!durations.length) return 0;
    return (
      Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
    );
  }

  private toWidgetRecord(widget: DashboardWidgetDto, fallbackOrder = 0) {
    const settings = { ...(widget.settings ?? {}), key: widget.key };
    return {
      ...(widget.id ? { id: widget.id } : {}),
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
    const serialisedWidgets = widgets.map((item) =>
      this.serializeWidget(item as Record<string, unknown>)
    );
    return {
      id: String(record.id),
      dashboardType: record.dashboardType as DashboardTypeDto,
      teamId: (record.teamId as string | null | undefined) ?? null,
      gridColumns: Number(record.gridColumns ?? 12),
      gridGap: Number(record.gridGap ?? 16),
      isDefault: Boolean(record.isDefault),
      metadata: (record.metadata as Record<string, unknown> | null) ?? {},
      widgets: this.normaliseWidgets(serialisedWidgets)
    };
  }

  private serializeWidget(record: Record<string, unknown>): DashboardWidgetDto {
    const settings = (record.settings as Record<string, unknown> | null) ?? {};
    return {
      id: String(record.id),
      key: String(settings.key ?? record.id),
      widgetType: String(record.widgetType) as DashboardWidgetTypeDto,
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
