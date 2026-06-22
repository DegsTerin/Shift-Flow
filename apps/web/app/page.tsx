"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  Columns3,
  Globe2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  LockKeyhole,
  Maximize2,
  Moon,
  RefreshCcw,
  Search,
  Settings,
  Sun,
  Users,
  Workflow
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar, IconToggle, SegmentedControl } from "./components/controls";
import { ActivityList, ManagementTable, shiftCells, TeamsView } from "./components/lists";
import { RecordModal } from "./components/record-modal";
import { KanbanBoard, MainDashboard, ReportsView, SettingsView, TeamDashboard } from "./components/views";
import { apiRequest, queryString } from "./lib/api";
import { messages } from "./lib/i18n";
import type { ActivityItem, ClientRef, DashboardCharts, DashboardSummary, Filters, ListResponse, Locale, LoginResponse, ModalState, RoleRef, ShiftRef, TeamRef, Theme, UserRef, View } from "./lib/types";
import { emptyFilters, hasPermission, matchesSearch, userRoleName } from "./lib/utils";

const menu: Array<{ id: View; icon: typeof LayoutDashboard; resource: string; action: string }> = [
  { id: "dashboard", icon: LayoutDashboard, resource: "dashboard", action: "read" },
  { id: "team-dashboard", icon: BarChart3, resource: "dashboard", action: "read" },
  { id: "users", icon: Users, resource: "users", action: "read" },
  { id: "clients", icon: Building2, resource: "clients", action: "read" },
  { id: "teams", icon: Workflow, resource: "teams", action: "read" },
  { id: "shifts", icon: CalendarClock, resource: "shifts", action: "read" },
  { id: "activities", icon: ListChecks, resource: "activities", action: "read" },
  { id: "kanban", icon: Columns3, resource: "activities", action: "read" },
  { id: "reports", icon: Activity, resource: "reports", action: "read" },
  { id: "settings", icon: Settings, resource: "rbac", action: "read" }
];

const sessionStorageKey = "shiftflow.session";

function parseStoredJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isStoredSession(value: unknown): value is LoginResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoginResponse>;
  return typeof candidate.accessToken === "string" && typeof candidate.refreshToken === "string" && !!candidate.user && typeof candidate.user === "object";
}

