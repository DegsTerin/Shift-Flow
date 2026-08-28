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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  apiRequest,
  captureApiSessionEpoch,
  clearApiSession,
  isApiSessionEpochCurrent,
  restoreApiSession,
  settleApiSessionOperation,
  setApiSession,
  subscribeApiSession
} from "./lib/api";
import { createActivityMoveCoordinator } from "./lib/activity-moves";
import { messages } from "./lib/i18n";
import { createLatestRequestCoordinator, isAbortError } from "./lib/latest-request";
import {
  activityTablePageSize,
  fetchManagementData,
  fetchRbacData,
  fetchReferenceData,
  fetchPageData,
  fetchUnreadData,
  isManagementView,
  kanbanPageSize,
  lastPageForTotal,
  managementPageSize,
  rbacPageSize,
  type ReferenceSettlement,
  type ManagementItem,
  type ManagementView
} from "./lib/page-data";
import { defaultDashboardLayouts, menu, type DashboardLayoutKey } from "./lib/page-config";
import { createPendingOperationTracker } from "./lib/pending-operations";
import { mostRecentUiError, type UiError } from "./lib/ui-errors";
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
  PermissionRef,
  ReportActivitySummary,
  RoleRef,
  ShiftRef,
  TeamRef,
  Theme,
  UserRef,
  View
} from "./lib/types";
import {
  emptyFilters,
  hasInvertedDateRange,
  hasPermission,
  productAssignableRoles,
  roleUpdatePayload,
  userRoleName
} from "./lib/utils";

function parseStoredJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const emptyDashboardSummary: DashboardSummary = {
  total: 0,
  pending: 0,
  inProgress: 0,
  done: 0,
  critical: 0,
  slaAtRisk: 0,
  overdue: 0,
  averageResolutionHours: 0
};

const emptyDashboardCharts: DashboardCharts = {
  byTeam: [],
  byClient: [],
  byStatus: [],
  byPriority: [],
  byShift: []
};

const emptyReportActivitySummary: ReportActivitySummary = {
  total: 0,
  byStatus: [],
  byPriority: []
};

const reportFilterKeys: ReadonlySet<keyof Filters> = new Set([
  "clientId",
  "teamId",
  "shiftId",
  "status",
  "from",
  "to"
]);

const searchableViews: ReadonlySet<View> = new Set([
  "dashboard",
  "team-dashboard",
  "users",
  "clients",
  "teams",
  "roles",
  "shifts",
  "activities",
  "kanban"
]);

const activityConsumerViews: ReadonlySet<View> = new Set([
  "dashboard",
  "team-dashboard",
  "activities",
  "kanban",
  "reports"
]);

function recordResource(entity: View) {
  if (entity === "activities" || entity === "kanban") return "activities";
  if (["users", "clients", "teams", "shifts"].includes(entity)) return entity;
  return null;
}

type CommittedViewLoader = {
  view: View;
  reload: () => Promise<void>;
};

