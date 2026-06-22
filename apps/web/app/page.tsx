"use client";

import {
  Activity,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Columns3,
  Download,
  Filter,
  Globe2,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Workflow
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

type Locale = "pt-BR" | "en-GB";
type Theme = "light" | "dark";
type View =
  | "dashboard"
  | "team-dashboard"
  | "users"
  | "teams"
  | "shifts"
  | "activities"
  | "kanban"
  | "reports"
  | "settings";

type ApiEnvelope<T> = { data: T };
type SessionUser = { id: string; email: string; displayName?: string; companyId?: string; permissions?: string[] };
type LoginResponse = { accessToken: string; refreshToken: string; user: SessionUser };
type ListResponse<T> = { items: T[]; total: number };
type DashboardSummary = { total: number; pending: number; inProgress: number; done: number; critical: number; slaAtRisk: number };
type GroupCount = { _count?: { _all?: number }; teamId?: string | null; status?: string | null; priority?: string | null; shiftId?: string | null };
type DashboardCharts = { byTeam: GroupCount[]; byStatus: GroupCount[]; byPriority: GroupCount[]; byShift: GroupCount[] };
type ClientRef = { name?: string };
type TeamRef = { id?: string; name?: string; color?: string; defaultSlaMinutes?: number; members?: unknown[] };
type UserRef = { id?: string; displayName?: string; email?: string; jobTitle?: string; status?: string };
type ShiftRef = { id?: string; name?: string; startsAt?: string; endsAt?: string; status?: string; team?: TeamRef };
type ActivityItem = {
  id: string;
  title: string;
  client?: ClientRef;
  clientId?: string;
  systemName?: string;
  team?: TeamRef;
  teamId?: string;
  assignee?: UserRef | null;
  assigneeId?: string | null;
  priority?: string;
  status?: string;
  slaDueAt?: string | null;
  updatedAt?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const messages = {
  "pt-BR": {
    app: "ShiftFlow",
    loginTitle: "Acesso operacional",
    loginSubtitle: "Entre para acompanhar turnos, equipes e atividades em tempo real.",
    email: "E-mail",
    password: "Senha",
    signIn: "Entrar",
    demoAccess: "API real",
    search: "Pesquisar",
    newRecord: "Novo",
    export: "Exportar",
    company: "Ambiente integrado",
    role: "Sessao autenticada",
    dashboard: "Dashboard Principal",
    teamDashboard: "Dashboard por Equipe",
    users: "Gestao de Usuarios",
    teams: "Gestao de Equipes",
    shifts: "Gestao de Turnos",
    activities: "Gestao de Atividades",
    kanban: "Kanban",
    reports: "Relatorios",
    settings: "Configuracoes",
    total: "Atividades totais",
    pending: "Pendentes",
    running: "Em andamento",
    done: "Finalizadas",
    critical: "Criticas",
    risk: "SLA em risco",
    filters: "Filtros",
    operationalList: "Lista operacional",
    byTeam: "Atividades por equipe",
    slaByTeam: "SLA por equipe",
    incidentsByShift: "Incidentes por turno",
    monthly: "Evolucao mensal",
    productivity: "Produtividade por analista",
    permissions: "Perfis e permissoes",
    visualGuard: "Guard visual ativo",
    language: "Idioma",
    theme: "Tema",
    light: "Claro",
    dark: "Escuro",
    unread: "nao lidas",
    loading: "Carregando",
    apiOffline: "API indisponivel ou sem dados de integracao",
    loginFailed: "Falha no login",
    integrated: "Dados carregados de endpoints reais",
    statusPending: "Pendente",
    statusInProgress: "Em andamento",
    statusWaitingThirdParty: "Aguardando terceiros",
    statusMonitoring: "Monitoramento",
    statusDone: "Finalizada",
    statusCancelled: "Cancelada"
  },
  "en-GB": {
    app: "ShiftFlow",
    loginTitle: "Operations access",
    loginSubtitle: "Sign in to monitor shifts, teams and activities in real time.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    demoAccess: "Live API",
    search: "Search",
    newRecord: "New",
    export: "Export",
    company: "Integrated environment",
    role: "Authenticated session",
    dashboard: "Main Dashboard",
    teamDashboard: "Team Dashboard",
    users: "User Management",
    teams: "Team Management",
    shifts: "Shift Management",
    activities: "Activity Management",
    kanban: "Kanban",
    reports: "Reports",
    settings: "Settings",
    total: "Total activities",
    pending: "Pending",
    running: "In progress",
    done: "Completed",
    critical: "Critical",
    risk: "SLA at risk",
    filters: "Filters",
    operationalList: "Operational list",
    byTeam: "Activities by team",
    slaByTeam: "SLA by team",
    incidentsByShift: "Incidents by shift",
    monthly: "Monthly trend",
    productivity: "Analyst productivity",
    permissions: "Roles and permissions",
    visualGuard: "Visual guard active",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    unread: "unread",
    loading: "Loading",
    apiOffline: "API unavailable or no integration data",
    loginFailed: "Login failed",
    integrated: "Loaded from live endpoints",
    statusPending: "Pending",
    statusInProgress: "In progress",
    statusWaitingThirdParty: "Waiting for third party",
    statusMonitoring: "Monitoring",
    statusDone: "Completed",
    statusCancelled: "Cancelled"
  }
};

const menu: Array<{ id: View; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "team-dashboard", icon: BarChart3 },
  { id: "users", icon: Users },
  { id: "teams", icon: Workflow },
  { id: "shifts", icon: CalendarClock },
  { id: "activities", icon: ListChecks },
  { id: "kanban", icon: Columns3 },
  { id: "reports", icon: Activity },
  { id: "settings", icon: Settings }
];

const statusGroups = ["PENDING", "IN_PROGRESS", "WAITING_THIRD_PARTY", "MONITORING", "DONE"];

function statusLabel(status: string | undefined, t: (typeof messages)["pt-BR"]) {
  const labels: Record<string, string> = {
    PENDING: t.statusPending,
    IN_PROGRESS: t.statusInProgress,
    WAITING_THIRD_PARTY: t.statusWaitingThirdParty,
    MONITORING: t.statusMonitoring,
    DONE: t.statusDone,
    CANCELLED: t.statusCancelled
  };
  return labels[status ?? ""] ?? status ?? "-";
}

async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return payload.data;
}