export default function Page() {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const [theme, setTheme] = useState<Theme>("light");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [monitorMode, setMonitorMode] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [summary, setSummary] = useState<DashboardSummary>({ total: 0, pending: 0, inProgress: 0, done: 0, critical: 0, slaAtRisk: 0 });
  const [charts, setCharts] = useState<DashboardCharts>({ byTeam: [], byClient: [], byStatus: [], byPriority: [], byShift: [] });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = messages[locale];
  const token = session?.accessToken;
  const permissions = session?.user.permissions;
  const can = useCallback((resource: string, action: string) => hasPermission(permissions, resource, action), [permissions]);
  const availableMenu = useMemo(() => menu.filter((item) => can(item.resource, item.action)), [can]);

  const visibleActivities = useMemo(() => activities.filter((item) => matchesSearch(item, search)), [activities, search]);
  const visibleClients = useMemo(() => clients.filter((item) => matchesSearch(item, search)), [clients, search]);
  const visibleUsers = useMemo(() => users.filter((item) => matchesSearch(item, search)), [users, search]);
  const visibleTeams = useMemo(() => teams.filter((item) => matchesSearch(item, search)), [teams, search]);
  const visibleShifts = useMemo(() => shifts.filter((item) => matchesSearch(item, search)), [shifts, search]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const qs = queryString(filters, search);
    try {
      if (can("dashboard", "read")) {
        const [summaryData, chartData, operational] = await Promise.all([
          apiRequest<DashboardSummary>(`/api/dashboard/summary${qs}`, token),
          apiRequest<DashboardCharts>(`/api/dashboard/charts${qs}`, token),
          apiRequest<ActivityItem[]>(`/api/dashboard/operational-list${qs}`, token),
        ]);
        setSummary(summaryData);
        setCharts(chartData);
        setActivities(operational);
      }
      if (can("activities", "read")) {
        const activityList = await apiRequest<ListResponse<ActivityItem>>(`/api/activities${qs}`, token);
        setActivities(activityList.items);
      }
      if (can("clients", "read")) setClients((await apiRequest<ListResponse<ClientRef>>("/api/clients", token)).items);
      if (can("users", "read")) setUsers((await apiRequest<ListResponse<UserRef>>("/api/users", token)).items);
      if (can("teams", "read")) setTeams((await apiRequest<ListResponse<TeamRef>>("/api/teams", token)).items);
      if (can("shifts", "read")) setShifts((await apiRequest<ListResponse<ShiftRef>>("/api/shifts", token)).items);
      if (can("rbac", "read")) setRoles((await apiRequest<ListResponse<RoleRef>>("/api/rbac/roles", token)).items);
      if (can("notifications", "read")) {
        const unreadData = await apiRequest<{ unread: number; count?: number }>("/api/notifications/unread-count", token);
        setUnread(unreadData.unread ?? unreadData.count ?? 0);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }, [can, filters, search, t.apiOffline, token]);

  useEffect(() => {
    setHydrated(true);
    const storedFilters = localStorage.getItem("shiftflow.filters");
    const storedLocale = localStorage.getItem("shiftflow.locale") as Locale | null;
    const storedTheme = localStorage.getItem("shiftflow.theme") as Theme | null;
    const storedNavCollapsed = localStorage.getItem("shiftflow.navCollapsed");
    const storedSession = localStorage.getItem(sessionStorageKey);
    const parsedFilters = parseStoredJson(storedFilters);
    if (parsedFilters && typeof parsedFilters === "object") setFilters({ ...emptyFilters, ...parsedFilters });
    if (storedLocale === "pt-BR" || storedLocale === "en-GB") setLocale(storedLocale);
    if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
    if (storedNavCollapsed === "true" || storedNavCollapsed === "false") setNavCollapsed(storedNavCollapsed === "true");
    if (storedSession) {
      const parsedSession = parseStoredJson(storedSession);
      if (isStoredSession(parsedSession)) {
        setSession(parsedSession);
      } else {
        localStorage.removeItem(sessionStorageKey);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("shiftflow.filters", JSON.stringify(filters));
    localStorage.setItem("shiftflow.locale", locale);
    localStorage.setItem("shiftflow.theme", theme);
    localStorage.setItem("shiftflow.navCollapsed", String(navCollapsed));
  }, [filters, locale, navCollapsed, theme]);

  useEffect(() => {
    if (!hydrated) return;
    if (session) {
      localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    } else {
      localStorage.removeItem(sessionStorageKey);
    }
  }, [hydrated, session]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (session && availableMenu.length && !availableMenu.some((item) => item.id === view)) {
      setView(availableMenu[0].id);
    }
  }, [availableMenu, session, view]);

  useEffect(() => {
    if (!monitorMode || !token) return undefined;
    const interval = window.setInterval(() => void loadData(), 30000);
    return () => window.clearInterval(interval);
  }, [loadData, monitorMode, token]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const closeDrawerOnDesktop = () => {
      if (!media.matches) setDrawerOpen(false);
    };
    closeDrawerOnDesktop();
    media.addEventListener("change", closeDrawerOnDesktop);
    return () => media.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);
    try {
      const nextSession = await apiRequest<LoginResponse>("/api/auth/login", undefined, { method: "POST", body: JSON.stringify({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }) });
      setSession(nextSession);
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
      await apiRequest<ActivityItem>(`/api/activities/${id}/move`, token, { method: "POST", body: JSON.stringify({ status, note: "Moved from integrated Kanban" }) });
      await loadData();
    } catch (cause) {
      setActivities(previous);
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    }
  }

  async function logout() {
    const refreshToken = session?.refreshToken;
    setSession(null);
    setModal(null);
    setActivities([]);
    setUsers([]);
    setTeams([]);
    setShifts([]);
    setRoles([]);
    setUnread(0);
    if (!refreshToken) return;
    try {
      await apiRequest("/api/auth/logout", undefined, { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Local session is already cleared; ignore remote logout failures.
    }
  }

  async function openDetail(entity: View, record: unknown) {
    if (!token || !(entity === "activities" || entity === "kanban")) {
      setModal({ mode: "detail", entity, record });
      return;
    }
    try {
      const id = typeof record === "object" && record && "id" in record ? String((record as { id?: string }).id) : "";
      setModal({ mode: "detail", entity: "activities", record: await apiRequest<ActivityItem>(`/api/activities/${id}`, token) });
    } catch {
      setModal({ mode: "detail", entity, record });
    }
  }

  function toggleNavigation() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      setDrawerOpen((open) => !open);
      return;
    }
    setDrawerOpen(false);
    setNavCollapsed((collapsed) => !collapsed);
  }

  function selectView(nextView: View) {
    setView(nextView);
    setDrawerOpen(false);
  }

  function toggleMonitorMode() {
    setDrawerOpen(false);
    setMonitorMode((enabled) => !enabled);
  }

  if (!session) {
    return (
      <main className="app-shell auth-shell" data-theme={theme}>
        <section className="auth-panel">
          <div className="brand-mark"><Workflow size={28} /><span>{t.app}</span></div>
          <form className="login-card" onSubmit={submitLogin}>
            <div><p className="eyebrow">{t.liveApi}</p><h1>{t.loginTitle}</h1><p>{t.loginSubtitle}</p></div>
            <label>{t.email}<input autoComplete="username" name="email" type="email" defaultValue="integration.admin@shiftflow.local" required /></label>
            <label>{t.password}<input autoComplete="current-password" name="password" type="password" defaultValue="ShiftFlow#2026" required /></label>
            {error ? <p className="guard-note">{error}</p> : null}
            <button className="primary-button" disabled={!hydrated || loading} type="submit"><LockKeyhole size={18} />{loading ? t.loading : t.signIn}</button>
          </form>
          <div className="auth-actions">
            <SegmentedControl label={t.language} options={["pt-BR", "en-GB"]} value={locale} onChange={(value) => setLocale(value as Locale)} />
            <IconToggle label={theme === "light" ? t.dark : t.light} icon={theme === "light" ? Moon : Sun} onClick={() => setTheme(theme === "light" ? "dark" : "light")} />
          </div>
        </section>
      </main>
    );
  }

  const activeTitleKey = view === "team-dashboard" ? "teamDashboard" : view;
  const topbarContext = session.user.displayName ?? session.user.email;

  return (
    <main className={`${monitorMode ? "app-shell monitor-mode" : "app-shell"}${!monitorMode && navCollapsed ? " nav-collapsed" : ""}${!monitorMode && drawerOpen ? " drawer-open" : ""}`} data-theme={theme}>
      {!monitorMode ? <button aria-label={t.closeNavigation} className="drawer-backdrop" onClick={() => setDrawerOpen(false)} type="button" /> : null}
      {!monitorMode ? <aside className="sidebar" aria-label={t.navigation}><div className="sidebar-brand"><div className="brand-mark"><Workflow size={26} /><span>{t.app}</span></div></div><nav tabIndex={0}>{availableMenu.map((item) => { const Icon = item.icon; const key = item.id === "team-dashboard" ? "teamDashboard" : item.id; return <button className={view === item.id ? "nav-button active" : "nav-button"} key={item.id} onClick={() => selectView(item.id)} title={t[key]}><Icon size={18} /><span>{t[key]}</span></button>; })}</nav></aside> : null}
      <section className="workspace">
        <header className="topbar">
          {!monitorMode ? <IconToggle label={navCollapsed ? t.expandNavigation : t.collapseNavigation} icon={Menu} onClick={toggleNavigation} /> : null}
          <div className="topbar-title"><p className="eyebrow">{topbarContext}</p><h1>{t[activeTitleKey]}</h1></div>
          <div className="topbar-actions">
            <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} /></div>
            <IconToggle label={t.autoRefresh} icon={RefreshCcw} onClick={() => void loadData()} />
            <IconToggle label={`${unread} ${t.unread}`} icon={Bell} onClick={() => undefined} />
            <IconToggle label={theme === "light" ? t.dark : t.light} icon={theme === "light" ? Moon : Sun} onClick={() => setTheme(theme === "light" ? "dark" : "light")} />
            <IconToggle label={locale} icon={Globe2} onClick={() => setLocale(locale === "pt-BR" ? "en-GB" : "pt-BR")} />
            <IconToggle label={t.tvMode} icon={Maximize2} onClick={toggleMonitorMode} />
            <IconToggle label="Sair" icon={LogOut} onClick={() => void logout()} />
          </div>
        </header>
        {error ? <p className="guard-note">{error}</p> : null}
        {loading ? <p className="guard-note">{t.loading}</p> : null}
        <section className="content-grid">
          {view !== "settings" ? <FilterBar t={t} filters={filters} setFilters={setFilters} clients={clients} teams={teams} shifts={shifts} users={users} /> : null}
          {view === "dashboard" && <MainDashboard t={t} summary={summary} charts={charts} activities={visibleActivities} locale={locale} onNew={() => setModal({ mode: "create", entity: "activities" })} onOpen={(item) => void openDetail("activities", item)} />}
          {view === "team-dashboard" && <TeamDashboard t={t} teams={visibleTeams} charts={charts} activities={visibleActivities} locale={locale} onOpen={(item) => void openDetail("activities", item)} />}
          {view === "users" && <ManagementTable title={t.users} rows={visibleUsers} columns={["Nome", "Perfil", "E-mail", "Status"]} cells={(user) => [user.displayName ?? "-", userRoleName(user), user.email ?? "-", user.status ?? "-"]} t={t} onNew={() => setModal({ mode: "create", entity: "users" })} onOpen={(row) => void openDetail("users", row)} />}
          {view === "clients" && <ManagementTable title={t.clients} rows={visibleClients} columns={["Nome", "Codigo", "Status"]} cells={(client) => [client.name ?? "-", client.code ?? "-", client.status ?? "-"]} t={t} onNew={() => setModal({ mode: "create", entity: "clients" })} onOpen={(row) => void openDetail("clients", row)} />}
          {view === "teams" && <TeamsView t={t} teams={visibleTeams} onNew={() => setModal({ mode: "create", entity: "teams" })} onOpen={(team) => void openDetail("teams", team)} />}
          {view === "shifts" && <ManagementTable title={t.shifts} rows={visibleShifts} columns={["Nome", "Inicio", "Fim", "Status"]} cells={shiftCells(locale)} t={t} onNew={() => setModal({ mode: "create", entity: "shifts" })} onOpen={(row) => void openDetail("shifts", row)} />}
          {view === "activities" && <ActivityList t={t} activities={visibleActivities} locale={locale} onNew={() => setModal({ mode: "create", entity: "activities" })} onOpen={(item) => void openDetail("activities", item)} />}
          {view === "kanban" && <KanbanBoard t={t} activities={visibleActivities} dragged={dragged} setDragged={setDragged} onMove={moveActivity} onOpen={(item) => void openDetail("activities", item)} />}
          {view === "reports" && <ReportsView t={t} charts={charts} activities={visibleActivities} locale={locale} onOpen={(item) => void openDetail("activities", item)} />}
          {view === "settings" && <SettingsView t={t} roles={roles.map((role) => role.name ?? "-")} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} />}
        </section>
      </section>
      {modal ? <RecordModal state={modal} t={t} token={token} locale={locale} clients={clients} users={users} teams={teams} shifts={shifts} roles={roles} onClose={() => setModal(null)} onReload={loadData} /> : null}
    </main>
  );
}
