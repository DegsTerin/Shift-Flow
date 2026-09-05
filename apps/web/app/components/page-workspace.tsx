// en-GB: Renders the authenticated workspace while keeping state and API orchestration in the page controller.
"use client";

import {
  Globe2,
  LayoutGrid,
  LogOut,
  Maximize2,
  Menu,
  Moon,
  RefreshCcw,
  Search,
  Sun,
  Workflow
} from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { DashboardLayoutKey, MenuItem } from "../lib/page-config";
import type { DashboardAvailability } from "../lib/page-data";
import type {
  ActivityItem,
  ClientRef,
  DashboardCharts,
  DashboardConfiguration,
  DashboardSummary,
  Filters,
  Locale,
  LoginResponse,
  ModalState,
  NotificationItem,
  PermissionRef,
  RecordModalCapabilities,
  ReferenceAccess,
  ReportActivitySummary,
  RoleRef,
  ShiftRef,
  TeamRef,
  Texts,
  Theme,
  UserRef,
  View
} from "../lib/types";
import { productAssignableRoles, userRoleName } from "../lib/utils";
import { FilterBar, IconToggle } from "./controls";
import { ActivityList, ManagementTable, shiftCells, TeamsView } from "./lists";
import { NotificationCentre } from "./notification-centre";
import { RecordModal } from "./record-modal";
import { RoleManagementView } from "./role-management-view";
import { KanbanBoard, MainDashboard, ReportsView, SettingsView, TeamDashboard } from "./views";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const reportFilterKeys: ReadonlySet<keyof Filters> = new Set([
  "clientId",
  "teamId",
  "shiftId",
  "status",
  "from",
  "to"
]);

type ManagementPaginationSnapshot = Readonly<{
  page: number;
  pageSize: number;
  total: number;
}>;

export interface PageWorkspaceProps {
  activeTitleKey: Exclude<View, "team-dashboard"> | "teamDashboard" | null;
  actionLoading: boolean;
  activities: ActivityItem[];
  activityDisplayedPage: number;
  activityDisplayedPageSize: number;
  activityTotal: number;
  authorisedView: View | null;
  availableMenu: readonly MenuItem[];
  availableViews: ReadonlySet<View>;
  charts: DashboardCharts;
  clients: ClientRef[];
  dashboardLayouts: Record<DashboardLayoutKey, DashboardConfiguration>;
  dashboardAvailability: DashboardAvailability;
  dashboardLayoutGenerations: Record<DashboardLayoutKey, number>;
  dragged: string | null;
  drawerOpen: boolean;
  filters: Filters;
  kanbanActivities: ActivityItem[];
  kanbanDisplayedPage: number;
  kanbanDisplayedPageSize: number;
  kanbanTotal: number;
  loading: boolean;
  locale: Locale;
  mainDashboardReady: boolean;
  managementClients: ClientRef[];
  managementLoading: boolean;
  managementShifts: ShiftRef[];
  managementSnapshot: ManagementPaginationSnapshot;
  managementTeams: TeamRef[];
  managementUsers: UserRef[];
  modal: ModalState;
  modalCapabilities: RecordModalCapabilities;
  monitorMode: boolean;
  navCollapsed: boolean;
  notificationItems: NotificationItem[];
  notificationPendingId: string | "all" | null;
  notificationsError: string | null;
  notificationsLoading: boolean;
  notificationsOpen: boolean;
  operationalActivities: ActivityItem[];
  rbacDisplayedPage: number;
  rbacDisplayedPageSize: number;
  rbacLoading: boolean;
  rbacPermissions: PermissionRef[];
  rbacTotal: number;
  referenceAccess: ReferenceAccess;
  reportSummary: ReportActivitySummary;
  roles: RoleRef[];
  search: string;
  searchableViews: ReadonlySet<View>;
  session: LoginResponse;
  shifts: ShiftRef[];
  summary: DashboardSummary;
  t: Texts;
  teamDashboardReady: boolean;
  teamDirectory: TeamRef[];
  teamDirectoryDisplayedPage: number;
  teamDirectoryDisplayedPageSize: number;
  teamDirectoryTotal: number;
  teams: TeamRef[];
  theme: Theme;
  token: string | undefined;
  topbarContext: string;
  unread: number;
  users: UserRef[];
  view: View;
  visibleError: string | undefined;

