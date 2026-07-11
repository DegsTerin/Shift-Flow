// en-GB: Orchestrates the main ShiftFlow interface while preserving state, navigation, and API behaviour.
"use client";

import {
  Bell,
  Globe2,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Maximize2,
  Menu,
  Moon,
  RefreshCcw,
  Search,
  Sun,
  Workflow
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar, IconToggle, SegmentedControl } from "./components/controls";
import { ActivityList, ManagementTable, shiftCells, TeamsView } from "./components/lists";
import { RecordModal } from "./components/record-modal";
import { RoleManagementView } from "./components/role-management-view";
import {
  KanbanBoard,
  MainDashboard,
  ReportsView,
  SettingsView,
  TeamDashboard
} from "./components/views";
import { apiRequest, queryString } from "./lib/api";
import { messages } from "./lib/i18n";
import { defaultDashboardLayouts, menu, type DashboardLayoutKey } from "./lib/page-config";
import type {
  ActivityItem,
  ClientRef,
  DashboardCharts,
  DashboardConfiguration,
  DashboardSummary,
  Filters,
  ListResponse,
  Locale,
  LoginResponse,
  ModalState,
  PermissionRef,
  RoleRef,
  ShiftRef,
  TeamRef,
  Theme,
  UserRef,
  View
} from "./lib/types";
import { emptyFilters, hasPermission, matchesSearch, userRoleName } from "./lib/utils";

function parseStoredJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export default function Page() {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const [theme, setTheme] = useState<Theme>("light");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [monitorMode, setMonitorMode] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [summary, setSummary] = useState<DashboardSummary>({
    total: 0,
    pending: 0,
    inProgress: 0,
    done: 0,
    critical: 0,
    slaAtRisk: 0,
    overdue: 0,
    averageResolutionHours: 0
  });
  const [charts, setCharts] = useState<DashboardCharts>({
    byTeam: [],
    byClient: [],
    byStatus: [],
    byPriority: [],
    byShift: []
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [dashboardLayouts, setDashboardLayouts] =
    useState<Record<DashboardLayoutKey, DashboardConfiguration>>(defaultDashboardLayouts);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [rbacPermissions, setRbacPermissions] = useState<PermissionRef[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = messages[locale];
  const token = session?.accessToken;
  const permissions = session?.user.permissions;
  const can = useCallback(
    (resource: string, action: string) => hasPermission(permissions, resource, action),
    [permissions]
  );
  const availableMenu = useMemo(
    () => menu.filter((item) => can(item.resource, item.action)),
    [can]
  );
  const availableViews = useMemo(
    () => new Set(availableMenu.map((item) => item.id)),
    [availableMenu]
  );

  const visibleActivities = useMemo(
    () => activities.filter((item) => matchesSearch(item, search)),
    [activities, search]
  );
  const visibleClients = useMemo(
    () => clients.filter((item) => matchesSearch(item, search)),
    [clients, search]
  );
  const visibleUsers = useMemo(
    () => users.filter((item) => matchesSearch(item, search)),
    [users, search]
  );
  const visibleTeams = useMemo(
    () => teams.filter((item) => matchesSearch(item, search)),
    [teams, search]
  );
  const visibleShifts = useMemo(
    () => shifts.filter((item) => matchesSearch(item, search)),
    [shifts, search]
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const qs = queryString(filters, search);
    try {
      if (can("dashboard", "read")) {
        const [summaryData, chartData, operational, mainLayout, teamLayout] = await Promise.all([
          apiRequest<DashboardSummary>(`/api/dashboard/summary${qs}`, token),
          apiRequest<DashboardCharts>(`/api/dashboard/charts${qs}`, token),
          apiRequest<ActivityItem[]>(`/api/dashboard/operational-list${qs}`, token),
          apiRequest<DashboardConfiguration>("/api/dashboard/configuration/MAIN", token),
          apiRequest<DashboardConfiguration>("/api/dashboard/configuration/TEAM", token)
        ]);
        setSummary(summaryData);
        setCharts(chartData);
        setActivities(operational);
        setDashboardLayouts({ MAIN: mainLayout, TEAM: teamLayout });
      }
      if (can("activities", "read")) {
        const activityList = await apiRequest<ListResponse<ActivityItem>>(
          `/api/activities${qs}`,
          token
        );
        setActivities(activityList.items);
      }
      if (can("clients", "read"))
        setClients((await apiRequest<ListResponse<ClientRef>>("/api/clients", token)).items);
      if (can("users", "read"))
        setUsers((await apiRequest<ListResponse<UserRef>>("/api/users", token)).items);
      if (can("teams", "read"))
        setTeams((await apiRequest<ListResponse<TeamRef>>("/api/teams", token)).items);
      if (can("shifts", "read"))
        setShifts((await apiRequest<ListResponse<ShiftRef>>("/api/shifts", token)).items);
      if (can("rbac", "read")) {
        const [roleList, permissionList] = await Promise.all([
          apiRequest<ListResponse<RoleRef>>("/api/rbac/roles", token),
          apiRequest<ListResponse<PermissionRef>>("/api/rbac/permissions", token)
        ]);
        setRoles(roleList.items);
        setRbacPermissions(permissionList.items);
      }
      if (can("notifications", "read")) {
        const unreadData = await apiRequest<{ unread: number; count?: number }>(
          "/api/notifications/unread-count",
          token
        );
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
    const parsedFilters = parseStoredJson(storedFilters);
    if (parsedFilters && typeof parsedFilters === "object")
      setFilters({ ...emptyFilters, ...parsedFilters });
    if (storedLocale === "pt-BR" || storedLocale === "en-GB") setLocale(storedLocale);
    if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
    if (storedNavCollapsed === "true" || storedNavCollapsed === "false")
      setNavCollapsed(storedNavCollapsed === "true");
    void apiRequest<LoginResponse>("/api/auth/refresh", undefined, {
      method: "POST",
      body: JSON.stringify({})
    })
      .then(setSession)
      .catch(() => undefined)
      .finally(() => setRestoringSession(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("shiftflow.filters", JSON.stringify(filters));
    localStorage.setItem("shiftflow.locale", locale);
    localStorage.setItem("shiftflow.theme", theme);
    localStorage.setItem("shiftflow.navCollapsed", String(navCollapsed));
  }, [filters, locale, navCollapsed, theme]);

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
      const nextSession = await apiRequest<LoginResponse>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? "")
        })
      });
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

  const saveDashboardLayout = useCallback(
    async (config: DashboardConfiguration) => {
      if (!token) return config;
      const saved = await apiRequest<DashboardConfiguration>(
        `/api/dashboard/configuration/${config.dashboardType}`,
        token,
        { method: "PUT", body: JSON.stringify(config) }
      );
      if (saved.dashboardType === "MAIN" || saved.dashboardType === "TEAM") {
        setDashboardLayouts((current) => ({ ...current, [saved.dashboardType]: saved }));
      }
      return saved;
    },
    [token]
  );

  const resetDashboardLayout = useCallback(
    async (dashboardType: DashboardLayoutKey) => {
      if (!token) return defaultDashboardLayouts[dashboardType];
      const saved = await apiRequest<DashboardConfiguration>(
        `/api/dashboard/configuration/${dashboardType}/reset`,
        token,
        { method: "POST", body: JSON.stringify({}) }
      );
      setDashboardLayouts((current) => ({ ...current, [dashboardType]: saved }));
      return saved;
    },
    [token]
  );

  async function logout() {
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/api/auth/logout", token, { method: "POST", body: JSON.stringify({}) });
      setSession(null);
      setModal(null);
      setActivities([]);
      setUsers([]);
      setTeams([]);
      setShifts([]);
      setRoles([]);
      setRbacPermissions([]);
      setUnread(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(entity: View, record: unknown) {
    if (!token || !(entity === "activities" || entity === "kanban")) {
      setModal({ mode: "detail", entity, record });
      return;
    }
    try {
      const id =
        typeof record === "object" && record && "id" in record
          ? String((record as { id?: string }).id)
          : "";
      setModal({
        mode: "detail",
        entity: "activities",
        record: await apiRequest<ActivityItem>(`/api/activities/${id}`, token)
      });
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

  function customizeDashboard() {
    window.dispatchEvent(new Event("shiftflow:customize-dashboard"));
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await apiRequest("/api/rbac/roles", token, {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          scope: String(form.get("scope") || "COMPANY"),
          color: String(form.get("color") || "#0f766e"),
          description: String(form.get("description") || "") || undefined
        })
      });
      await loadData();
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(roleId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !roleId) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/rbac/roles/${roleId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          scope: String(form.get("scope") || "COMPANY"),
          color: String(form.get("color") || "#0f766e"),
          isActive: form.get("isActive") === "on",
          description: String(form.get("description") || "") || undefined
        })
      });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  async function duplicateRole(roleId: string) {
    if (!token || !roleId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/rbac/roles/${roleId}/duplicate`, token, {
        method: "POST",
        body: JSON.stringify({})
      });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRole(roleId: string) {
    if (!token || !roleId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/rbac/roles/${roleId}`, token, { method: "DELETE" });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  async function assignRolePermission(roleId: string, permissionId: string) {
    if (!token || !roleId || !permissionId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/rbac/roles/${roleId}/permissions`, token, {
        method: "POST",
        body: JSON.stringify({ permissionId })
      });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  async function removeRolePermission(roleId: string, permissionId: string) {
    if (!token || !roleId || !permissionId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/rbac/roles/${roleId}/permissions/${permissionId}`, token, {
        method: "DELETE"
      });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoading(false);
    }
  }

  if (restoringSession && !session) {
    return (
      <main className="app-shell auth-shell" data-theme={theme}>
        <section className="auth-panel">
          <div className="brand-mark">
            <Workflow size={28} />
            <span>{t.app}</span>
          </div>
          <p className="guard-note">{t.loading}</p>
        </section>
      </main>
    );
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
              <p className="eyebrow">{t.liveApi}</p>
              <h1>{t.loginTitle}</h1>
              <p>{t.loginSubtitle}</p>
            </div>
            <label>
              {t.email}
              <input autoComplete="username" name="email" type="email" required />
            </label>
            <label>
              {t.password}
              <input autoComplete="current-password" name="password" type="password" required />
            </label>
            {error ? <p className="guard-note">{error}</p> : null}
            <button className="primary-button" disabled={!hydrated || loading} type="submit">
              <LockKeyhole size={18} />
              {loading ? t.loading : t.signIn}
            </button>
          </form>
          <div className="auth-actions">
            <SegmentedControl
              label={t.language}
              options={["pt-BR", "en-GB"]}
              value={locale}
              onChange={(value) => setLocale(value as Locale)}
            />
            <IconToggle
              label={theme === "light" ? t.dark : t.light}
              icon={theme === "light" ? Moon : Sun}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            />
          </div>
        </section>
      </main>
    );
  }

  const activeTitleKey = view === "team-dashboard" ? "teamDashboard" : view;
  const topbarContext = session.user.displayName ?? session.user.email;

  return (
    <div
      className={`${monitorMode ? "app-shell monitor-mode" : "app-shell"}${!monitorMode && navCollapsed ? " nav-collapsed" : ""}${!monitorMode && drawerOpen ? " drawer-open" : ""}`}
      data-theme={theme}
    >
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo principal
      </a>
      {!monitorMode ? (
        <button
          aria-label={t.closeNavigation}
          className="drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          type="button"
        />
      ) : null}
      {!monitorMode ? (
        <aside className="sidebar" aria-label={t.navigation}>
          <header className="sidebar-brand">
            <div className="brand-mark">
              <Workflow size={26} />
              <span>{t.app}</span>
            </div>
            <IconToggle
              label={navCollapsed ? t.expandNavigation : t.collapseNavigation}
              icon={Menu}
              onClick={toggleNavigation}
            />
          </header>
          <nav aria-label={t.navigation}>
            {availableMenu.map((item) => {
              const Icon = item.icon;
              const key = item.id === "team-dashboard" ? "teamDashboard" : item.id;
              return (
                <button
                  className={view === item.id ? "nav-button active" : "nav-button"}
                  key={item.id}
                  onClick={() => selectView(item.id)}
                  title={t[key]}
                  type="button"
                >
                  <Icon size={18} />
                  <span>{t[key]}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      ) : null}
      <main className="workspace" data-theme={theme} id="main-content" tabIndex={-1}>
        <header className="topbar">
          {!monitorMode ? (
            <div className="mobile-nav-trigger">
              <IconToggle
                label={navCollapsed ? t.expandNavigation : t.collapseNavigation}
                icon={Menu}
                onClick={toggleNavigation}
              />
            </div>
          ) : null}
          <div className="topbar-title">
            <p className="eyebrow">{topbarContext}</p>
            <h1 id="page-title">{t[activeTitleKey]}</h1>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={16} />
              <input
                aria-label={t.search}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.search}
              />
            </div>
            <IconToggle label={t.autoRefresh} icon={RefreshCcw} onClick={() => void loadData()} />
            <IconToggle label={`${unread} ${t.unread}`} icon={Bell} onClick={() => undefined} />
            <IconToggle
              label={theme === "light" ? t.dark : t.light}
              icon={theme === "light" ? Moon : Sun}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            />
            <IconToggle
              label={locale}
              icon={Globe2}
              onClick={() => setLocale(locale === "pt-BR" ? "en-GB" : "pt-BR")}
            />
            {!monitorMode && (view === "dashboard" || view === "team-dashboard") ? (
              <IconToggle
                label={t.customizeDashboard}
                icon={LayoutGrid}
                onClick={customizeDashboard}
              />
            ) : null}
            <IconToggle label={t.tvMode} icon={Maximize2} onClick={toggleMonitorMode} />
            <IconToggle label="Sair" icon={LogOut} onClick={() => void logout()} />
          </div>
        </header>
        {error ? (
          <p className="form-error app-message" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? <p className="guard-note app-message">{t.loading}</p> : null}
        <section className="content-grid" aria-labelledby="page-title">
          {["dashboard", "team-dashboard", "activities", "kanban", "reports"].includes(view) ? (
            <FilterBar
              t={t}
              filters={filters}
              setFilters={setFilters}
              clients={clients}
              teams={teams}
              shifts={shifts}
              users={users}
            />
          ) : null}
          {view === "dashboard" && (
            <MainDashboard
              t={t}
              summary={summary}
              charts={charts}
              teams={teams}
              activities={visibleActivities}
              locale={locale}
              layout={dashboardLayouts.MAIN}
              onSaveLayout={saveDashboardLayout}
              onResetLayout={() => resetDashboardLayout("MAIN")}
              onNew={() => setModal({ mode: "create", entity: "activities" })}
              onOpen={(item) => void openDetail("activities", item)}
            />
          )}
          {view === "team-dashboard" && (
            <TeamDashboard
              t={t}
              teams={visibleTeams}
              charts={charts}
              activities={visibleActivities}
              locale={locale}
              layout={dashboardLayouts.TEAM}
              onSaveLayout={saveDashboardLayout}
              onResetLayout={() => resetDashboardLayout("TEAM")}
              onOpen={(item) => void openDetail("activities", item)}
            />
          )}
          {view === "users" && (
            <ManagementTable
              title={t.users}
              rows={visibleUsers}
              columns={["Nome", "Perfil", "E-mail", "Status"]}
              cells={(user) => [
                user.displayName ?? "-",
                userRoleName(user),
                user.email ?? "-",
                user.status ?? "-"
              ]}
              t={t}
              onNew={() => setModal({ mode: "create", entity: "users" })}
              onOpen={(row) => void openDetail("users", row)}
            />
          )}
          {view === "clients" && (
            <ManagementTable
              title={t.clients}
              rows={visibleClients}
              columns={["Nome", "Codigo", "Status"]}
              cells={(client) => [client.name ?? "-", client.code ?? "-", client.status ?? "-"]}
              t={t}
              onNew={() => setModal({ mode: "create", entity: "clients" })}
              onOpen={(row) => void openDetail("clients", row)}
            />
          )}
          {view === "teams" && (
            <TeamsView
              t={t}
              teams={visibleTeams}
              onNew={() => setModal({ mode: "create", entity: "teams" })}
              onOpen={(team) => void openDetail("teams", team)}
            />
          )}
          {view === "roles" && (
            <RoleManagementView
              t={t}
              roles={roles}
              permissions={rbacPermissions}
              busy={loading}
              onCreateRole={createRole}
              onUpdateRole={updateRole}
              onAssignPermission={(roleId, permissionId) =>
                void assignRolePermission(roleId, permissionId)
              }
              onRemovePermission={(roleId, permissionId) =>
                void removeRolePermission(roleId, permissionId)
              }
              onDuplicateRole={(roleId) => void duplicateRole(roleId)}
              onDeleteRole={(roleId) => void deleteRole(roleId)}
            />
          )}
          {view === "shifts" && (
            <ManagementTable
              title={t.shifts}
              rows={visibleShifts}
              columns={["Nome", "Inicio", "Fim", "Status"]}
              cells={shiftCells(locale)}
              t={t}
              onNew={() => setModal({ mode: "create", entity: "shifts" })}
              onOpen={(row) => void openDetail("shifts", row)}
            />
          )}
          {view === "activities" && (
            <ActivityList
              t={t}
              activities={visibleActivities}
              locale={locale}
              onNew={() => setModal({ mode: "create", entity: "activities" })}
              onOpen={(item) => void openDetail("activities", item)}
            />
          )}
          {view === "kanban" && (
            <KanbanBoard
              t={t}
              activities={visibleActivities}
              dragged={dragged}
              setDragged={setDragged}
              onMove={moveActivity}
              onOpen={(item) => void openDetail("activities", item)}
            />
          )}
          {view === "reports" && (
            <ReportsView
              t={t}
              charts={charts}
              teams={teams}
              activities={visibleActivities}
              locale={locale}
              onOpen={(item) => void openDetail("activities", item)}
            />
          )}
          {view === "settings" && (
            <SettingsView
              t={t}
              canOpen={(candidate) => availableViews.has(candidate)}
              onNavigate={selectView}
            />
          )}
        </section>
      </main>
      {modal ? (
        <RecordModal
          state={modal}
          t={t}
          token={token}
          locale={locale}
          clients={clients}
          users={users}
          teams={teams}
          shifts={shifts}
          roles={roles}
          onClose={() => setModal(null)}
          onReload={loadData}
        />
      ) : null}
    </div>
  );
}
