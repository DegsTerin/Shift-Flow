"use client";

import { Activity, CalendarClock, CheckCircle2, Download, Settings, ShieldCheck } from "lucide-react";
import type { ActivityItem, DashboardCharts, DashboardSummary, Locale, TeamRef, Texts, Theme } from "../lib/types";
import { countOf, statusGroups, statusLabel, slaLabel } from "../lib/utils";
import { ChartPanel } from "./charts";
import { ActivityList } from "./lists";
import { SegmentedControl } from "./controls";

export function MainDashboard({ t, summary, charts, activities, locale, onNew, onOpen }: { t: Texts; summary: DashboardSummary; charts: DashboardCharts; activities: ActivityItem[]; locale: Locale; onNew: () => void; onOpen: (item: ActivityItem) => void }) {
  return (
    <>
      <section className="kpi-grid">
        {[[t.total, summary.total], [t.pending, summary.pending], [t.running, summary.inProgress], [t.done, summary.done], [t.critical, summary.critical], [t.risk, summary.slaAtRisk]].map(([label, value]) => (
          <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{label === t.risk && Number(value) > 0 ? "SLA" : "OK"}</small></article>
        ))}
      </section>
      <section className="dashboard-panels">
        <ChartPanel title={t.byTeam} values={charts.byTeam.map(countOf)} />
        <ChartPanel title={t.byClient} values={charts.byClient.map(countOf)} />
        <ChartPanel title={t.byPriority} values={charts.byPriority.map(countOf)} />
        <ChartPanel title={t.incidentsByShift} values={charts.byShift.map(countOf)} />
        <ChartPanel title={t.monthly} values={charts.byStatus.map(countOf)} />
      </section>
      <ActivityList t={t} activities={activities} locale={locale} onNew={onNew} onOpen={onOpen} compact />
    </>
  );
}

export function TeamDashboard({ t, teams, charts, activities, locale, onOpen }: { t: Texts; teams: TeamRef[]; charts: DashboardCharts; activities: ActivityItem[]; locale: Locale; onOpen: (item: ActivityItem) => void }) {
  return (
    <>
      <section className="team-summary">
        {teams.map((team) => <article className="team-strip" key={team.id ?? team.name}><span style={{ backgroundColor: team.color ?? "#0ea5e9" }} /><div><strong>{team.name ?? "-"}</strong><small>{team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min SLA` : "-"}</small></div><b>{team.members?.length ?? 0}</b></article>)}
      </section>
      <section className="dashboard-panels"><ChartPanel title={t.productivity} values={charts.byTeam.map(countOf)} /><ChartPanel title={t.risk} values={charts.byPriority.map(countOf)} /></section>
      <ActivityList t={t} activities={activities} locale={locale} onNew={() => undefined} onOpen={onOpen} compact />
    </>
  );
}

export function KanbanBoard({ t, activities, dragged, setDragged, onMove, onOpen }: { t: Texts; activities: ActivityItem[]; dragged: string | null; setDragged: (value: string | null) => void; onMove: (id: string, status: string) => void; onOpen: (item: ActivityItem) => void }) {
  return (
    <section className="kanban-board" tabIndex={0}>
      {statusGroups.map((group) => (
        <article className="kanban-column" key={group} onDragOver={(event) => event.preventDefault()} onDrop={() => dragged && onMove(dragged, group)}>
          <h2>{statusLabel(group, t)}</h2>
          {activities.filter((item) => item.status === group).map((item) => (
            <div className="kanban-card" draggable key={`${group}-${item.id}`} onClick={() => onOpen(item)} onDragStart={() => setDragged(item.id)}>
              <strong>{item.id.slice(0, 8)}</strong><p>{item.title}</p><div><span>{item.client?.name ?? "-"}</span><span>{item.team?.name ?? "-"}</span><span>{item.serviceName ?? item.systemName ?? "-"}</span></div><small>{item.assignee?.displayName ?? "-"} - {slaLabel(item.slaDueAt)}</small>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

export function ReportsView({ t, charts, activities, locale, onOpen }: { t: Texts; charts: DashboardCharts; activities: ActivityItem[]; locale: Locale; onOpen: (item: ActivityItem) => void }) {
  return (
    <>
      <section className="dashboard-panels"><ChartPanel title={t.monthly} values={charts.byStatus.map(countOf)} /><ChartPanel title={t.productivity} values={charts.byTeam.map(countOf)} /></section>
      <section className="panel full-width">
        <div className="panel-header"><h2>{t.reports}</h2><button className="compact-button" onClick={() => window.print()}><Download size={16} />{t.export}</button></div>
        <div className="report-list">{["Resumo de turno", "SLA por cliente", "Auditoria operacional", "Backlog por prioridade"].map((item) => <div key={item}><CheckCircle2 size={18} /><span>{item}</span></div>)}</div>
      </section>
      <ActivityList t={t} activities={activities} locale={locale} onNew={() => undefined} onOpen={onOpen} compact />
    </>
  );
}

export function SettingsView({ t, roles, locale, setLocale, theme, setTheme }: { t: Texts; roles: string[]; locale: Locale; setLocale: (value: Locale) => void; theme: Theme; setTheme: (value: Theme) => void }) {
  return (
    <>
      <section className="panel"><div className="panel-header"><h2>{t.theme}</h2><Settings size={18} /></div><SegmentedControl label={t.theme} options={[t.light, t.dark]} value={theme === "light" ? t.light : t.dark} onChange={(value) => setTheme(value === t.light ? "light" : "dark")} /><SegmentedControl label={t.language} options={["pt-BR", "en-GB"]} value={locale} onChange={(value) => setLocale(value as Locale)} /></section>
      <section className="panel"><div className="panel-header"><h2>{t.permissions}</h2><ShieldCheck size={18} /></div><div className="role-list">{roles.map((role) => <span key={role}>{role}</span>)}</div><p className="guard-note">{t.visualGuard}. RBAC permanece obrigatorio no backend.</p></section>
      <section className="panel"><div className="panel-header"><h2>Monitoramento</h2><Activity size={18} /></div><p className="guard-note">{t.tvMode}: auto refresh, indicadores de SLA e Kanban operacional em tela cheia.</p></section>
      <section className="panel"><div className="panel-header"><h2>Turnos</h2><CalendarClock size={18} /></div><p className="guard-note">Criacao, edicao e visualizacao usam os endpoints reais de turnos.</p></section>
    </>
  );
}
