"use client";

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  Layers3,
  Palette,
  Power,
  Settings,
  ShieldCheck
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type {
  ActivityItem,
  DashboardCharts,
  DashboardSummary,
  Locale,
  PermissionRef,
  RoleRef,
  TeamRef,
  Texts,
  Theme
} from "../lib/types";
import { countOf, statusColors, statusGroups, statusLabel, statusLegend, slaLabel } from "../lib/utils";
import { ChartPanel } from "./charts";
import { ActivityList } from "./lists";
import { SegmentedControl } from "./controls";

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

export function MainDashboard({
  t,
  summary,
  charts,
  teams,
  activities,
  locale,
  onNew,
  onOpen
}: {
  t: Texts;
  summary: DashboardSummary;
  charts: DashboardCharts;
  teams: TeamRef[];
  activities: ActivityItem[];
  locale: Locale;
  onNew: () => void;
  onOpen: (item: ActivityItem) => void;
}) {
  const palette = teamPalette(teams);
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);
  const dashboardLegend = statusLegend(t);

  return (
    <>
      <section className="kpi-grid">
        {[
          [t.total, summary.total],
          [t.pending, summary.pending],
          [t.running, summary.inProgress],
          [t.done, summary.done],
          [t.critical, summary.critical],
          [t.risk, summary.slaAtRisk]
        ].map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{label === t.risk && Number(value) > 0 ? "SLA" : "OK"}</small>
          </article>
        ))}
      </section>
      <section className="dashboard-panels">
        <ChartPanel title={t.byTeam} values={charts.byTeam.map(countOf)} colors={teamColors} />
        <ChartPanel
          title={t.byClient}
          values={charts.byClient.map(countOf)}
          colors={colorsForValues(charts.byClient, palette)}
        />
        <ChartPanel
          title={t.byPriority}
          values={charts.byPriority.map(countOf)}
          colors={colorsForValues(charts.byPriority, palette)}
        />
        <ChartPanel
          title={t.incidentsByShift}
          values={charts.byShift.map(countOf)}
          colors={colorsForValues(charts.byShift, palette)}
        />
        <ChartPanel
          title={t.monthly}
          values={charts.byStatus.map(countOf)}
          colors={charts.byStatus.map((group) => statusColors[group.status ?? ""] ?? palette[0])}
          labels={charts.byStatus.map((group) => statusLabel(group.status ?? "", t))}
        />
      </section>
      <section className="status-legend" aria-label="Legenda de status">
        {dashboardLegend.map((item) => (
          <span key={item.status}>
            <i style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </section>
      <ActivityList
        t={t}
        activities={activities}
        locale={locale}
        onNew={onNew}
        onOpen={onOpen}
        compact
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
  onOpen
}: {
  t: Texts;
  teams: TeamRef[];
  charts: DashboardCharts;
  activities: ActivityItem[];
  locale: Locale;
  onOpen: (item: ActivityItem) => void;
}) {
  const palette = teamPalette(teams);
  const teamColors = colorsForTeamGroups(charts.byTeam, teams);

  return (
    <>
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
            <b>{team.members?.length ?? 0}</b>
          </article>
        ))}
      </section>
      <section className="dashboard-panels">
        <ChartPanel
          title={t.productivity}
          values={charts.byTeam.map(countOf)}
          colors={teamColors}
        />
        <ChartPanel
          title={t.risk}
          values={charts.byPriority.map(countOf)}
          colors={colorsForValues(charts.byPriority, palette)}
        />
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

export function SettingsView({
  t,
  roles,
  locale,
  setLocale,
  theme,
  setTheme
}: {
  t: Texts;
  roles: string[];
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
}) {
  return (
    <>
      <section className="settings-board panel full-width">
        {[
          ["Administracao", Settings, ["Configuracoes Gerais", "Usuarios", "Equipes", "Perfis", "Permissoes"]],
          ["Gestao", Layers3, ["Status", "Prioridades", "Etiquetas", "Tipos de Atividade", "Cores"]],
          ["Sistema", Activity, ["Notificacoes", "Integracoes", "Personalizacao", "Preferencias do Usuario", "Logs", "Auditoria"]]
        ].map(([title, Icon, items]) => (
          <article className="settings-group" key={String(title)}>
            <div className="panel-header">
              <h2>{String(title)}</h2>
              {typeof Icon === "function" ? <Icon size={18} /> : null}
            </div>
            <div className="settings-links">
              {(items as string[]).map((item) => (
                <button className="compact-button" key={item} type="button">
                  {item}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>{t.theme}</h2>
          <Palette size={18} />
        </div>
        <SegmentedControl
          label={t.theme}
          options={[t.light, t.dark]}
          value={theme === "light" ? t.light : t.dark}
          onChange={(value) => setTheme(value === t.light ? "light" : "dark")}
        />
        <SegmentedControl
          label={t.language}
          options={["pt-BR", "en-GB"]}
          value={locale}
          onChange={(value) => setLocale(value as Locale)}
        />
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>{t.permissions}</h2>
          <ShieldCheck size={18} />
        </div>
        <div className="role-list">
          {roles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>
        <p className="guard-note">{t.visualGuard}. RBAC permanece obrigatorio no backend.</p>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Monitoramento</h2>
          <Power size={18} />
        </div>
        <p className="guard-note">
          {t.tvMode}: auto refresh, indicadores de SLA e Kanban operacional em tela cheia.
        </p>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Turnos</h2>
          <CalendarClock size={18} />
        </div>
        <p className="guard-note">
          Criacao, edicao e visualizacao usam os endpoints reais de turnos.
        </p>
      </section>
    </>
  );
}
