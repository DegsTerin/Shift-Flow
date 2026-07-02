"use client";

import {
  CheckCircle2,
  Copy,
  Download,
  ShieldCheck
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type {
  ActivityItem,
  DashboardCharts,
  DashboardConfiguration,
  DashboardSummary,
  DashboardWidget,
  Locale,
  PermissionRef,
  RoleRef,
  TeamRef,
  Texts
} from "../lib/types";
import { countOf, statusColors, statusGroups, statusLabel, statusLegend, slaLabel } from "../lib/utils";
import { ChartPanel } from "./charts";
import { CustomizableDashboard, type DashboardWidgetDefinition } from "./custom-dashboard";
import { ActivityList } from "./lists";

const defaultTeamColor = "#0ea5e9";

function teamPalette(teams: TeamRef[]) {
  const colors = teams.map((team) => team.color || defaultTeamColor);
  return colors.length ? colors : [defaultTeamColor];
}

function colorsForValues(values: unknown[], colors: string[]) {
  return values.map((_, index) => colors[index % colors.length] ?? defaultTeamColor);
}

function colorsForTeamGroups(groups: DashboardCharts["byTeam"], teams: TeamRef[]) {
  const teamColorById = new Map(
    teams
      .filter((team) => team.id)
      .map((team) => [team.id as string, team.color || defaultTeamColor])
  );

  return groups.map((group, index) =>
    group.teamId
      ? (teamColorById.get(group.teamId) ?? defaultTeamColor)
      : (teams[index]?.color ?? defaultTeamColor)
  );
}

function TeamSummaryStrip({ teams }: { teams: TeamRef[] }) {
  return (
    <section className="team-summary">
      {teams.map((team) => (
        <article className="team-strip" key={team.id ?? team.name}>
          <span style={{ backgroundColor: team.color ?? defaultTeamColor }} />
          <div className="team-strip-body">
            <strong className="team-strip-name">{team.name ?? "-"}</strong>
            <small className="team-strip-sla">
              {team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min SLA` : "-"}
            </small>
          </div>
        </article>
      ))}
    </section>
  );
}

function withMainTeamSummary(layout: DashboardConfiguration): DashboardConfiguration {
  if (layout.widgets.some((widget) => widget.key === "team-summary")) return layout;
  const teamSummary: DashboardWidget = {
    key: "team-summary",
    widgetType: "LIST",
    title: "Equipes",
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
  onNew: () => void;
  onOpen: (item: ActivityItem) => void;
}) {
  const palette = teamPalette(teams);
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);
  const dashboardLegend = statusLegend(t);
  const metric = (key: string, label: string, value: number) => (
    <article className="metric-card" key={key}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{label === t.risk && value > 0 ? "SLA" : "OK"}</small>
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
      key: "team-summary",
      title: t.teams,
      widgetType: "LIST",
      defaultWidth: 12,
      defaultHeight: 1,
      render: () => <TeamSummaryStrip teams={teams} />
    },
    {
      key: "chart-team",
      title: t.byTeam,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => <ChartPanel title={t.byTeam} values={charts.byTeam.map(countOf)} colors={teamColors} />
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
        />
      )
    },
    {
      key: "chart-shift",
      title: t.incidentsByShift,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.incidentsByShift}
          values={charts.byShift.map(countOf)}
          colors={colorsForValues(charts.byShift, palette)}
        />
      )
    },
    {
      key: "chart-status",
      title: t.monthly,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.monthly}
          values={charts.byStatus.map(countOf)}
          colors={charts.byStatus.map((group) => statusColors[group.status ?? ""] ?? palette[0])}
          labels={charts.byStatus.map((group) => statusLabel(group.status ?? "", t))}
        />
      )
    },
    {
      key: "status-legend",
      title: "Legenda de status",
      widgetType: "INDICATOR",
      defaultWidth: 6,
      defaultHeight: 1,
      render: () => (
        <section className="status-legend" aria-label="Legenda de status">
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
    <CustomizableDashboard
      t={t}
      config={withMainTeamSummary(layout)}
      definitions={definitions}
      onSave={onSaveLayout}
      onReset={onResetLayout}
    />
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
  onOpen: (item: ActivityItem) => void;
}) {
  const palette = teamPalette(teams);
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);
  const definitions: DashboardWidgetDefinition[] = [
    {
      key: "team-summary",
      title: t.teams,
      widgetType: "LIST",
      defaultWidth: 12,
      defaultHeight: 2,
      render: () => <TeamSummaryStrip teams={teams} />
    },
    {
      key: "team-productivity",
      title: t.productivity,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel title={t.productivity} values={charts.byTeam.map(countOf)} colors={teamColors} />
      )
    },
    {
      key: "team-risk",
      title: t.risk,
      widgetType: "BAR_CHART",
      defaultWidth: 6,
      defaultHeight: 3,
      render: () => (
        <ChartPanel
          title={t.risk}
          values={charts.byPriority.map(countOf)}
          colors={colorsForValues(charts.byPriority, palette)}
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
          onNew={() => undefined}
          onOpen={onOpen}
          compact
        />
      )
    }
  ];

  return (
    <CustomizableDashboard
      t={t}
      config={layout}
      definitions={definitions}
      onSave={onSaveLayout}
      onReset={onResetLayout}
    />
  );
}

export function KanbanBoard({
  t,
  activities,
  dragged,
  setDragged,
  onMove,
  onOpen
}: {
  t: Texts;
  activities: ActivityItem[];
  dragged: string | null;
  setDragged: (value: string | null) => void;
  onMove: (id: string, status: string) => void;
  onOpen: (item: ActivityItem) => void;
}) {
  return (
    <section className="kanban-board" tabIndex={0}>
      {statusGroups.map((group) => (
        <article
          className="kanban-column"
          key={group}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => dragged && onMove(dragged, group)}
        >
          <h2>{statusLabel(group, t)}</h2>
          {activities
            .filter((item) => item.status === group)
            .map((item) => (
              <div
                className="kanban-card"
                draggable
                key={`${group}-${item.id}`}
                onClick={() => onOpen(item)}
                onDragStart={() => setDragged(item.id)}
                style={{ borderLeftColor: item.team?.color ?? defaultTeamColor }}
              >
                <strong>{item.id.slice(0, 8)}</strong>
                <p>{item.title}</p>
                <div>
                  <span>{item.client?.name ?? "-"}</span>
                  <span>{item.team?.name ?? "-"}</span>
                  <span>{item.serviceName ?? item.systemName ?? "-"}</span>
                </div>
                <small>
                  {item.assignee?.displayName ?? "-"} - {slaLabel(item.slaDueAt)}
                </small>
              </div>
            ))}
        </article>
      ))}
    </section>
  );
}

export function ReportsView({
  t,
  charts,
  teams,
  activities,
  locale,
  onOpen
}: {
  t: Texts;
  charts: DashboardCharts;
  teams: TeamRef[];
  activities: ActivityItem[];
  locale: Locale;
  onOpen: (item: ActivityItem) => void;
}) {
  const palette = teamPalette(teams);
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);

  return (
    <>
      <section className="dashboard-panels">
        <ChartPanel
          title={t.monthly}
          values={charts.byStatus.map(countOf)}
          colors={colorsForValues(charts.byStatus, palette)}
        />
        <ChartPanel
          title={t.productivity}
          values={charts.byTeam.map(countOf)}
          colors={teamColors}
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
        <div className="report-list">
          {[
            "Resumo de turno",
            "SLA por cliente",
            "Auditoria operacional",
            "Backlog por prioridade"
          ].map((item) => (
            <div key={item}>
              <CheckCircle2 size={18} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
      <ActivityList
        t={t}
        activities={activities}
        locale={locale}
        onNew={() => undefined}
        onOpen={onOpen}
        compact
      />
    </>
  );
}

function permissionLabel(permission: PermissionRef) {
  return `${permission.resource ?? "-"}:${permission.action ?? "-"}`;
}

export function RoleManagementView({
  t,
  roles,
  permissions,
  busy,
  onCreateRole,
  onUpdateRole,
  onAssignPermission,
  onRemovePermission,
  onDuplicateRole,
  onDeleteRole
}: {
  t: Texts;
  roles: RoleRef[];
  permissions: PermissionRef[];
  busy: boolean;
  onCreateRole: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateRole: (roleId: string, event: FormEvent<HTMLFormElement>) => void;
  onAssignPermission: (roleId: string, permissionId: string) => void;
  onRemovePermission: (roleId: string, permissionId: string) => void;
  onDuplicateRole: (roleId: string) => void;
  onDeleteRole: (roleId: string) => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const effectiveRoleId = selectedRole?.id ?? "";
  const assignedPermissionIds = useMemo(
    () =>
      new Set(
        selectedRole?.permissions
          ?.map((item) => item.permissionId ?? item.permission?.id)
          .filter(Boolean) ?? []
      ),
    [selectedRole]
  );
  const availablePermissions = permissions.filter(
    (permission) => permission.id && !assignedPermissionIds.has(permission.id)
  );
  const [selectedPermissionId, setSelectedPermissionId] = useState(availablePermissions[0]?.id ?? "");
  const effectivePermissionId = availablePermissions.some(
    (permission) => permission.id === selectedPermissionId
  )
    ? selectedPermissionId
    : (availablePermissions[0]?.id ?? "");

  return (
    <section className="panel full-width role-management">
      <div className="panel-header">
        <h2>{t.rolesManagement}</h2>
        <ShieldCheck size={18} />
      </div>
      <div className="role-admin-shell">
        <aside className="role-sidebar">
          <form className="role-create-form" onSubmit={onCreateRole}>
            <h3>Novo perfil</h3>
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              Escopo
              <select name="scope" defaultValue="COMPANY">
                <option value="COMPANY">Empresa</option>
                <option value="TEAM">Equipe</option>
                <option value="CLIENT">Cliente</option>
              </select>
            </label>
            <label>
              Descricao
              <textarea name="description" />
            </label>
            <label>
              Cor
              <input name="color" type="color" defaultValue="#0f766e" />
            </label>
            <button className="primary-button" disabled={busy} type="submit">
              {t.save}
            </button>
          </form>
          <div className="role-selector-list">
            {roles.map((role) => (
              <button
                className={role.id === effectiveRoleId ? "selected" : ""}
                key={role.id ?? role.name}
                type="button"
                onClick={() => setSelectedRoleId(role.id ?? "")}
              >
                <i style={{ backgroundColor: role.color ?? "#0f766e" }} />
                <strong>{role.name ?? "-"}</strong>
                <span>{role.isActive === false ? "Inativo" : (role.scope ?? "COMPANY")}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="role-main">
          {selectedRole ? (
            <>
              <form
                className="role-edit-form"
                key={selectedRole.id}
                onSubmit={(event) => onUpdateRole(effectiveRoleId, event)}
              >
                <div className="section-heading">
                  <h3>Detalhes do perfil</h3>
                  <span>
                    {assignedPermissionIds.size} permissoes - {selectedRole._count?.assignments ?? 0} usuarios
                  </span>
                </div>
                <div className="role-edit-fields">
                  <label>
                    Nome
                    <input name="name" defaultValue={selectedRole.name ?? ""} required />
                  </label>
                  <label>
                    Escopo
                    <select name="scope" defaultValue={selectedRole.scope ?? "COMPANY"}>
                      <option value="COMPANY">Empresa</option>
                      <option value="TEAM">Equipe</option>
                      <option value="CLIENT">Cliente</option>
                    </select>
                  </label>
                  <label>
                    Descricao
                    <textarea name="description" defaultValue={selectedRole.description ?? ""} />
                  </label>
                  <label>
                    Cor
                    <input name="color" type="color" defaultValue={selectedRole.color ?? "#0f766e"} />
                  </label>
                  <label className="toggle-label">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={selectedRole.isActive !== false}
                    />
                    Ativo
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !effectiveRoleId}
                    type="submit"
                  >
                    {t.save}
                  </button>
                  <button
                    className="compact-button"
                    disabled={busy || !effectiveRoleId}
                    type="button"
                    onClick={() => onDuplicateRole(effectiveRoleId)}
                  >
                    <Copy size={16} />
                    Duplicar
                  </button>
                  <button
                    className="danger-button"
                    disabled={
                      busy ||
                      !effectiveRoleId ||
                      selectedRole.isSystem ||
                      Boolean(selectedRole._count?.assignments)
                    }
                    type="button"
                    onClick={() => onDeleteRole(effectiveRoleId)}
                  >
                    Excluir
                  </button>
                </div>
              </form>
              <section className="role-permission-panel">
                <div className="section-heading">
                  <h3>Permissoes</h3>
                </div>
                <div className="role-permission-controls">
                  <select
                    value={effectivePermissionId}
                    disabled={busy || !effectiveRoleId || !availablePermissions.length}
                    onChange={(event) => setSelectedPermissionId(event.target.value)}
                  >
                    {availablePermissions.length ? null : (
                      <option value="">Sem permissoes disponiveis</option>
                    )}
                    {availablePermissions.map((permission) => (
                      <option key={permission.id} value={permission.id}>
                        {permissionLabel(permission)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-button"
                    disabled={busy || !effectiveRoleId || !effectivePermissionId}
                    type="button"
                    onClick={() => onAssignPermission(effectiveRoleId, effectivePermissionId)}
                  >
                    Adicionar
                  </button>
                </div>
                <div className="permission-table">
                  <div className="permission-table-head">
                    <span>Recurso</span>
                    <span>Acao</span>
                    <span>Descricao</span>
                    <span />
                  </div>
                  {selectedRole.permissions?.length ? (
                    selectedRole.permissions.map((item) => {
                      const permissionId = item.permissionId ?? item.permission?.id ?? "";
                      return (
                        <div className="permission-table-row" key={item.id ?? permissionId}>
                          <strong>{item.permission?.resource ?? "-"}</strong>
                          <span>{item.permission?.action ?? "-"}</span>
                          <small>{item.permission?.description ?? "-"}</small>
                          <button
                            className="danger-button"
                            disabled={busy || !permissionId}
                            type="button"
                            onClick={() => onRemovePermission(effectiveRoleId, permissionId)}
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-state">Nenhuma permissao vinculada.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <p className="empty-state">Nenhum perfil encontrado.</p>
          )}
        </section>
      </div>
    </section>
  );
}