  assignRolePermission: (roleId: string, permissionId: string) => Promise<void>;
  can: (resource: string, action: string) => boolean;
  canCreateRecord: (entity: View) => boolean;
  changeActivityPage: (page: number) => void;
  changeFilters: (filters: Filters) => void;
  changeKanbanPage: (page: number) => void;
  changeManagementPage: (page: number) => void;
  changeRbacPage: (page: number) => void;
  changeTeamDirectoryPage: (page: number) => void;
  createRole: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  creationBlockReason: (entity: View) => string | undefined;
  customizeDashboard: () => void;
  deleteRole: (roleId: string) => Promise<void>;
  duplicateRole: (roleId: string) => Promise<void>;
  logout: () => Promise<void>;
  markNotificationsRead: (id?: string) => Promise<void>;
  moveActivity: (id: string, status: string) => Promise<void>;
  openCreate: (entity: View) => void;
  openDetail: (entity: View, record: unknown) => Promise<void>;
  refreshCurrent: () => Promise<void>;
  reloadAfterModalMutation: (originEpoch: number) => Promise<void>;
  removeRolePermission: (roleId: string, permissionId: string) => Promise<void>;
  resetDashboardLayout: (dashboardType: DashboardLayoutKey) => Promise<DashboardConfiguration>;
  saveDashboardLayout: (configuration: DashboardConfiguration) => Promise<DashboardConfiguration>;
  selectView: (view: View) => void;
  setDragged: StateSetter<string | null>;
  setDrawerOpen: StateSetter<boolean>;
  setLocale: StateSetter<Locale>;
  setModal: StateSetter<ModalState>;
  setNotificationsOpen: StateSetter<boolean>;
  setSearch: StateSetter<string>;
  setTheme: StateSetter<Theme>;
  toggleMonitorMode: () => void;
  toggleNavigation: () => void;
  toggleNotifications: () => void;
  updateRole: (roleId: string, event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function PageWorkspace({
  activeTitleKey,
  actionLoading,
  activities,
  activityDisplayedPage,
  activityDisplayedPageSize,
  activityTotal,
  authorisedView,
  availableMenu,
  availableViews,
  charts,
  clients,
  dashboardLayouts,
  dashboardAvailability,
  dashboardLayoutGenerations,
  dragged,
  drawerOpen,
  filters,
  kanbanActivities,
  kanbanDisplayedPage,
  kanbanDisplayedPageSize,
  kanbanTotal,
  loading,
  locale,
  mainDashboardReady,
  managementClients,
  managementLoading,
  managementShifts,
  managementSnapshot,
  managementTeams,
  managementUsers,
  modal,
  modalCapabilities,
  monitorMode,
  navCollapsed,
  notificationItems,
  notificationPendingId,
  notificationsError,
  notificationsLoading,
  notificationsOpen,
  operationalActivities,
  rbacDisplayedPage,
  rbacDisplayedPageSize,
  rbacLoading,
  rbacPermissions,
  rbacTotal,
  referenceAccess,
  reportSummary,
  roles,
  search,
  searchableViews,
  session,
  shifts,
  summary,
  t,
  teamDashboardReady,
  teamDirectory,
  teamDirectoryDisplayedPage,
  teamDirectoryDisplayedPageSize,
  teamDirectoryTotal,
  teams,
  theme,
  token,
  topbarContext,
  unread,
  users,
  view,
  visibleError,
  assignRolePermission,
  can,
  canCreateRecord,
  changeActivityPage,
  changeFilters,
  changeKanbanPage,
  changeManagementPage,
  changeRbacPage,
  changeTeamDirectoryPage,
  createRole,
  creationBlockReason,
  customizeDashboard,
  deleteRole,
  duplicateRole,
  logout,
  markNotificationsRead,
  moveActivity,
  openCreate,
  openDetail,
  refreshCurrent,
  reloadAfterModalMutation,
  removeRolePermission,
  resetDashboardLayout,
  saveDashboardLayout,
  selectView,
  setDragged,
  setDrawerOpen,
  setLocale,
  setModal,
  setNotificationsOpen,
  setSearch,
  setTheme,
  toggleMonitorMode,
  toggleNavigation,
  toggleNotifications,
  updateRole
}: PageWorkspaceProps) {
  return (
    <div
      className={`${monitorMode ? "app-shell monitor-mode" : "app-shell"}${!monitorMode && navCollapsed ? " nav-collapsed" : ""}${!monitorMode && drawerOpen ? " drawer-open" : ""}`}
      data-theme={theme}
      lang={locale}
    >
      <a className="skip-link" href="#main-content">
        {t.skipToMainContent}
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
      <main
        aria-busy={view === "dashboard" || view === "team-dashboard" ? undefined : loading}
        className="workspace"
        data-theme={theme}
        id="main-content"
        tabIndex={-1}
      >
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
            <h1 id="page-title">{activeTitleKey ? t[activeTitleKey] : t.app}</h1>
          </div>
          <div className="topbar-actions">
            {authorisedView ? (
              <>
                {searchableViews.has(authorisedView) ? (
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      aria-label={t.search}
                      maxLength={200}
                      value={search}
                      onChange={(event) => setSearch(event.target.value.slice(0, 200))}
                      placeholder={t.search}
                    />
                  </div>
                ) : null}
                <IconToggle
                  label={t.refresh}
                  icon={RefreshCcw}
                  onClick={() => void refreshCurrent()}
                />
                {can("notifications", "read") ? (
                  <NotificationCentre
                    t={t}
                    locale={locale}
                    open={notificationsOpen}
                    unread={unread}
                    items={notificationItems}
                    loading={notificationsLoading}
                    error={notificationsError}
                    canMarkRead={can("notifications", "write")}
                    pendingId={notificationPendingId}
                    onToggle={toggleNotifications}
                    onClose={() => setNotificationsOpen(false)}
                    onMarkRead={(id) => void markNotificationsRead(id)}
                    onMarkAllRead={() => void markNotificationsRead()}
                  />
                ) : null}
              </>
            ) : null}
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
            {!monitorMode &&
            (authorisedView === "dashboard" || authorisedView === "team-dashboard") &&
            can("dashboard", "write") &&
            (authorisedView === "dashboard" ? mainDashboardReady : teamDashboardReady) ? (
              <IconToggle
                label={t.customizeDashboard}
                icon={LayoutGrid}
                onClick={customizeDashboard}
              />
            ) : null}
            {authorisedView ? (
              <IconToggle label={t.tvMode} icon={Maximize2} onClick={toggleMonitorMode} />
            ) : null}
            {session.authenticationMode !== "demo" ? (
              <IconToggle label={t.signOut} icon={LogOut} onClick={() => void logout()} />
            ) : null}
          </div>
        </header>
        {visibleError ? (
          <p className="form-error app-message" role="alert">
            {visibleError}
          </p>
        ) : null}
        {loading ? <p className="guard-note app-message">{t.loading}</p> : null}
        <section className="content-grid" aria-labelledby="page-title">
          {!availableMenu.length ? (
            <p className="empty-state full-width">{t.noAuthorisedViews}</p>
          ) : null}
          {authorisedView ? (
            <>
              {["dashboard", "team-dashboard", "activities", "kanban", "reports"].includes(view) ? (
                <FilterBar
                  t={t}
                  filters={filters}
                  setFilters={changeFilters}
                  clients={clients}
                  teams={teamDirectory}
                  shifts={shifts}
                  users={users}
                  token={token}
                  referenceAccess={referenceAccess}
                  visibleFilters={view === "reports" ? reportFilterKeys : undefined}
                />
              ) : null}
              {view === "dashboard" && (
                <MainDashboard
                  key={`MAIN:${dashboardLayoutGenerations.MAIN}`}
                  availability={dashboardAvailability}
                  t={t}
                  summary={summary}
                  charts={charts}
                  teams={teamDirectory}
                  activities={operationalActivities}
                  locale={locale}
                  layout={dashboardLayouts.MAIN}
                  onSaveLayout={saveDashboardLayout}
                  onResetLayout={() => resetDashboardLayout("MAIN")}
                  canConfigure={can("dashboard", "write") && mainDashboardReady}
                  pagination={
                    dashboardAvailability.teamDirectory === "ready"
                      ? {
                          page: teamDirectoryDisplayedPage,
                          pageSize: teamDirectoryDisplayedPageSize,
                          total: teamDirectoryTotal,
                          onPage: changeTeamDirectoryPage
                        }
                      : undefined
                  }
                  onNew={canCreateRecord("activities") ? () => openCreate("activities") : undefined}
                  onOpen={
                    can("activities", "read")
                      ? (item) => void openDetail("activities", item)
                      : undefined
                  }
                />
              )}
              {view === "team-dashboard" && (
                <TeamDashboard
                  key={`TEAM:${dashboardLayoutGenerations.TEAM}`}
                  availability={dashboardAvailability}
                  t={t}
                  teams={teamDirectory}
                  pagination={
                    dashboardAvailability.teamDirectory === "ready"
                      ? {
                          page: teamDirectoryDisplayedPage,
                          pageSize: teamDirectoryDisplayedPageSize,
                          total: teamDirectoryTotal,
                          onPage: changeTeamDirectoryPage
                        }
                      : undefined
                  }
                  charts={charts}
                  activities={operationalActivities}
                  locale={locale}
                  layout={dashboardLayouts.TEAM}
                  onSaveLayout={saveDashboardLayout}
                  onResetLayout={() => resetDashboardLayout("TEAM")}
                  canConfigure={can("dashboard", "write") && teamDashboardReady}
                  onNew={canCreateRecord("activities") ? () => openCreate("activities") : undefined}
                  onOpen={
                    can("activities", "read")
                      ? (item) => void openDetail("activities", item)
                      : undefined
                  }
                />
              )}
              {view === "users" && !managementLoading && (
                <ManagementTable
                  title={t.users}
                  rows={managementUsers}
                  columns={[t.name, t.role, t.email, t.filterStatus]}
                  cells={(user) => [
                    user.displayName ?? "-",
                    userRoleName(user),
                    user.email ?? "-",
                    user.status ?? "-"
                  ]}
                  t={t}
                  pagination={{
                    page: managementSnapshot.page,
                    pageSize: managementSnapshot.pageSize,
                    total: managementSnapshot.total,
                    onPage: changeManagementPage
                  }}
                  onNew={canCreateRecord("users") ? () => openCreate("users") : undefined}
                  newDisabledReason={
                    can("users", "write") && !canCreateRecord("users")
                      ? creationBlockReason("users")
                      : undefined
                  }
                  onOpen={(row) => void openDetail("users", row)}
                />
              )}
              {view === "clients" && !managementLoading && (
                <ManagementTable
                  title={t.clients}
                  rows={managementClients}
                  columns={[t.name, t.code, t.filterStatus]}
                  cells={(client) => [client.name ?? "-", client.code ?? "-", client.status ?? "-"]}
                  t={t}
                  pagination={{
                    page: managementSnapshot.page,
                    pageSize: managementSnapshot.pageSize,
                    total: managementSnapshot.total,
                    onPage: changeManagementPage
                  }}
                  onNew={canCreateRecord("clients") ? () => openCreate("clients") : undefined}
                  onOpen={(row) => void openDetail("clients", row)}
                />
              )}
              {view === "teams" && !managementLoading && (
                <TeamsView
                  t={t}
                  teams={managementTeams}
                  pagination={{
                    page: managementSnapshot.page,
                    pageSize: managementSnapshot.pageSize,
                    total: managementSnapshot.total,
                    onPage: changeManagementPage
                  }}
                  onNew={canCreateRecord("teams") ? () => openCreate("teams") : undefined}
                  onOpen={(team) => void openDetail("teams", team)}
                />
              )}
              {view === "roles" && !rbacLoading && (
                <RoleManagementView
                  t={t}
                  roles={roles}
                  permissions={rbacPermissions}
                  busy={actionLoading || rbacLoading}
                  canWrite={can("rbac", "write")}
                  canDelete={can("rbac", "delete")}
                  pagination={{
                    page: rbacDisplayedPage,
                    pageSize: rbacDisplayedPageSize,
                    total: rbacTotal,
                    onPage: changeRbacPage
                  }}
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
              {view === "shifts" && !managementLoading && (
                <ManagementTable
                  title={t.shifts}
                  rows={managementShifts}
                  columns={[t.name, t.start, t.end, t.filterStatus]}
                  cells={shiftCells(locale)}
                  t={t}
                  pagination={{
                    page: managementSnapshot.page,
                    pageSize: managementSnapshot.pageSize,
                    total: managementSnapshot.total,
                    onPage: changeManagementPage
                  }}
                  onNew={canCreateRecord("shifts") ? () => openCreate("shifts") : undefined}
                  onOpen={(row) => void openDetail("shifts", row)}
                />
              )}
              {view === "activities" && (
                <ActivityList
                  t={t}
                  activities={activities}
                  locale={locale}
                  pagination={{
                    page: activityDisplayedPage,
                    pageSize: activityDisplayedPageSize,
                    total: activityTotal,
                    onPage: changeActivityPage
                  }}
                  onNew={canCreateRecord("activities") ? () => openCreate("activities") : undefined}
                  newDisabledReason={
                    can("activities", "write") && !canCreateRecord("activities")
                      ? creationBlockReason("activities")
                      : undefined
                  }
                  onOpen={(item) => void openDetail("activities", item)}
                />
              )}
              {view === "kanban" && (
                <KanbanBoard
                  t={t}
                  activities={kanbanActivities}
                  dragged={dragged}
                  setDragged={setDragged}
                  canMove={can("activities", "write")}
                  onMove={moveActivity}
                  onOpen={(item) => void openDetail("activities", item)}
                  pagination={{
                    page: kanbanDisplayedPage,
                    pageSize: kanbanDisplayedPageSize,
                    total: kanbanTotal,
                    onPage: changeKanbanPage
                  }}
                />
              )}
              {view === "reports" && <ReportsView t={t} summary={reportSummary} />}
              {view === "settings" && (
                <SettingsView
                  t={t}
                  canOpen={(candidate) => availableViews.has(candidate)}
                  onNavigate={selectView}
                />
              )}
            </>
          ) : null}
        </section>
      </main>
      {modal && authorisedView ? (
        <RecordModal
          key={session.user.company?.timezone ?? "unavailable"}
          state={modal}
          t={t}
          token={token}
          locale={locale}
          companyTimezone={session.user.company?.timezone}
          clients={clients}
          users={users}
          teams={teams}
          shifts={shifts}
          roles={productAssignableRoles(roles)}
          referenceAccess={referenceAccess}
          capabilities={modalCapabilities}
          onClose={() => setModal(null)}
          onReload={reloadAfterModalMutation}
        />
      ) : null}
    </div>
  );
}