type ManagementSnapshot = {
  view: ManagementView;
  items: ManagementItem[];
  total: number;
  page: number;
  pageSize: number;
};

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
  const [requestSearch, setRequestSearch] = useState("");
  const [monitorMode, setMonitorMode] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [summary, setSummary] = useState<DashboardSummary>(emptyDashboardSummary);
  const [charts, setCharts] = useState<DashboardCharts>(emptyDashboardCharts);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [kanbanActivities, setKanbanActivities] = useState<ActivityItem[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportActivitySummary>(
    emptyReportActivitySummary
  );
  const [operationalActivities, setOperationalActivities] = useState<ActivityItem[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityRequestRevision, setActivityRequestRevision] = useState(0);
  const [activityDisplayedPage, setActivityDisplayedPage] = useState(1);
  const [activityDisplayedPageSize, setActivityDisplayedPageSize] = useState(activityTablePageSize);
  const [activityTotal, setActivityTotal] = useState(0);
  const [kanbanPage, setKanbanPage] = useState(1);
  const [kanbanRequestRevision, setKanbanRequestRevision] = useState(0);
  const [kanbanDisplayedPage, setKanbanDisplayedPage] = useState(1);
  const [kanbanDisplayedPageSize, setKanbanDisplayedPageSize] = useState(kanbanPageSize);
  const [kanbanTotal, setKanbanTotal] = useState(0);
  const [teamDirectory, setTeamDirectory] = useState<TeamRef[]>([]);
  const [teamDirectoryPage, setTeamDirectoryPage] = useState(1);
  const [teamDirectoryRequestRevision, setTeamDirectoryRequestRevision] = useState(0);
  const [teamDirectoryDisplayedPage, setTeamDirectoryDisplayedPage] = useState(1);
  const [teamDirectoryDisplayedPageSize, setTeamDirectoryDisplayedPageSize] =
    useState(managementPageSize);
  const [teamDirectoryTotal, setTeamDirectoryTotal] = useState(0);
  const [managementPage, setManagementPage] = useState(1);
  const [managementRequestRevision, setManagementRequestRevision] = useState(0);
  const [managementSnapshot, setManagementSnapshot] = useState<ManagementSnapshot>({
    view: "users",
    items: [],
    total: 0,
    page: 1,
    pageSize: managementPageSize
  });
  const [dashboardLayouts, setDashboardLayouts] =
    useState<Record<DashboardLayoutKey, DashboardConfiguration>>(defaultDashboardLayouts);
  const [dashboardLayoutEpochs, setDashboardLayoutEpochs] = useState<
    Record<DashboardLayoutKey, number | null>
  >({ MAIN: null, TEAM: null });
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [rbacPermissions, setRbacPermissions] = useState<PermissionRef[]>([]);
  const [rbacPage, setRbacPage] = useState(1);
  const [rbacRequestRevision, setRbacRequestRevision] = useState(0);
  const [rbacDisplayedPage, setRbacDisplayedPage] = useState(1);
  const [rbacDisplayedPageSize, setRbacDisplayedPageSize] = useState(rbacPageSize);
  const [rbacTotal, setRbacTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [actionPending, setActionPending] = useState(0);
  const [dataLoading, setDataLoading] = useState(false);
  const [managementLoading, setManagementLoading] = useState(false);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [dataError, setDataError] = useState<UiError | null>(null);
  const [managementError, setManagementError] = useState<UiError | null>(null);
  const [rbacError, setRbacError] = useState<UiError | null>(null);
  const [unreadError, setUnreadError] = useState<UiError | null>(null);
  const [detailError, setDetailError] = useState<UiError | null>(null);
  const loadCoordinator = useRef(createLatestRequestCoordinator()).current;
  const referenceCoordinator = useRef(createLatestRequestCoordinator()).current;
  const managementCoordinator = useRef(createLatestRequestCoordinator()).current;
  const rbacCoordinator = useRef(createLatestRequestCoordinator()).current;
  const unreadCoordinator = useRef(createLatestRequestCoordinator()).current;
  const detailCoordinator = useRef(createLatestRequestCoordinator()).current;
  const moveCoordinator = useRef(createActivityMoveCoordinator()).current;
  const committedViewLoaderRef = useRef<CommittedViewLoader>({
    view: "dashboard",
    reload: async () => undefined
  });
  const actionTrackerRef = useRef<ReturnType<typeof createPendingOperationTracker> | null>(null);
  if (!actionTrackerRef.current) {
    actionTrackerRef.current = createPendingOperationTracker(setActionPending);
  }
  const actionTracker = actionTrackerRef.current;
  const observedSessionEpoch = useRef<number | null>(null);
  const errorOrder = useRef(0);
  const t = messages[locale];
  const token = session?.accessToken;
  const permissions = session?.user.permissions;
  const actionLoading = actionPending > 0;
  const managementViewActive = isManagementView(view);
  const renderedSessionEpoch = captureApiSessionEpoch();
  const mainDashboardReady =
    renderedSessionEpoch !== null && dashboardLayoutEpochs.MAIN === renderedSessionEpoch;
  const teamDashboardReady =
    renderedSessionEpoch !== null && dashboardLayoutEpochs.TEAM === renderedSessionEpoch;
  const loading =
    actionLoading ||
    detailLoading ||
    (managementViewActive ? managementLoading : view === "roles" ? rbacLoading : dataLoading);
  const visibleError = mostRecentUiError(
    error,
    managementViewActive
      ? managementError
      : view === "roles"
        ? rbacError
        : activityConsumerViews.has(view)
          ? dataError
          : null,
    unreadError,
    detailError
  )?.message;
  const publishActionError = useCallback((message: string) => {
    setError({ order: ++errorOrder.current, message });
  }, []);
  const publishDataError = useCallback((message: string) => {
    setDataError({ order: ++errorOrder.current, message });
  }, []);
  const publishManagementError = useCallback((message: string) => {
    setManagementError({ order: ++errorOrder.current, message });
  }, []);
  const publishRbacError = useCallback((message: string) => {
    setRbacError({ order: ++errorOrder.current, message });
  }, []);
  const publishUnreadError = useCallback((message: string) => {
    setUnreadError({ order: ++errorOrder.current, message });
  }, []);
  const publishDetailError = useCallback((message: string) => {
    setDetailError({ order: ++errorOrder.current, message });
  }, []);
  const can = useCallback(
    (resource: string, action: string) => hasPermission(permissions, resource, action),
    [permissions]
  );
  const canCreateRecord = useCallback(
    (entity: View) => {
      const resource = recordResource(entity);
      if (!resource || !can(resource, "write")) return false;
      if (entity === "activities" || entity === "kanban") {
        return can("clients", "read") && can("teams", "read");
      }
      if (entity === "users") {
        return can("rbac", "read");
      }
      return true;
    },
    [can]
  );
  const creationBlockReason = useCallback(
    (entity: View) => {
      if (entity === "activities" || entity === "kanban") return t.activityReferenceAccessRequired;
      if (entity === "users") return t.roleReferenceAccessRequired;
      return undefined;
    },
    [t]
  );
  const referenceAccess = useMemo(
    () => ({
      clients: can("clients", "read"),
      users: can("users", "read"),
      teams: can("teams", "read"),
      shifts: can("shifts", "read"),
      roles: can("rbac", "read")
    }),
    [can]
  );
  const cancelDetailIntent = useCallback(() => {
    detailCoordinator.cancel();
    setDetailLoading(false);
    setDetailError(null);
    setModal(null);
  }, [detailCoordinator]);
  const cancelPageIntent = useCallback(() => {
    loadCoordinator.cancel();
    managementCoordinator.cancel();
    rbacCoordinator.cancel();
    setDataLoading(false);
    setManagementLoading(false);
    setRbacLoading(false);
    cancelDetailIntent();
  }, [cancelDetailIntent, loadCoordinator, managementCoordinator, rbacCoordinator]);
  const clearQuerySnapshots = useCallback(() => {
    setSummary(emptyDashboardSummary);
    setCharts(emptyDashboardCharts);
    setOperationalActivities([]);
    setActivities([]);
    setKanbanActivities([]);
    setReportSummary(emptyReportActivitySummary);
    setActivityDisplayedPage(1);
    setActivityDisplayedPageSize(activityTablePageSize);
    setActivityTotal(0);
    setKanbanDisplayedPage(1);
    setKanbanDisplayedPageSize(kanbanPageSize);
    setKanbanTotal(0);
    setTeamDirectory([]);
    setTeamDirectoryDisplayedPage(1);
    setTeamDirectoryDisplayedPageSize(managementPageSize);
    setTeamDirectoryTotal(0);
    setManagementSnapshot((current) => ({
      ...current,
      items: [],
      total: 0,
      page: 1,
      pageSize: managementPageSize
    }));
  }, []);
  const changeFilters = useCallback(
    (nextFilters: Filters) => {
      cancelPageIntent();
      clearQuerySnapshots();
      setActivityPage(1);
      setKanbanPage(1);
      setTeamDirectoryPage(1);
      setFilters(nextFilters);
    },
    [cancelPageIntent, clearQuerySnapshots]
  );
  const changeActivityPage = useCallback(
    (page: number) => {
      cancelPageIntent();
      setActivityPage(page);
      setActivityRequestRevision((revision) => revision + 1);
    },
    [cancelPageIntent]
  );
  const changeKanbanPage = useCallback(
    (page: number) => {
      cancelPageIntent();
      setKanbanPage(page);
      setKanbanRequestRevision((revision) => revision + 1);
    },
    [cancelPageIntent]
  );
  const changeTeamDirectoryPage = useCallback(
    (page: number) => {
      cancelPageIntent();
      setTeamDirectoryPage(page);
      setTeamDirectoryRequestRevision((revision) => revision + 1);
    },
    [cancelPageIntent]
  );
  const changeManagementPage = useCallback(
    (page: number) => {
      managementCoordinator.cancel();
      setManagementLoading(false);
      setManagementPage(page);
      setManagementRequestRevision((revision) => revision + 1);
    },
    [managementCoordinator]
  );
  const changeRbacPage = useCallback(
    (page: number) => {
      rbacCoordinator.cancel();
      setRbacLoading(false);
      setRbacPage(page);
      setRbacRequestRevision((revision) => revision + 1);
    },
    [rbacCoordinator]
  );
  const availableMenu = useMemo(
    () => menu.filter((item) => can(item.resource, item.action)),
    [can]
  );
  const availableViews = useMemo(
    () => new Set(availableMenu.map((item) => item.id)),
    [availableMenu]
  );
  const modalCapabilities = useMemo(() => {
    const resource = modal ? recordResource(modal.entity) : null;
    const hasWrite = Boolean(resource && can(resource, "write"));
    return {
      canWrite: Boolean(
        hasWrite && (!modal || modal.mode !== "create" || canCreateRecord(modal.entity))
      ),
      canDelete: Boolean(resource && can(resource, "delete")),
      canComment: resource === "activities" && can("comments", "write"),
      canAddMembers: resource === "teams" && can("teams", "write") && can("users", "read"),
      canRemoveMembers: resource === "teams" && can("teams", "write")
    };
  }, [can, canCreateRecord, modal]);

  const managementUsers =
    managementSnapshot.view === "users" ? (managementSnapshot.items as UserRef[]) : [];
  const managementClients =
    managementSnapshot.view === "clients" ? (managementSnapshot.items as ClientRef[]) : [];
  const managementTeams =
    managementSnapshot.view === "teams" ? (managementSnapshot.items as TeamRef[]) : [];
  const managementShifts =
    managementSnapshot.view === "shifts" ? (managementSnapshot.items as ShiftRef[]) : [];

  const resetTenantState = useCallback(() => {
    loadCoordinator.cancel();
    referenceCoordinator.cancel();
    managementCoordinator.cancel();
    rbacCoordinator.cancel();
    unreadCoordinator.cancel();
    detailCoordinator.cancel();
    moveCoordinator.reset();
    actionTracker.reset();
    setDataLoading(false);
    setManagementLoading(false);
    setRbacLoading(false);
    setDetailLoading(false);
    setError(null);
    setDataError(null);
    setManagementError(null);
    setRbacError(null);
    setUnreadError(null);
    setDetailError(null);
    setSummary(emptyDashboardSummary);
    setCharts(emptyDashboardCharts);
    setActivities([]);
    setKanbanActivities([]);
    setReportSummary(emptyReportActivitySummary);
    setOperationalActivities([]);
    setActivityPage(1);
    setActivityRequestRevision(0);
    setActivityDisplayedPage(1);
    setActivityDisplayedPageSize(activityTablePageSize);
    setActivityTotal(0);
    setKanbanPage(1);
    setKanbanRequestRevision(0);
    setKanbanDisplayedPage(1);
    setKanbanDisplayedPageSize(kanbanPageSize);
    setKanbanTotal(0);
    setTeamDirectory([]);
    setTeamDirectoryPage(1);
    setTeamDirectoryRequestRevision(0);
    setTeamDirectoryDisplayedPage(1);
    setTeamDirectoryDisplayedPageSize(managementPageSize);
    setTeamDirectoryTotal(0);
    setManagementPage(1);
    setManagementRequestRevision(0);
    setManagementSnapshot({
      view: "users",
      items: [],
      total: 0,
      page: 1,
      pageSize: managementPageSize
    });
    setDashboardLayouts(defaultDashboardLayouts);
    setDashboardLayoutEpochs({ MAIN: null, TEAM: null });
    setClients([]);
    setUsers([]);
    setTeams([]);
    setShifts([]);
    setRoles([]);
    setRbacPermissions([]);
    setRbacPage(1);
    setRbacRequestRevision(0);
    setRbacDisplayedPage(1);
    setRbacDisplayedPageSize(rbacPageSize);
    setRbacTotal(0);
    setUnread(0);
    setModal(null);
    setDragged(null);
    setFilters(emptyFilters);
    setSearch("");
    setRequestSearch("");
    setView("dashboard");
  }, [
    actionTracker,
    detailCoordinator,
    loadCoordinator,
    managementCoordinator,
    moveCoordinator,
    rbacCoordinator,
    referenceCoordinator,
    unreadCoordinator
  ]);

  useEffect(
    () =>
      subscribeApiSession((nextSession) => {
        const nextEpoch = captureApiSessionEpoch();
        const crossedSessionBoundary = observedSessionEpoch.current !== nextEpoch;
        observedSessionEpoch.current = nextEpoch;
        setSession(nextSession);
        if (crossedSessionBoundary) {
          resetTenantState();
        }
      }),
    [resetTenantState]
  );

  const loadData = useCallback(async () => {
    if (!token || !availableViews.has(view)) return;
    if (isManagementView(view) || view === "roles" || view === "settings") return;
    if (hasInvertedDateRange(filters)) {
      loadCoordinator.cancel();
      setDataLoading(false);
      setDataError(null);
      return;
    }
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = loadCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(sessionEpoch);
    setDataLoading(true);
    setDataError(null);
    try {
      const result = await fetchPageData({
        token,
        can,
        filters,
        search: requestSearch,
        activityPage,
        kanbanPage,
        teamPage: teamDirectoryPage,
        view,
        signal: request.signal
      });
      if (!isCurrent()) return;
      if (result.teamDirectory && (view === "dashboard" || view === "team-dashboard")) {
        const requestedPageSize = result.teamDirectory.pageSize ?? managementPageSize;
        const lastPage = lastPageForTotal(result.teamDirectory.total, requestedPageSize);
        if (teamDirectoryPage > lastPage) {
          setTeamDirectory([]);
          setTeamDirectoryTotal(result.teamDirectory.total);
          setTeamDirectoryDisplayedPage(lastPage);
          setTeamDirectoryDisplayedPageSize(requestedPageSize);
          setTeamDirectoryPage(lastPage);
          return;
        }
        const responsePage = result.teamDirectory.page ?? teamDirectoryPage;
        if (responsePage !== teamDirectoryPage) {
          throw new Error(t.managementPaginationMismatch);
        }
        setTeamDirectory(result.teamDirectory.items);
        setTeamDirectoryTotal(result.teamDirectory.total);
        setTeamDirectoryDisplayedPage(responsePage);
        setTeamDirectoryDisplayedPageSize(requestedPageSize);
      }
      if (result.activities && (view === "activities" || view === "kanban")) {
        const requestedPage = view === "activities" ? activityPage : kanbanPage;
        const requestedPageSize =
          result.activities.pageSize ??
          (view === "activities" ? activityTablePageSize : kanbanPageSize);
        const lastPage = lastPageForTotal(result.activities.total, requestedPageSize);
        if (requestedPage > lastPage) {
          if (view === "activities") {
            setActivities([]);
            setActivityTotal(result.activities.total);
            setActivityDisplayedPage(lastPage);
            setActivityDisplayedPageSize(requestedPageSize);
            setActivityPage(lastPage);
          } else {
            setKanbanActivities([]);
            setKanbanTotal(result.activities.total);
            setKanbanDisplayedPage(lastPage);
            setKanbanDisplayedPageSize(requestedPageSize);
            setKanbanPage(lastPage);
          }
          return;
        }
        const responsePage = result.activities.page ?? requestedPage;
        if (responsePage !== requestedPage) {
          throw new Error(t.activityPaginationMismatch);
        }
      }
      if (result.dashboard) {
        if (result.dashboard.summary) setSummary(result.dashboard.summary);
        if (result.dashboard.charts) setCharts(result.dashboard.charts);
        if (result.dashboard.operationalActivities) {
          setOperationalActivities(result.dashboard.operationalActivities);
        }
        if (result.dashboard.layouts) {
          const layouts = result.dashboard.layouts;
          setDashboardLayouts((current) => ({ ...current, ...layouts }));
          setDashboardLayoutEpochs((current) => ({
            ...current,
            ...(layouts.MAIN ? { MAIN: sessionEpoch } : {}),
            ...(layouts.TEAM ? { TEAM: sessionEpoch } : {})
          }));
        }
      }
      if (result.activities) {
        if (view === "activities") {
          setActivities(result.activities.items);
          setActivityTotal(result.activities.total);
          setActivityDisplayedPage(result.activities.page ?? activityPage);
          setActivityDisplayedPageSize(result.activities.pageSize ?? activityTablePageSize);
        }
        if (view === "kanban") {
          setKanbanActivities(moveCoordinator.overlay(result.activities.items));
          setKanbanTotal(result.activities.total);
          setKanbanDisplayedPage(result.activities.page ?? kanbanPage);
          setKanbanDisplayedPageSize(result.activities.pageSize ?? kanbanPageSize);
        }
      }
      if (result.report) setReportSummary(result.report);
      const laneError = result.errors?.[0];
      if (laneError) {
        publishDataError(laneError instanceof Error ? laneError.message : t.apiOffline);
      }
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      publishDataError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      if (isCurrent()) setDataLoading(false);
    }
  }, [
    activityPage,
    activityRequestRevision,
    can,
    filters,
    kanbanPage,
    kanbanRequestRevision,
    loadCoordinator,
    moveCoordinator,
    publishDataError,
    requestSearch,
    t.activityPaginationMismatch,
    t.apiOffline,
    t.managementPaginationMismatch,
    teamDirectoryPage,
    teamDirectoryRequestRevision,
    token,
    availableViews,
    view
  ]);

  const loadReferences = useCallback(async () => {
    if (!token) return;
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = referenceCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(sessionEpoch);
    const commitReference = (settlement: ReferenceSettlement) => {
      if (!isCurrent() || !settlement.value) return;
      if (settlement.resource === "clients") setClients(settlement.value.items);
      if (settlement.resource === "users") setUsers(settlement.value.items);
      if (settlement.resource === "teams") setTeams(settlement.value.items);
      if (settlement.resource === "shifts") setShifts(settlement.value.items);
    };
    try {
      const result = await fetchReferenceData({
        token,
        can,
        signal: request.signal,
        onSettled: commitReference
      });
      if (!isCurrent()) return;
      if (result.clients) setClients(result.clients.items);
      if (result.users) setUsers(result.users.items);
      if (result.teams) setTeams(result.teams.items);
      if (result.shifts) setShifts(result.shifts.items);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
    }
  }, [can, referenceCoordinator, token]);

  const loadManagement = useCallback(async () => {
    if (!token || !isManagementView(view) || !can(view, "read")) return;
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = managementCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(sessionEpoch);
    setManagementLoading(true);
    setManagementError(null);
    try {
      const result = await fetchManagementData({
        token,
        can,
        view,
        page: managementPage,
        search: requestSearch,
        signal: request.signal
      });
      if (!isCurrent() || !result) return;
      const responsePageSize = result.pageSize ?? managementPageSize;
      const lastPage = lastPageForTotal(result.total, responsePageSize);
      if (managementPage > lastPage) {
        setManagementSnapshot({
          view,
          items: [],
          total: result.total,
          page: lastPage,
          pageSize: responsePageSize
        });
        setManagementPage(lastPage);
        return;
      }
      const responsePage = result.page ?? managementPage;
      if (responsePage !== managementPage) throw new Error(t.managementPaginationMismatch);
      setManagementSnapshot({
        view,
        items: result.items,
        total: result.total,
        page: responsePage,
        pageSize: responsePageSize
      });
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      publishManagementError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      if (isCurrent()) setManagementLoading(false);
    }
  }, [
    can,
    managementCoordinator,
    managementPage,
    managementRequestRevision,
    publishManagementError,
    requestSearch,
    t.apiOffline,
    t.managementPaginationMismatch,
    token,
    view
  ]);

  const loadRbac = useCallback(async () => {
    if (!token || view !== "roles" || !can("rbac", "read")) return;
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = rbacCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(sessionEpoch);
    setRbacLoading(true);
    setRbacError(null);
    try {
      const result = await fetchRbacData({
        token,
        can,
        page: rbacPage,
        search: requestSearch,
        signal: request.signal
      });
      if (!isCurrent() || !result) return;
      const responsePageSize = result.roles.pageSize ?? rbacPageSize;
      const lastPage = lastPageForTotal(result.roles.total, responsePageSize);
      if (rbacPage > lastPage) {
        setRoles([]);
        setRbacTotal(result.roles.total);
        setRbacDisplayedPage(lastPage);
        setRbacDisplayedPageSize(responsePageSize);
        setRbacPage(lastPage);
        return;
      }
      const responsePage = result.roles.page ?? rbacPage;
      if (responsePage !== rbacPage) throw new Error(t.managementPaginationMismatch);
      setRoles(result.roles.items);
      setRbacTotal(result.roles.total);
      setRbacDisplayedPage(responsePage);
      setRbacDisplayedPageSize(responsePageSize);
      setRbacPermissions(result.permissions.items);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      publishRbacError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      if (isCurrent()) setRbacLoading(false);
    }
  }, [
    can,
    publishRbacError,
    rbacCoordinator,
    rbacPage,
    rbacRequestRevision,
    requestSearch,
    t.apiOffline,
    t.managementPaginationMismatch,
    token,
    view
  ]);

  const loadUnread = useCallback(async () => {
    if (!token || !can("notifications", "read")) return;
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = unreadCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(sessionEpoch);
    setUnreadError(null);
    try {
      const result = await fetchUnreadData({ token, can, signal: request.signal });
      if (!isCurrent() || !result) return;
      setUnread(result.unread ?? result.count ?? 0);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      publishUnreadError(cause instanceof Error ? cause.message : t.apiOffline);
    }
  }, [can, publishUnreadError, t.apiOffline, token, unreadCoordinator]);

  const reloadCurrentContext = useCallback(() => {
    if (view === "roles") return loadRbac();
    if (isManagementView(view)) {
      return Promise.allSettled([loadReferences(), loadManagement()]).then(() => undefined);
    }
    return loadData();
  }, [loadData, loadManagement, loadRbac, loadReferences, view]);

  const refreshCurrent = useCallback(async () => {
    await Promise.allSettled([reloadCurrentContext(), loadUnread()]);
  }, [loadUnread, reloadCurrentContext]);

  useLayoutEffect(() => {
    committedViewLoaderRef.current = { view, reload: reloadCurrentContext };
  }, [reloadCurrentContext, view]);

  const reloadAfterModalMutation = useCallback(async (originEpoch: number) => {
    if (!isApiSessionEpochCurrent(originEpoch)) return;
    await committedViewLoaderRef.current.reload();
  }, []);

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
    void restoreApiSession()
      .catch(() => clearApiSession())
      .finally(() => setRestoringSession(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("shiftflow.filters", JSON.stringify(filters));
    localStorage.setItem("shiftflow.locale", locale);
    localStorage.setItem("shiftflow.theme", theme);
    localStorage.setItem("shiftflow.navCollapsed", String(navCollapsed));
  }, [filters, locale, navCollapsed, theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    const currentView = availableViews.has(view) ? view : null;
    const titleKey = currentView === "team-dashboard" ? "teamDashboard" : currentView;
    const title = session ? (titleKey ? t[titleKey] : t.app) : t.loginTitle;
    document.title = title === t.app ? t.app : `${title} | ${t.app}`;
  }, [availableViews, locale, session, t, view]);

  useEffect(() => {
    if (!searchableViews.has(view)) return undefined;
    const timeout = window.setTimeout(() => {
      const nextSearch = search.trim().slice(0, 200);
      if (nextSearch === requestSearch) return;
      cancelPageIntent();
      clearQuerySnapshots();
      setActivityPage(1);
      setKanbanPage(1);
      setTeamDirectoryPage(1);
      setManagementPage(1);
      setRbacPage(1);
      setRequestSearch(nextSearch);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [cancelPageIntent, clearQuerySnapshots, requestSearch, search, view]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadManagement();
  }, [loadManagement]);

  useEffect(() => {
    void loadRbac();
  }, [loadRbac]);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread]);

  useEffect(
    () => () => {
      loadCoordinator.cancel();
      referenceCoordinator.cancel();
      managementCoordinator.cancel();
      rbacCoordinator.cancel();
      unreadCoordinator.cancel();
      detailCoordinator.cancel();
    },
    [
      detailCoordinator,
      loadCoordinator,
      managementCoordinator,
      rbacCoordinator,
      referenceCoordinator,
      unreadCoordinator
    ]
  );

  useEffect(() => {
    if (session && availableMenu.length && !availableMenu.some((item) => item.id === view)) {
      setView(availableMenu[0].id);
    }
  }, [availableMenu, session, view]);

  useEffect(() => {
    if (!monitorMode || !token) return undefined;
    const interval = window.setInterval(() => void refreshCurrent(), 30000);
    return () => window.clearInterval(interval);
  }, [monitorMode, refreshCurrent, token]);

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
    if (loggingOut) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    const finishAction = actionTracker.begin();
    try {
      const nextSession = await apiRequest<LoginResponse>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? "")
        })
      });
      setApiSession(nextSession);
    } catch (cause) {
      publishActionError(
        `${t.loginFailed}: ${cause instanceof Error ? cause.message : t.apiOffline}`
      );
    } finally {
      finishAction();
    }
  }

  async function moveActivity(id: string, status: string) {
    if (!token || !can("activities", "write")) return;
    const operationEpoch = captureApiSessionEpoch();
    if (operationEpoch === null) return;
    const activity = kanbanActivities.find((item) => item.id === id);
    if (!activity) return;
    cancelPageIntent();
    setError(null);
    const move = moveCoordinator.begin(activity, status);
    const finishAction = actionTracker.begin();
    setKanbanActivities((items) => moveCoordinator.optimistic(items, move));
    setDragged(null);
    try {
      await settleApiSessionOperation(
        operationEpoch,
        moveCoordinator.enqueue(move, () => {
          if (!isApiSessionEpochCurrent(operationEpoch)) {
            throw new Error(t.sessionChangedBeforeActivityMove);
          }
          return apiRequest<ActivityItem>(`/api/activities/${id}/move`, token, {
            method: "POST",
            body: JSON.stringify({ status })
          });
        }),
        {
          onSuccess: (saved) => {
            if (!moveCoordinator.isCurrent(move)) return;
            setKanbanActivities((items) => moveCoordinator.applySuccess(items, move, saved));
          },
          onFailure: (cause) => {
            if (!moveCoordinator.isCurrent(move)) return;
            setKanbanActivities([]);
            publishActionError(cause instanceof Error ? cause.message : t.apiOffline);
          }
        }
      );
    } finally {
      if (moveCoordinator.isCurrent(move)) {
        moveCoordinator.complete(move);
        const committed = committedViewLoaderRef.current;
        if (isApiSessionEpochCurrent(operationEpoch) && activityConsumerViews.has(committed.view)) {
          await committed.reload();
        }
      }
      finishAction();
    }
  }

  const saveDashboardLayout = useCallback(
    async (config: DashboardConfiguration) => {
      if (!token || !can("dashboard", "write")) return config;
      if (config.dashboardType !== "MAIN" && config.dashboardType !== "TEAM") return config;
      const operationEpoch = captureApiSessionEpoch();
      if (operationEpoch === null) return config;
      if (dashboardLayoutEpochs[config.dashboardType] !== operationEpoch) return config;
      const saved = await apiRequest<DashboardConfiguration>(
        `/api/dashboard/configuration/${config.dashboardType}`,
        token,
        { method: "PUT", body: JSON.stringify(config) }
      );
      if (!isApiSessionEpochCurrent(operationEpoch)) return config;
      if (saved.dashboardType === "MAIN" || saved.dashboardType === "TEAM") {
        setDashboardLayouts((current) => ({ ...current, [saved.dashboardType]: saved }));
      }
      return saved;
    },
    [can, dashboardLayoutEpochs, token]
  );

  const resetDashboardLayout = useCallback(
    async (dashboardType: DashboardLayoutKey) => {
      if (!token || !can("dashboard", "write")) return defaultDashboardLayouts[dashboardType];
      const operationEpoch = captureApiSessionEpoch();
      if (operationEpoch === null) return defaultDashboardLayouts[dashboardType];
      if (dashboardLayoutEpochs[dashboardType] !== operationEpoch) {
        return defaultDashboardLayouts[dashboardType];
      }
      const saved = await apiRequest<DashboardConfiguration>(
        `/api/dashboard/configuration/${dashboardType}/reset`,
        token,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (!isApiSessionEpochCurrent(operationEpoch)) return defaultDashboardLayouts[dashboardType];
      setDashboardLayouts((current) => ({ ...current, [dashboardType]: saved }));
      return saved;
    },
    [can, dashboardLayoutEpochs, token]
  );

  async function logout() {
    if (loggingOut) return;
    const logoutToken = token;
    setError(null);
    const finishAction = actionTracker.begin();
    setLoggingOut(true);
    clearApiSession();
    try {
      await apiRequest("/api/auth/logout", logoutToken, {
        method: "POST",
        body: JSON.stringify({})
      });
    } catch (cause) {
      publishActionError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      setLoggingOut(false);
      finishAction();
    }
  }

  async function openDetail(entity: View, record: unknown) {
    const resource = recordResource(entity);
    if (!resource || !can(resource, "read")) return;
    if (!token || !(entity === "activities" || entity === "kanban")) {
      detailCoordinator.cancel();
      setDetailLoading(false);
      setDetailError(null);
      setModal({ mode: "detail", entity, record });
      return;
    }
    const operationEpoch = captureApiSessionEpoch();
    if (operationEpoch === null) return;
    const request = detailCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(operationEpoch);
    const id =
      typeof record === "object" && record && "id" in record
        ? String((record as { id?: string }).id)
        : "";
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await apiRequest<ActivityItem>(`/api/activities/${id}`, token, {
        signal: request.signal
      });
      if (!isCurrent()) return;
      setModal({ mode: "detail", entity: "activities", record: detail });
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      publishDetailError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      if (isCurrent()) setDetailLoading(false);
    }
  }

  function openCreate(entity: View) {
    if (!canCreateRecord(entity)) return;
    setModal({ mode: "create", entity });
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
    if (nextView === view) {
      setDrawerOpen(false);
      return;
    }
    cancelPageIntent();
    clearQuerySnapshots();
    setActivityPage(1);
    setKanbanPage(1);
    setTeamDirectoryPage(1);
    setManagementPage(1);
    setRbacPage(1);
    setError(null);
    setView(nextView);
    setDrawerOpen(false);
  }

  function toggleMonitorMode() {
    setDrawerOpen(false);
    setMonitorMode((enabled) => !enabled);
  }

  function customizeDashboard() {
    if (!can("dashboard", "write")) return;
    const operationEpoch = captureApiSessionEpoch();
    if (operationEpoch === null) return;
    if (view === "dashboard" && dashboardLayoutEpochs.MAIN !== operationEpoch) return;
    if (view === "team-dashboard" && dashboardLayoutEpochs.TEAM !== operationEpoch) return;
    window.dispatchEvent(new Event("shiftflow:customize-dashboard"));
  }

  async function runRbacMutation<T>(
    requiredAction: "write" | "delete",
    operation: () => Promise<T>,
    afterSuccess?: () => void | Promise<void>
  ) {
    if (!token || !can("rbac", requiredAction)) return "STALE" as const;
    const operationEpoch = captureApiSessionEpoch();
    if (operationEpoch === null) return "STALE" as const;
    const finishAction = actionTracker.begin();
    setError(null);
    try {
      return await settleApiSessionOperation(operationEpoch, operation(), {
        onSuccess: async () => {
          await loadRbac();
          if (!isApiSessionEpochCurrent(operationEpoch)) return;
          await afterSuccess?.();
        },
        onFailure: (cause) =>
          publishActionError(cause instanceof Error ? cause.message : t.apiOffline)
      });
    } finally {
      finishAction();
    }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    await runRbacMutation(
      "write",
      () =>
        apiRequest("/api/rbac/roles", token, {
          method: "POST",
          body: JSON.stringify({
            name: String(form.get("name") ?? ""),
            scope: String(form.get("scope") || "COMPANY"),
            color: String(form.get("color") || "#0f766e"),
            description: String(form.get("description") || "") || undefined
          })
        }),
      () => target.reset()
    );
  }

  async function updateRole(roleId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleId) return;
    const form = new FormData(event.currentTarget);
    await runRbacMutation("write", () =>
      apiRequest(`/api/rbac/roles/${roleId}`, token, {
        method: "PATCH",
        body: JSON.stringify(roleUpdatePayload(form))
      })
    );
  }

  async function duplicateRole(roleId: string) {
    if (!roleId) return;
    await runRbacMutation("write", () =>
      apiRequest(`/api/rbac/roles/${roleId}/duplicate`, token, {
        method: "POST",
        body: JSON.stringify({})
      })
    );
  }

  async function deleteRole(roleId: string) {
    if (!roleId) return;
    await runRbacMutation("delete", () =>
      apiRequest(`/api/rbac/roles/${roleId}`, token, { method: "DELETE" })
    );
  }

  async function assignRolePermission(roleId: string, permissionId: string) {
    if (!roleId || !permissionId) return;
    await runRbacMutation("write", () =>
      apiRequest(`/api/rbac/roles/${roleId}/permissions`, token, {
        method: "POST",
        body: JSON.stringify({ permissionId })
      })
    );
  }

  async function removeRolePermission(roleId: string, permissionId: string) {
    if (!roleId || !permissionId) return;
    await runRbacMutation("write", () =>
      apiRequest(`/api/rbac/roles/${roleId}/permissions/${permissionId}`, token, {
        method: "DELETE"
      })
    );
  }

  if (restoringSession && !session) {
    return (
      <main className="app-shell auth-shell" data-theme={theme} lang={locale}>
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
      <main className="app-shell auth-shell" data-theme={theme} lang={locale}>
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
            {error ? <p className="guard-note">{error.message}</p> : null}
            <button
              className="primary-button"
              disabled={!hydrated || actionLoading || loggingOut}
              type="submit"
            >
              <LockKeyhole size={18} />
              {actionLoading || loggingOut ? t.loading : t.signIn}
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

  const authorisedView = availableViews.has(view) ? view : null;
  const activeTitleKey = authorisedView === "team-dashboard" ? "teamDashboard" : authorisedView;
  const topbarContext = session.user.displayName ?? session.user.email;

  return (
    <div
      key={captureApiSessionEpoch() ?? "anonymous"}
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
        aria-busy={loading}
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
                  <span
                    aria-label={`${unread} ${unread === 1 ? t.unreadSingular : t.unread}`}
                    aria-live="polite"
                    className="notification-indicator"
                    role="status"
                    title={`${unread} ${unread === 1 ? t.unreadSingular : t.unread}`}
                  >
                    <Bell size={17} />
                    <span aria-hidden="true">{unread}</span>
                  </span>
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
            <IconToggle label={t.signOut} icon={LogOut} onClick={() => void logout()} />
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
                  pagination={{
                    page: teamDirectoryDisplayedPage,
                    pageSize: teamDirectoryDisplayedPageSize,
                    total: teamDirectoryTotal,
                    onPage: changeTeamDirectoryPage
                  }}
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
                  t={t}
                  teams={teamDirectory}
                  pagination={{
                    page: teamDirectoryDisplayedPage,
                    pageSize: teamDirectoryDisplayedPageSize,
                    total: teamDirectoryTotal,
                    onPage: changeTeamDirectoryPage
                  }}
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
          state={modal}
          t={t}
          token={token}
          locale={locale}
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
