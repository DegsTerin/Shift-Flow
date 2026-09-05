// en-GB: Renders the views interface so its behaviour and accessible structure stay reusable.
"use client";

import { Download } from "lucide-react";
import type { DashboardAvailability, DashboardResource, DashboardStatus } from "../lib/page-data";
import type {
  ActivityItem,
  DashboardCharts,
  DashboardConfiguration,
  DashboardSummary,
  DashboardWidget,
  Locale,
  ReportActivitySummary,
  TeamRef,
  Texts,
  View
} from "../lib/types";
import {
  countOf,
  kanbanMoveCommand,
  priorityLabel,
  statusColors,
  statusGroups,
  statusLabel,
  statusLegend,
  slaLabel
} from "../lib/utils";
import { ChartPanel } from "./charts";
import { CustomizableDashboard, type DashboardWidgetDefinition } from "./custom-dashboard";
import { ActivityList, TableFooter, type TablePagination } from "./lists";

const chartPalette = ["#4f6f88", "#2f7d73", "#6d6aa8", "#9a7131", "#4d7f9f", "#7b8063", "#8a5f73"];
const defaultTeamColor = chartPalette[0];
export const kanbanActivityDragType = "application/x-shiftflow-activity-id";

function hasKanbanActivityDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(kanbanActivityDragType);
}

function seriesPalette() {
  return chartPalette;
}

function colorsForValues(values: unknown[], colors: string[]) {
  return values.map((_, index) => colors[index % colors.length] ?? defaultTeamColor);
}

function chartColorForTeam(teamId: string | null | undefined, teams: TeamRef[], index: number) {
  const teamIndex = teamId ? teams.findIndex((team) => team.id === teamId) : index;
  return (
    chartPalette[(teamIndex >= 0 ? teamIndex : index) % chartPalette.length] ?? defaultTeamColor
  );
}

function colorsForTeamGroups(groups: DashboardCharts["byTeam"], teams: TeamRef[]) {
  return groups.map((group, index) => chartColorForTeam(group.teamId, teams, index));
}

function activityCountsByTeam(groups: DashboardCharts["byTeam"], teams: TeamRef[]) {
  const counts = new Map<string, number>();
  groups.forEach((group, index) => {
    const key = group.teamId ?? teams[index]?.id;
    if (key) counts.set(key, countOf(group));
  });
  return counts;
}