function countOf(item: GroupCount) {
  return item._count?._all ?? 0;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function slaLabel(value?: string | null) {
  if (!value) return "-";
  const due = new Date(value).getTime();
  const minutes = Math.round((due - Date.now()) / 60000);
  if (minutes < 0) return "Vencido";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

export default function Page() {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const [theme, setTheme] = useState<Theme>("light");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [dragged, setDragged] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary>({ total: 0, pending: 0, inProgress: 0, done: 0, critical: 0, slaAtRisk: 0 });
  const [charts, setCharts] = useState<DashboardCharts>({ byTeam: [], byStatus: [], byPriority: [], byShift: [] });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [roles, setRoles] = useState<Array<{ name?: string }>>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = messages[locale];

  const token = session?.accessToken;

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryData, chartData, operational, userList, teamList, shiftList, roleList, unreadData] = await Promise.all([
        apiRequest<DashboardSummary>("/api/dashboard/summary", token),
        apiRequest<DashboardCharts>("/api/dashboard/charts", token),
        apiRequest<ActivityItem[]>("/api/dashboard/operational-list", token),
        apiRequest<ListResponse<UserRef>>("/api/users", token),
        apiRequest<ListResponse<TeamRef>>("/api/teams", token),
        apiRequest<ListResponse<ShiftRef>>("/api/shifts", token),
        apiRequest<ListResponse<{ name?: string }>>("/api/rbac/roles", token),
        apiRequest<{ unread: number; count?: number }>("/api/notifications/unread-count", token)
      ]);
      setSummary(summaryData);
      setCharts(chartData);
      setActivities(operational);
      setUsers(userList.items);
      setTeams(teamList.items);
      setShifts(shiftList.items);
      setRoles(roleList.items);
      setUnread(unreadData.unread ?? unreadData.count ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }, [t.apiOffline, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<LoginResponse>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? "")
        })
      });
      setSession(data);
    } catch (cause) {
      setError(`${t.loginFailed}: ${cause instanceof Error ? cause.message : t.apiOffline}`);
    } finally {
      setLoading(false);
    }
  }

  async function moveActivity(id: string, status: string) {
    if (!token) return;
    const previous = activities;
    setActivities((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    setDragged(null);
    try {
      await apiRequest<ActivityItem>(`/api/activities/${id}/move`, token, {
        method: "POST",
        body: JSON.stringify({ status, note: "Moved from integrated Kanban" })
      });
      await loadData();
    } catch (cause) {
      setActivities(previous);
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    }
  }

  if (!session) {
    return (
      <main className="app-shell auth-shell" data-theme={theme}>
        <section className="auth-panel">
          <div className="brand-mark">
            <Workflow size={28} />
            <span>{t.app}</span>
          </div>
          <form className="login-card" onSubmit={submitLogin}>
            <div>
              <p className="eyebrow">{t.demoAccess}</p>
              <h1>{t.loginTitle}</h1>
              <p>{t.loginSubtitle}</p>
            </div>
            <label>
              {t.email}
              <input name="email" type="email" defaultValue="integration.admin@shiftflow.local" required />
            </label>
            <label>
              {t.password}
              <input name="password" type="password" defaultValue="ShiftFlow#2026" required />
            </label>
            {error ? <p className="guard-note">{error}</p> : null}
            <button className="primary-button" disabled={loading} type="submit">
              <LockKeyhole size={18} />
              {loading ? t.loading : t.signIn}
            </button>
          </form>
          <div className="auth-actions">
            <SegmentedControl label={t.language} options={["pt-BR", "en-GB"]} value={locale} onChange={(value) => setLocale(value as Locale)} />
            <IconToggle label={theme === "light" ? t.dark : t.light} icon={theme === "light" ? Moon : Sun} onClick={() => setTheme(theme === "light" ? "dark" : "light")} />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand-mark">
          <Workflow size={26} />
          <span>{t.app}</span>
        </div>
        <nav tabIndex={0}>
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "nav-button active" : "nav-button"} key={item.id} onClick={() => setView(item.id)} title={t[item.id === "team-dashboard" ? "teamDashboard" : item.id]}>
                <Icon size={18} />
                <span>{t[item.id === "team-dashboard" ? "teamDashboard" : item.id]}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{session.user.displayName ?? session.user.email} - {t.integrated}</p>
            <h1>{t[view === "team-dashboard" ? "teamDashboard" : view]}</h1>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={16} />
              <input placeholder={t.search} />
            </div>
            <IconToggle label={`${unread} ${t.unread}`} icon={Bell} onClick={() => undefined} />
            <IconToggle label={theme === "light" ? t.dark : t.light} icon={theme === "light" ? Moon : Sun} onClick={() => setTheme(theme === "light" ? "dark" : "light")} />
            <button className="compact-button" onClick={() => setLocale(locale === "pt-BR" ? "en-GB" : "pt-BR")}>
              <Globe2 size={16} />
              {locale}
            </button>
          </div>
        </header>

        {error ? <p className="guard-note">{error}</p> : null}
        {loading ? <p className="guard-note">{t.loading}</p> : null}

        <section className="content-grid">
          {view === "dashboard" && <MainDashboard t={t} summary={summary} charts={charts} activities={activities} />}
          {view === "team-dashboard" && <TeamDashboard t={t} teams={teams} charts={charts} activities={activities} />}
          {view === "users" && <ManagementTable title={t.users} rows={users.map((user) => [user.displayName ?? user.email ?? "-", user.jobTitle ?? "-", "-", user.status ?? "-"])} columns={["Nome", "Perfil", "Equipe", "Status"]} t={t} />}
          {view === "teams" && <TeamsView t={t} teams={teams} />}
          {view === "shifts" && <ManagementTable title={t.shifts} rows={shifts.map((shift) => [shift.name ?? "-", formatTime(shift.startsAt), formatTime(shift.endsAt), shift.team?.name ?? "-", shift.status ?? "-"])} columns={["Nome", "Inicio", "Fim", "Equipe", "Status"]} t={t} />}
          {view === "activities" && <ActivityList t={t} activities={activities} />}
          {view === "kanban" && <KanbanBoard t={t} activities={activities} dragged={dragged} setDragged={setDragged} onMove={moveActivity} />}
          {view === "reports" && <ReportsView t={t} charts={charts} />}
          {view === "settings" && <SettingsView t={t} roles={roles.map((role) => role.name ?? "-")} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} />}
        </section>
      </section>
    </main>
  );
}