function TeamSummaryStrip({
  teams,
  activityCounts,
  pagination,
  t,
  countsKnown = true
}: {
  teams: TeamRef[];
  activityCounts: Map<string, number>;
  pagination?: TablePagination;
  t?: Texts;
  countsKnown?: boolean;
}) {
  return (
    <div>
      <section className="team-summary">
        {!teams.length && t ? (
          <p className="empty-state" role="status">
            {t.dashboardDirectoryEmpty}
          </p>
        ) : null}
        {teams.map((team, index) => (
          <article className="team-strip" key={team.id ?? team.name}>
            <span style={{ backgroundColor: chartColorForTeam(team.id, teams, index) }} />
            <div className="team-strip-body">
              <div className="team-strip-heading">
                <strong className="team-strip-name">{team.name ?? "-"}</strong>
                <b>
                  {countsKnown
                    ? team.id
                      ? (activityCounts.get(team.id) ?? 0)
                      : 0
                    : t?.dashboardCountUnavailable}
                </b>
              </div>
              <small className="team-strip-sla">
                {team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min SLA` : "-"}
              </small>
            </div>
          </article>
        ))}
      </section>
      {pagination && t ? (
        <TableFooter
          t={t}
          page={Math.max(0, pagination.page - 1)}
          totalPages={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
          totalRows={pagination.total}
          onPage={(page) => pagination.onPage(page + 1)}
        />
      ) : null}
    </div>
  );
}

function dashboardStateText(status: DashboardStatus, t: Texts) {
  return status === "loading"
    ? t.dashboardDependencyLoading
    : status === "skipped"
      ? t.dashboardDependencySkipped
      : t.dashboardDependencyError;
}

function availableDashboardDefinitions(
  definitions: DashboardWidgetDefinition[],
  availability: DashboardAvailability | undefined,
  t: Texts
) {
  if (!availability) return definitions;
  return definitions.map((definition) => {
    const key = definition.key;
    const resource: DashboardResource | undefined =
      key === "status-legend"
        ? undefined
        : key === "team-summary"
          ? "teamDirectory"
          : key.startsWith("summary-") || key === "operational-alerts"
            ? "summary"
            : key === "activity-list" || key === "team-activity-list"
              ? "operationalActivities"
              : "charts";
    const status = resource ? availability[resource] : "ready";
    return status === "ready"
      ? definition
      : {
          ...definition,
          render: () => (
            <article className="panel" aria-busy={status === "loading"}>
              <h2>{definition.title}</h2>
              <p role="status" aria-live="polite">
                {dashboardStateText(status, t)}
              </p>
            </article>
          )
        };
  });
}

function withMainTeamSummary(
  layout: DashboardConfiguration,
  teamSummaryTitle: string
): DashboardConfiguration {
  if (layout.widgets.some((widget) => widget.key === "team-summary")) return layout;
  const teamSummary: DashboardWidget = {
    key: "team-summary",
    widgetType: "LIST",
    title: teamSummaryTitle,
    gridColumn: 1,
    gridRow: 2,
    gridWidth: 12,
    gridHeight: 1,
    isVisible: true,
    isPinned: false,
    order: 6,
    refreshIntervalMs: 60000,
    settings: { sourceKey: "team-summary" }
  };
  return {
    ...layout,
    widgets: [
      ...layout.widgets
        .filter((widget) => widget.order < teamSummary.order)
        .map((widget) => ({ ...widget })),
      teamSummary,
      ...layout.widgets
        .filter((widget) => widget.order >= teamSummary.order)
        .map((widget) => ({ ...widget, order: widget.order + 1 }))
    ]
  };
}

export function withRequiredWidgets(
  layout: DashboardConfiguration,
  definitions: DashboardWidgetDefinition[]
): DashboardConfiguration {
  const existingKeys = new Set(layout.widgets.map((widget) => widget.key));
  const nextOrder = Math.max(-1, ...layout.widgets.map((widget) => widget.order)) + 1;
  const missingWidgets = definitions
    .filter((definition) => !existingKeys.has(definition.key))
    .map((definition, index) => {
      const order = nextOrder + index;
      return {
        key: definition.key,
        widgetType: definition.widgetType,
        title: definition.title,
        gridColumn: order % 2 === 0 ? 1 : 7,
        gridRow: Math.floor(order / 2) + 1,
        gridWidth: definition.defaultWidth,
        gridHeight: definition.defaultHeight,
        isVisible: true,
        isPinned: false,
        order,
        refreshIntervalMs: 60000,
        settings: { sourceKey: definition.key }
      };
    });
  return missingWidgets.length
    ? { ...layout, widgets: [...layout.widgets, ...missingWidgets] }
    : layout;
}

export function prepareMainDashboardLayout(
  layout: DashboardConfiguration,
  teamSummaryTitle: string,
  definitions: DashboardWidgetDefinition[]
) {
  if (layout.isDefault === false) return layout;
  return withRequiredWidgets(withMainTeamSummary(layout, teamSummaryTitle), definitions);
}

export function MainDashboard({
  t,
  summary,
  charts,
  teams,
  activities,
  locale,
  layout,
  onSaveLayout,
  onResetLayout,
  canConfigure,
  availability,
  pagination,
  onNew,
  onOpen
}: {
  t: Texts;
  summary: DashboardSummary;
  charts: DashboardCharts;
  teams: TeamRef[];
  activities: ActivityItem[];
  locale: Locale;
  layout: DashboardConfiguration;
  onSaveLayout: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
  onResetLayout: () => Promise<DashboardConfiguration | void>;
  canConfigure: boolean;
  availability?: DashboardAvailability;
  pagination?: TablePagination;
  onNew?: () => void;
  onOpen?: (item: ActivityItem) => void;
}) {
  const palette = seriesPalette();
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);
  const teamActivityCounts = activityCountsByTeam(charts.byTeam, teams);
  const dashboardLegend = statusLegend(t);
  const sample = summary.averageResolutionSample;
  const sampleKnown = Boolean(
    sample &&
    sample.basis === "LATEST_COMPLETED" &&
    Number.isInteger(sample.count) &&
    sample.count >= 0 &&
    Number.isInteger(sample.limit) &&
    sample.limit > 0 &&
    sample.count <= sample.limit
  );
  const resolutionNote =
    sampleKnown && sample
      ? t.averageResolutionSampleNote
          .replace("{count}", String(sample.count))
          .replace("{limit}", String(sample.limit))
      : t.averageResolutionSampleUnknown;
  const resolutionValue =
    sampleKnown &&
    sample &&
    sample.count > 0 &&
    Number.isFinite(summary.averageResolutionHours) &&
    summary.averageResolutionHours >= 0
      ? `${summary.averageResolutionHours} h`
      : t.averageResolutionUnavailable;
  const metric = (key: string, label: string, value: number | string, note?: string) => (
    <article className="metric-card" key={key}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note ?? (label === t.risk && Number(value) > 0 ? "SLA" : "OK")}</small>
    </article>
  );
  const definitions: DashboardWidgetDefinition[] = [
    {
      key: "summary-total",
      title: t.total,
      widgetType: "SUMMARY_CARD",
      defaultWidth: 2,
      defaultHeight: 2,
      render: () => metric("summary-total", t.total, summary.total)
    },
    {
      key: "summary-pending",
      title: t.pending,
      widgetType: "SUMMARY_CARD",
      defaultWidth: 2,
      defaultHeight: 2,
      render: () => metric("summary-pending", t.pending, summary.pending)
    },
    {
      key: "summary-running",
      title: t.running,
      widgetType: "SUMMARY_CARD",
      defaultWidth: 2,
      defaultHeight: 2,
      render: () => metric("summary-running", t.running, summary.inProgress)
    },
    {
      key: "summary-done",
      title: t.done,
      widgetType: "SUMMARY_CARD",
      defaultWidth: 2,
      defaultHeight: 2,
      render: () => metric("summary-done", t.done, summary.done)
    },
    {
      key: "summary-critical",
      title: t.critical,
      widgetType: "SUMMARY_CARD",
      defaultWidth: 2,
      defaultHeight: 2,
      render: () => metric("summary-critical", t.critical, summary.critical)
    },
    {
      key: "summary-risk",
      title: t.risk,
      widgetType: "INDICATOR",
      defaultWidth: 2,
      defaultHeight: 2,
      render: () => metric("summary-risk", t.risk, summary.slaAtRisk)
    },
    {
      key: "summary-overdue",
      title: t.overdue,
      widgetType: "SUMMARY_CARD",
      defaultWidth: 3,
      defaultHeight: 2,
      render: () => metric("summary-overdue", t.overdue, summary.overdue)
    },
    {
      key: "summary-average-resolution",
      title: t.averageResolution,
      widgetType: "INDICATOR",
      defaultWidth: 3,
      defaultHeight: 2,
      render: () =>
        metric("summary-average-resolution", t.averageResolution, resolutionValue, resolutionNote)
    },
    {
      key: "kanban-summary",
      title: t.kanbanSummary,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.kanbanSummary}
          values={charts.byStatus.map(countOf)}
          colors={charts.byStatus.map((group) => statusColors[group.status ?? ""] ?? palette[0])}
          labels={charts.byStatus.map((group) => statusLabel(group.status ?? "", t))}
        />
      )
    },
    {
      key: "operational-alerts",
      title: t.operationalAlerts,
      widgetType: "LIST",
      defaultWidth: 12,
      defaultHeight: 2,
      render: () => (
        <section className="alert-list">
          <span>
            {summary.overdue} {t.filterOverdue}
          </span>
          <span>
            {summary.critical} {t.filterCritical}
          </span>
          <span>
            {summary.slaAtRisk} {t.filterSlaRisk}
          </span>
        </section>
      )
    },
    {
      key: "team-summary",
      title: t.teamsWidgetDefaultTitle,
      widgetType: "LIST",
      defaultWidth: 12,
      defaultHeight: 1,
      render: () => (
        <TeamSummaryStrip
          teams={teams}
          activityCounts={teamActivityCounts}
          pagination={pagination}
          t={t}
          countsKnown={!availability || availability.charts === "ready"}
        />
      )
    },
    {
      key: "chart-team",
      title: t.byTeam,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel title={t.byTeam} values={charts.byTeam.map(countOf)} colors={teamColors} />
      )
    },
    {
      key: "chart-client",
      title: t.byClient,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.byClient}
          values={charts.byClient.map(countOf)}
          colors={colorsForValues(charts.byClient, palette)}
        />
      )
    },
    {
      key: "chart-priority",
      title: t.byPriority,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.byPriority}
          values={charts.byPriority.map(countOf)}
          colors={colorsForValues(charts.byPriority, palette)}
          labels={charts.byPriority.map((group) => priorityLabel(group.priority, t))}
        />
      )
    },
    {
      key: "chart-shift",
      title: t.byShift,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.byShift}
          values={charts.byShift.map(countOf)}
          colors={colorsForValues(charts.byShift, palette)}
        />
      )
    },
    {
      key: "chart-status",
      title: t.byStatus,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.byStatus}
          values={charts.byStatus.map(countOf)}
          colors={charts.byStatus.map((group) => statusColors[group.status ?? ""] ?? palette[0])}
          labels={charts.byStatus.map((group) => statusLabel(group.status ?? "", t))}
        />
      )
    },
    {
      key: "status-legend",
      title: t.statusLegend,
      widgetType: "INDICATOR",
      defaultWidth: 6,
      defaultHeight: 1,
      render: () => (
        <section className="status-legend" aria-label={t.statusLegend}>
          {dashboardLegend.map((item) => (
            <span key={item.status}>
              <i style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </section>
      )
    },
    {
      key: "activity-list",
      title: t.operationalList,
      widgetType: "RECENT_ACTIVITIES",
      defaultWidth: 12,
      defaultHeight: 4,
      render: () => (
        <ActivityList
          t={t}
          activities={activities}
          locale={locale}
          onNew={onNew}
          onOpen={onOpen}
          compact
        />
      )
    }
  ];

  return (
    <>
      {availability && availability.configuration !== "ready" ? (
        <p className="guard-note full-width" role="status" aria-live="polite">
          {dashboardStateText(availability.configuration, t)} {t.dashboardLayoutReadOnly}
        </p>
      ) : null}
      <CustomizableDashboard
        t={t}
        config={prepareMainDashboardLayout(layout, t.teamsWidgetDefaultTitle, definitions)}
        definitions={availableDashboardDefinitions(definitions, availability, t)}
        canConfigure={canConfigure && (!availability || availability.configuration === "ready")}
        onSave={onSaveLayout}
        onReset={onResetLayout}
      />
    </>
  );
}

export function TeamDashboard({
  t,
  teams,
  charts,
  activities,
  locale,
  layout,
  onSaveLayout,
  onResetLayout,
  canConfigure,
  availability,
  pagination,
  onNew,
  onOpen
}: {
  t: Texts;
  teams: TeamRef[];
  charts: DashboardCharts;
  activities: ActivityItem[];
  locale: Locale;
  layout: DashboardConfiguration;
  onSaveLayout: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
  onResetLayout: () => Promise<DashboardConfiguration | void>;
  canConfigure: boolean;
  availability?: DashboardAvailability;
  pagination?: TablePagination;
  onNew?: () => void;
  onOpen?: (item: ActivityItem) => void;
}) {
  const palette = seriesPalette();
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);
  const teamActivityCounts = activityCountsByTeam(charts.byTeam, teams);
  const definitions: DashboardWidgetDefinition[] = [
    {
      key: "team-summary",
      title: t.teamsWidgetDefaultTitle,
      widgetType: "LIST",
      defaultWidth: 12,
      defaultHeight: 2,
      render: () => (
        <TeamSummaryStrip
          teams={teams}
          activityCounts={teamActivityCounts}
          pagination={pagination}
          t={t}
          countsKnown={!availability || availability.charts === "ready"}
        />
      )
    },
    {
      key: "team-productivity",
      title: t.byTeam,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel title={t.byTeam} values={charts.byTeam.map(countOf)} colors={teamColors} />
      )
    },
    {
      key: "team-risk",
      title: t.byPriority,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.byPriority}
          values={charts.byPriority.map(countOf)}
          colors={colorsForValues(charts.byPriority, palette)}
          labels={charts.byPriority.map((group) => priorityLabel(group.priority, t))}
        />
      )
    },
    {
      key: "team-activity-list",
      title: t.operationalList,
      widgetType: "RECENT_ACTIVITIES",
      defaultWidth: 12,
      defaultHeight: 4,
      render: () => (
        <ActivityList
          t={t}
          activities={activities}
          locale={locale}
          onNew={onNew}
          onOpen={onOpen}
          compact
        />
      )
    }
  ];

  return (
    <>
      {availability && availability.configuration !== "ready" ? (
        <p className="guard-note full-width" role="status" aria-live="polite">
          {dashboardStateText(availability.configuration, t)} {t.dashboardLayoutReadOnly}
        </p>
      ) : null}
      <CustomizableDashboard
        t={t}
        config={layout}
        definitions={availableDashboardDefinitions(definitions, availability, t)}
        canConfigure={canConfigure && (!availability || availability.configuration === "ready")}
        onSave={onSaveLayout}
        onReset={onResetLayout}
      />
    </>
  );
}

export function KanbanBoard({
  t,
  activities,
  dragged,
  setDragged,
  canMove,
  onMove,
  onOpen,
  pagination
}: {
  t: Texts;
  activities: ActivityItem[];
  dragged: string | null;
  setDragged: (value: string | null) => void;
  canMove: boolean;
  onMove: (id: string, status: string) => void;
  onOpen: (item: ActivityItem) => void;
  pagination: TablePagination;
}) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return (
    <section className="full-width">
      <div className="kanban-board" tabIndex={0}>
        {statusGroups.map((group) => (
          <article
            className="kanban-column"
            key={group}
            onDragOver={(event) => {
              if (!canMove || !hasKanbanActivityDrag(event.dataTransfer)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              const internalDrag = hasKanbanActivityDrag(event.dataTransfer);
              if (internalDrag) event.preventDefault();
              const payload = internalDrag
                ? event.dataTransfer.getData(kanbanActivityDragType)
                : "";
              const command = canMove
                ? kanbanMoveCommand(
                    activities,
                    payload && payload === dragged ? payload : null,
                    group
                  )
                : undefined;
              setDragged(null);
              if (command) onMove(command.id, command.status);
            }}
          >
            <h2>{statusLabel(group, t)}</h2>
            {activities
              .filter((item) => item.status === group)
              .map((item) => (
                <div
                  className="kanban-card"
                  draggable={canMove}
                  key={`${group}-${item.id}`}
                  onDragEnd={() => setDragged(null)}
                  onDragStart={(event) => {
                    if (!canMove) return;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(kanbanActivityDragType, item.id);
                    setDragged(item.id);
                  }}
                  style={{ borderLeftColor: item.team?.color ?? defaultTeamColor }}
                >
                  <strong>{item.id.slice(0, 8)}</strong>
                  <button
                    aria-label={`${t.details}: ${item.title}`}
                    className="kanban-open-button"
                    onClick={() => onOpen(item)}
                    type="button"
                  >
                    {item.title}
                  </button>
                  <div>
                    <span>{item.client?.name ?? "-"}</span>
                    <span>{item.team?.name ?? "-"}</span>
                    <span>{item.serviceName ?? item.systemName ?? "-"}</span>
                  </div>
                  <small>
                    {item.assignee?.displayName ?? "-"} - {slaLabel(item.slaDueAt, t)}
                  </small>
                  {canMove ? (
                    <label
                      className="kanban-status-control"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="sr-only">{t.moveToStatus}</span>
                      <select
                        aria-label={`${t.moveToStatus}: ${item.title}`}
                        value={item.status}
                        onChange={(event) => {
                          const command = kanbanMoveCommand(
                            activities,
                            item.id,
                            event.target.value
                          );
                          if (command) onMove(command.id, command.status);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {statusGroups.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status, t)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ))}
          </article>
        ))}
      </div>
      <TableFooter
        t={t}
        page={pagination.page - 1}
        totalPages={totalPages}
        totalRows={pagination.total}
        onPage={(page) => pagination.onPage(page + 1)}
      />
    </section>
  );
}

export function ReportsView({ t, summary }: { t: Texts; summary: ReportActivitySummary }) {
  const palette = seriesPalette();

  return (
    <>
      <section className="dashboard-panels">
        <article className="metric-card">
          <span>{t.total}</span>
          <strong>{summary.total}</strong>
          <small>{t.reports}</small>
        </article>
        <ChartPanel
          title={t.filterStatus}
          values={summary.byStatus.map(countOf)}
          colors={summary.byStatus.map((group) => statusColors[group.status ?? ""] ?? palette[0])}
          labels={summary.byStatus.map((group) => statusLabel(group.status ?? "", t))}
        />
        <ChartPanel
          title={t.byPriority}
          values={summary.byPriority.map(countOf)}
          colors={colorsForValues(summary.byPriority, palette)}
          labels={summary.byPriority.map((group) => priorityLabel(group.priority, t))}
        />
      </section>
      <section className="panel full-width">
        <div className="panel-header">
          <h2>{t.reports}</h2>
          <button className="compact-button" onClick={() => window.print()}>
            <Download size={16} />
            {t.export}
          </button>
        </div>
      </section>
    </>
  );
}

export function SettingsView({
  t,
  canOpen,
  onNavigate
}: {
  t: Texts;
  canOpen: (view: View) => boolean;
  onNavigate: (view: View) => void;
}) {
  const groups: Array<{ title: string; description: string; view: View }> = [
    { title: t.company, description: t.companySettingsDescription, view: "users" },
    { title: t.users, description: t.userSettingsDescription, view: "users" },
    { title: t.teams, description: t.teamSettingsDescription, view: "teams" },
    { title: t.clients, description: t.clientSettingsDescription, view: "clients" },
    { title: t.shifts, description: t.shiftSettingsDescription, view: "shifts" },
    { title: t.roles, description: t.roleSettingsDescription, view: "roles" },
    {
      title: t.interface,
      description: t.interfaceSettingsDescription,
      view: "dashboard"
    },
    {
      title: t.security,
      description: t.securitySettingsDescription,
      view: "roles"
    }
  ];

  return (
    <section className="panel full-width settings-shell">
      <div className="panel-header">
        <h2>{t.settings}</h2>
      </div>
      <div className="settings-grid">
        {groups.map((group) => (
          <button
            className="settings-group"
            disabled={!canOpen(group.view)}
            key={group.title}
            onClick={() => onNavigate(group.view)}
            type="button"
          >
            <strong>{group.title}</strong>
            <span>{group.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