function MainDashboard({ t, summary, charts, activities }: { t: (typeof messages)["pt-BR"]; summary: DashboardSummary; charts: DashboardCharts; activities: ActivityItem[] }) {
  return (
    <>
      <section className="kpi-grid">
        {[
          [t.total, summary.total, ""],
          [t.pending, summary.pending, ""],
          [t.running, summary.inProgress, ""],
          [t.done, summary.done, ""],
          [t.critical, summary.critical, ""],
          [t.risk, summary.slaAtRisk, ""]
        ].map(([label, value, delta]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{delta}</small>
          </article>
        ))}
      </section>
      <FilterBar t={t} />
      <section className="dashboard-panels">
        <ChartPanel title={t.byTeam} values={charts.byTeam.map(countOf)} />
        <ChartPanel title={t.slaByTeam} values={charts.byPriority.map(countOf)} />
        <ChartPanel title={t.incidentsByShift} values={charts.byShift.map(countOf)} />
        <ChartPanel title={t.monthly} values={charts.byStatus.map(countOf)} />
      </section>
      <ActivityList t={t} activities={activities} compact />
    </>
  );
}

function TeamDashboard({ t, teams, charts, activities }: { t: (typeof messages)["pt-BR"]; teams: TeamRef[]; charts: DashboardCharts; activities: ActivityItem[] }) {
  return (
    <>
      <section className="team-summary">
        {teams.map((team) => (
          <article className="team-strip" key={team.id ?? team.name}>
            <span style={{ backgroundColor: team.color ?? "#0ea5e9" }} />
            <div>
              <strong>{team.name ?? "-"}</strong>
              <small>{team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min SLA` : "-"}</small>
            </div>
            <b>{team.members?.length ?? 0}</b>
          </article>
        ))}
      </section>
      <section className="dashboard-panels">
        <ChartPanel title={t.productivity} values={charts.byTeam.map(countOf)} />
        <ChartPanel title={t.risk} values={charts.byPriority.map(countOf)} />
      </section>
      <ActivityList t={t} activities={activities} compact />
    </>
  );
}

function FilterBar({ t }: { t: (typeof messages)["pt-BR"] }) {
  return (
    <section className="filter-bar">
      <span>
        <Filter size={16} />
        {t.filters}
      </span>
      {["Equipe", "Analista", "Cliente", "Prioridade", "Status", "Turno"].map((filter) => (
        <button className="select-button" key={filter}>
          {filter}
          <ChevronDown size={14} />
        </button>
      ))}
    </section>
  );
}

function ChartPanel({ title, values }: { title: string; values: number[] }) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <BarChart3 size={18} />
      </div>
      <div className="bar-chart">
        {safeValues.map((value, index) => (
          <span key={`${title}-${index}`} style={{ height: `${Math.max(18, (value / max) * 100)}%` }}>
            <b>{value}</b>
          </span>
        ))}
      </div>
    </article>
  );
}

function ActivityList({ t, activities, compact = false }: { t: (typeof messages)["pt-BR"]; activities: ActivityItem[]; compact?: boolean }) {
  return (
    <section className={compact ? "panel full-width compact-table" : "panel full-width"}>
      <div className="panel-header">
        <h2>{compact ? t.operationalList : t.activities}</h2>
        <button className="compact-button">
          <Plus size={16} />
          {t.newRecord}
        </button>
      </div>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {["ID", "Cliente", "Sistema", "Equipe", "Analista", "Prioridade", "SLA", "Status"].map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map((item) => (
              <tr key={item.id}>
                <td>{item.id.slice(0, 8)}</td>
                <td>{item.client?.name ?? item.clientId ?? "-"}</td>
                <td>{item.systemName ?? "-"}</td>
                <td>{item.team?.name ?? item.teamId ?? "-"}</td>
                <td>{item.assignee?.displayName ?? "-"}</td>
                <td>
                  <span className={`priority ${(item.priority ?? "LOW").toLowerCase()}`}>{item.priority ?? "-"}</span>
                </td>
                <td>{slaLabel(item.slaDueAt)}</td>
                <td>{statusLabel(item.status, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KanbanBoard({ t, activities, dragged, setDragged, onMove }: { t: (typeof messages)["pt-BR"]; activities: ActivityItem[]; dragged: string | null; setDragged: (value: string | null) => void; onMove: (id: string, status: string) => void }) {
  return (
    <section className="kanban-board" tabIndex={0}>
      {statusGroups.map((group) => (
        <article className="kanban-column" key={group} onDragOver={(event) => event.preventDefault()} onDrop={() => dragged && onMove(dragged, group)}>
          <h2>{statusLabel(group, t)}</h2>
          {activities
            .filter((activityItem) => activityItem.status === group)
            .map((item) => (
              <div className="kanban-card" draggable key={`${group}-${item.id}`} onDragStart={() => setDragged(item.id)}>
                <strong>{item.id.slice(0, 8)}</strong>
                <p>{item.title}</p>
                <div>
                  <span>{item.client?.name ?? "-"}</span>
                  <span>{item.team?.name ?? "-"}</span>
                </div>
                <small>{item.assignee?.displayName ?? "-"} - {slaLabel(item.slaDueAt)}</small>
              </div>
            ))}
        </article>
      ))}
    </section>
  );
}

function TeamsView({ t, teams }: { t: (typeof messages)["pt-BR"]; teams: TeamRef[] }) {
  return (
    <section className="panel full-width">
      <div className="panel-header">
        <h2>{t.teams}</h2>
        <button className="compact-button">
          <Plus size={16} />
          {t.newRecord}
        </button>
      </div>
      <div className="team-grid">
        {teams.map((team) => (
          <article className="team-card" key={team.id ?? team.name}>
            <span style={{ backgroundColor: team.color ?? "#0ea5e9" }} />
            <h3>{team.name ?? "-"}</h3>
            <p>{team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min` : "-"}</p>
            <dl>
              <div>
                <dt>Membros</dt>
                <dd>{team.members?.length ?? 0}</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>{team.defaultSlaMinutes ?? "-"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsView({ t, charts }: { t: (typeof messages)["pt-BR"]; charts: DashboardCharts }) {
  return (
    <>
      <FilterBar t={t} />
      <section className="dashboard-panels">
        <ChartPanel title={t.monthly} values={charts.byStatus.map(countOf)} />
        <ChartPanel title={t.productivity} values={charts.byTeam.map(countOf)} />
      </section>
      <section className="panel full-width">
        <div className="panel-header">
          <h2>{t.reports}</h2>
          <button className="compact-button">
            <Download size={16} />
            {t.export}
          </button>
        </div>
        <div className="report-list">
          {["Resumo de turno", "SLA por cliente", "Auditoria operacional", "Backlog por prioridade"].map((item) => (
            <div key={item}>
              <CheckCircle2 size={18} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ManagementTable({ title, rows, columns, t }: { title: string; rows: string[][]; columns: string[]; t: (typeof messages)["pt-BR"] }) {
  return (
    <section className="panel full-width">
      <div className="panel-header">
        <h2>{title}</h2>
        <button className="compact-button">
          <Plus size={16} />
          {t.newRecord}
        </button>
      </div>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.join("-")}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsView({ t, roles, locale, setLocale, theme, setTheme }: { t: (typeof messages)["pt-BR"]; roles: string[]; locale: Locale; setLocale: (value: Locale) => void; theme: Theme; setTheme: (value: Theme) => void }) {
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>{t.theme}</h2>
          <Settings size={18} />
        </div>
        <SegmentedControl label={t.theme} options={[t.light, t.dark]} value={theme === "light" ? t.light : t.dark} onChange={(value) => setTheme(value === t.light ? "light" : "dark")} />
        <SegmentedControl label={t.language} options={["pt-BR", "en-GB"]} value={locale} onChange={(value) => setLocale(value as Locale)} />
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
    </>
  );
}

function SegmentedControl({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="segmented" aria-label={label}>
      {options.map((option) => (
        <button className={option === value ? "selected" : ""} key={option} onClick={() => onChange(option)} type="button">
          {option}
        </button>
      ))}
    </div>
  );
}

function IconToggle({ label, icon: Icon, onClick }: { label: string; icon: typeof Moon; onClick: () => void }) {
  return (
    <button className="icon-button" onClick={onClick} title={label} type="button">
      <Icon size={17} />
    </button>
  );
}
