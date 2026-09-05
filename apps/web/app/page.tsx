// en-GB: Orchestrates the main ShiftFlow interface while preserving state, navigation, and API behaviour.
"use client";

import { LockKeyhole, Moon, Sun, Workflow } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconToggle, SegmentedControl } from "./components/controls";
import { PageWorkspace } from "./components/page-workspace";
import {
  apiRequest,
  CompanySwitchError,
  captureApiSessionEpoch,
  clearApiSession,
  isApiSessionEpochCurrent,
  isApiCompanySwitchPending,
  isApiReauthenticationRequired,
  reauthenticateApiSession,
  restoreApiSession,
  settleApiSessionOperation,
  setApiSession,
  subscribeApiSession,
  switchApiCompany
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
  type DashboardAvailability,
  type DashboardResource,
  type DashboardSettlement,
  type DashboardStatus,
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
  ListResponse,
  Locale,
  LoginResponse,
  ModalState,
  NotificationItem,
  PermissionRef,
  ReportActivitySummary,
  RoleRef,
  ShiftRef,
  TeamRef,
  Theme,
  UserRef,
  View
} from "./lib/types";
import { emptyFilters, hasInvertedDateRange, hasPermission, roleUpdatePayload } from "./lib/utils";

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

const notificationPageSize = 20;
const defaultLocale: Locale = "en-GB";
const defaultTheme: Theme = "dark";
const portfolioPasswordDisplay = "portfolio-access";

function portfolioLoginConfiguration() {
  return {
    enabled: process.env.NEXT_PUBLIC_PORTFOLIO_ACCESS === "true",
    email: process.env.NEXT_PUBLIC_PORTFOLIO_EMAIL?.trim() || "observador.executivo@shiftflow.local"
  };
}

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

const dashboardResources: DashboardResource[] = [
  "summary",
  "charts",
  "operationalActivities",
  "configuration",
  "teamDirectory"
];
type DashboardDependencyState = Record<
  DashboardResource,
  { context: string; status: DashboardStatus }
>;
function emptyDashboardDependencies(): DashboardDependencyState {
  return Object.fromEntries(
    dashboardResources.map((resource) => [resource, { context: "", status: "loading" }])
  ) as DashboardDependencyState;
}

export default function Page() {
  const reauthenticationRequired = isApiReauthenticationRequired();
  const portfolioConfiguration = portfolioLoginConfiguration();
  const portfolioLogin = {
    ...portfolioConfiguration,
    enabled: portfolioConfiguration.enabled && !reauthenticationRequired
  };
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [theme, setTheme] = useState<Theme>(defaultTheme);
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
  const modalStateRef = useRef(modal);
  modalStateRef.current = modal;
  const companySwitchRef = useRef(false);
  const [companySwitchPending, setCompanySwitchPending] = useState(false);
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
  const [dashboardDependencies, setDashboardDependencies] = useState(emptyDashboardDependencies);
  const [dashboardLayoutGenerations, setDashboardLayoutGenerations] = useState({
    MAIN: 0,
    TEAM: 0
  });
  const layoutAuthority = useRef({
    MAIN: {
      epoch: null as number | null,
      generation: 0,
      ready: false,
      writeRevision: 0,
      pending: 0
    },
    TEAM: {
      epoch: null as number | null,
      generation: 0,
      ready: false,
      writeRevision: 0,
      pending: 0
    }
  });
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationPendingId, setNotificationPendingId] = useState<string | "all" | null>(null);
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
  const notificationCoordinator = useRef(createLatestRequestCoordinator()).current;
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
  const dashboardKind = view === "team-dashboard" ? "TEAM" : "MAIN";
  const boundedSearch = search.trim().slice(0, 200);
  const dashboardDataContext = JSON.stringify([
    renderedSessionEpoch,
    view,
    filters,
    requestSearch,
    boundedSearch
  ]);
  const dashboardDirectoryContext = JSON.stringify([
    renderedSessionEpoch,
    view,
    requestSearch,
    boundedSearch,
    teamDirectoryPage,
    teamDirectoryRequestRevision
  ]);
  const dashboardConfigurationContext = JSON.stringify([renderedSessionEpoch, dashboardKind]);
  const currentDashboardContext = useRef({
    data: dashboardDataContext,
    directory: dashboardDirectoryContext,
    view
  });
  // A render-time fence also covers the interval before the replacement passive request starts.
  currentDashboardContext.current = {
    data: dashboardDataContext,
    directory: dashboardDirectoryContext,
    view
  };
  const dashboardAvailability = Object.fromEntries(
    dashboardResources.map((resource) => {
      const context =
        resource === "configuration"
          ? dashboardConfigurationContext
          : resource === "teamDirectory"
            ? dashboardDirectoryContext
            : dashboardDataContext;
      const state = dashboardDependencies[resource];
      const invalidQuery =
        resource !== "configuration" &&
        resource !== "teamDirectory" &&
        hasInvertedDateRange(filters);
      const status = invalidQuery ? "error" : state.context === context ? state.status : "loading";
      return [resource, status];
    })
  ) as DashboardAvailability;
  const mainDashboardReady =
    renderedSessionEpoch !== null && dashboardLayoutEpochs.MAIN === renderedSessionEpoch;
  const teamDashboardReady =
    renderedSessionEpoch !== null && dashboardLayoutEpochs.TEAM === renderedSessionEpoch;
  const loading =
    actionLoading ||
    detailLoading ||
    (managementViewActive
      ? managementLoading
      : view === "roles"
        ? rbacLoading
        : view === "dashboard" || view === "team-dashboard"
          ? Object.values(dashboardAvailability).includes("loading")
          : dataLoading);
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
  const revokeDashboardLayout = useCallback((kind: DashboardLayoutKey) => {
    const authority = layoutAuthority.current[kind];
    if (authority.ready || authority.epoch !== null) authority.generation += 1;
    authority.ready = false;
    authority.epoch = null;
    setDashboardLayoutEpochs((current) => ({ ...current, [kind]: null }));
    setDashboardLayoutGenerations((current) => ({ ...current, [kind]: authority.generation }));
    setDashboardLayouts((current) => ({ ...current, [kind]: defaultDashboardLayouts[kind] }));
  }, []);
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
    setDashboardDependencies((current) => ({
      ...emptyDashboardDependencies(),
      configuration: current.configuration
    }));
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
    notificationCoordinator.cancel();
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
    setDashboardDependencies(emptyDashboardDependencies());
    for (const kind of ["MAIN", "TEAM"] as const) {
      const authority = layoutAuthority.current[kind];
      authority.epoch = null;
      authority.ready = false;
      authority.generation += 1;
    }
    setDashboardLayoutGenerations({
      MAIN: layoutAuthority.current.MAIN.generation,
      TEAM: layoutAuthority.current.TEAM.generation
    });
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
    setNotificationsOpen(false);
    setNotificationItems([]);
    setNotificationsLoading(false);
    setNotificationsError(null);
    setNotificationPendingId(null);
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
    notificationCoordinator,
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
    const isDashboard = view === "dashboard" || view === "team-dashboard";
    const contextFor = (resource: DashboardResource) =>
      resource === "configuration"
        ? dashboardConfigurationContext
        : resource === "teamDirectory"
          ? dashboardDirectoryContext
          : dashboardDataContext;
    if (isDashboard && boundedSearch !== requestSearch) {
      loadCoordinator.cancel();
      return;
    }
    if (hasInvertedDateRange(filters)) {
      loadCoordinator.cancel();
      setDataLoading(false);
      setDataError(null);
      if (isDashboard)
        setDashboardDependencies((current) => ({
          ...current,
          ...Object.fromEntries(
            dashboardResources.map((resource) => [
              resource,
              resource === "configuration" || resource === "teamDirectory"
                ? current[resource].context === contextFor(resource)
                  ? current[resource]
                  : { context: contextFor(resource), status: "skipped" }
                : { context: contextFor(resource), status: "error" }
            ])
          )
        }));
      return;
    }
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = loadCoordinator.begin();
    const isCurrent = () =>
      request.isCurrent() &&
      isApiSessionEpochCurrent(sessionEpoch) &&
      (!isDashboard ||
        (currentDashboardContext.current.data === dashboardDataContext &&
          currentDashboardContext.current.directory === dashboardDirectoryContext));
    const kind = view === "team-dashboard" ? "TEAM" : "MAIN";
    const layoutReadRevision = layoutAuthority.current[kind].writeRevision;
    const layoutReadDuringWrite = layoutAuthority.current[kind].pending > 0;
    const received = new Set<DashboardResource>();
    const commitDashboard = (settlement: DashboardSettlement) => {
      if (!isCurrent() || received.has(settlement.resource)) return;
      received.add(settlement.resource);
      if (
        settlement.resource === "configuration" &&
        settlement.status === "ready" &&
        (!settlement.value ||
          settlement.value.dashboardType !== kind ||
          !Array.isArray(settlement.value.widgets))
      ) {
        settlement = {
          resource: "configuration",
          status: "error",
          error: new Error("Dashboard configuration kind mismatch")
        };
      }
      if (settlement.resource === "teamDirectory" && settlement.status === "ready") {
        const directory = settlement.value;
        const page = directory.page ?? teamDirectoryPage;
        const pageSize = directory.pageSize ?? managementPageSize;
        if (
          !Number.isInteger(page) ||
          page < 1 ||
          !Number.isInteger(pageSize) ||
          pageSize < 1 ||
          !Number.isInteger(directory.total) ||
          directory.total < 0 ||
          page > lastPageForTotal(directory.total, pageSize)
        ) {
          settlement = {
            resource: "teamDirectory",
            status: "error",
            error: new Error("Team directory pagination mismatch")
          };
        }
      }
      const { resource, status } = settlement;
      setDashboardDependencies((current) => ({
        ...current,
        [resource]: { context: contextFor(resource), status }
      }));
      if (settlement.resource === "configuration" && settlement.status !== "ready")
        revokeDashboardLayout(kind);
      if (settlement.status !== "ready") return;
      if (settlement.resource === "summary") setSummary(settlement.value);
      if (settlement.resource === "charts") setCharts(settlement.value);
      if (settlement.resource === "operationalActivities")
        setOperationalActivities(settlement.value);
      if (settlement.resource === "teamDirectory") {
        setTeamDirectory(settlement.value.items);
        setTeamDirectoryTotal(settlement.value.total);
        setTeamDirectoryDisplayedPage(settlement.value.page ?? teamDirectoryPage);
        setTeamDirectoryDisplayedPageSize(settlement.value.pageSize ?? managementPageSize);
      }
      if (settlement.resource === "configuration") {
        const authority = layoutAuthority.current[kind];
        if (!authority.ready || authority.epoch !== sessionEpoch) {
          authority.generation += 1;
          setDashboardLayoutGenerations((current) => ({
            ...current,
            [kind]: authority.generation
          }));
        }
        // Revalidation must not replace cumulative saves or drafts with an earlier server snapshot.
        if (
          !authority.ready ||
          (!layoutReadDuringWrite &&
            authority.pending === 0 &&
            authority.writeRevision === layoutReadRevision)
        ) {
          const configuration = settlement.value;
          setDashboardLayouts((current) => ({ ...current, [kind]: configuration }));
        }
        authority.epoch = sessionEpoch;
        authority.ready = true;
        setDashboardLayoutEpochs((current) => ({ ...current, [kind]: sessionEpoch }));
      }
    };
    setDataLoading(true);
    setDataError(null);
    if (isDashboard)
      setDashboardDependencies((current) => ({
        ...current,
        ...Object.fromEntries(
          dashboardResources.map((resource) => [
            resource,
            resource === "configuration" && layoutAuthority.current[kind].ready
              ? { context: contextFor(resource), status: "ready" }
              : { context: contextFor(resource), status: "loading" }
          ])
        )
      }));
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
        signal: request.signal,
        onDashboardSettled: commitDashboard
      });
      if (!isCurrent()) return;
      result.dashboardSettlements?.forEach(commitDashboard);
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
        if (result.dashboard.summary)
          commitDashboard({
            resource: "summary",
            status: "ready",
            value: result.dashboard.summary
          });
        if (result.dashboard.charts)
          commitDashboard({ resource: "charts", status: "ready", value: result.dashboard.charts });
        if (result.dashboard.operationalActivities)
          commitDashboard({
            resource: "operationalActivities",
            status: "ready",
            value: result.dashboard.operationalActivities
          });
        const layout = result.dashboard.layouts?.[kind];
        if (layout) commitDashboard({ resource: "configuration", status: "ready", value: layout });
      }
      if (result.teamDirectory)
        commitDashboard({
          resource: "teamDirectory",
          status: "ready",
          value: result.teamDirectory
        });
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
        if (isDashboard)
          dashboardResources.forEach((resource) =>
            commitDashboard({ resource, status: "error", error: laneError })
          );
        publishDataError(laneError instanceof Error ? laneError.message : t.apiOffline);
      }
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      if (isDashboard)
        dashboardResources.forEach((resource) =>
          commitDashboard({ resource, status: "error", error: cause })
        );
      publishDataError(cause instanceof Error ? cause.message : t.apiOffline);
    } finally {
      if (isCurrent()) setDataLoading(false);
    }
  }, [
    activityPage,
    activityRequestRevision,
    boundedSearch,
    can,
    dashboardConfigurationContext,
    dashboardDataContext,
    dashboardDirectoryContext,
    filters,
    kanbanPage,
    kanbanRequestRevision,
    loadCoordinator,
    moveCoordinator,
    publishDataError,
    requestSearch,
    revokeDashboardLayout,
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

  const loadNotifications = useCallback(async () => {
    if (!token || !can("notifications", "read")) return;
    const sessionEpoch = captureApiSessionEpoch();
    if (sessionEpoch === null) return;
    const request = notificationCoordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(sessionEpoch);
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const result = await apiRequest<ListResponse<NotificationItem>>(
        `/api/notifications?page=1&pageSize=${notificationPageSize}`,
        token,
        { signal: request.signal }
      );
      if (!isCurrent()) return;
      setNotificationItems(result.items);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      const detail = cause instanceof Error ? cause.message : t.apiOffline;
      setNotificationsError(`${t.notificationLoadFailed}: ${detail}`);
    } finally {
      if (isCurrent()) setNotificationsLoading(false);
    }
  }, [can, notificationCoordinator, t.apiOffline, t.notificationLoadFailed, token]);

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
    let cancelled = false;
    const bootstrapSession = async () => {
      try {
        if (isApiReauthenticationRequired()) return;
        await restoreApiSession();
      } catch {
        if (cancelled) return;
        clearApiSession();
        if (portfolioLoginConfiguration().enabled || isApiReauthenticationRequired()) return;
        try {
          const demoSession = await apiRequest<LoginResponse>("/api/auth/demo", undefined, {
            method: "POST",
            body: JSON.stringify({})
          });
          if (!cancelled) setApiSession(demoSession);
        } catch {
          if (!cancelled) clearApiSession();
        }
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    };
    void bootstrapSession();
    return () => {
      cancelled = true;
    };
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
      notificationCoordinator.cancel();
      detailCoordinator.cancel();
    },
    [
      detailCoordinator,
      loadCoordinator,
      managementCoordinator,
      notificationCoordinator,
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

  function toggleNotifications() {
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    setNotificationsOpen(true);
    void loadNotifications();
  }

  async function markNotificationsRead(id?: string) {
    if (!token || !can("notifications", "write") || notificationPendingId !== null) return;
    const operationEpoch = renderedSessionEpoch;
    if (operationEpoch === null || !isApiSessionEpochCurrent(operationEpoch)) return;
    const pendingId = id ?? "all";
    setNotificationPendingId(pendingId);
    setNotificationsError(null);
    try {
      await apiRequest(
        id ? `/api/notifications/${id}/read` : "/api/notifications/mark-all-read",
        token,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (!isApiSessionEpochCurrent(operationEpoch)) return;
      const readAt = new Date().toISOString();
      setNotificationItems((items) =>
        items.map((item) => (!id || item.id === id ? { ...item, readAt } : item))
      );
      setUnread((current) => (id ? Math.max(0, current - 1) : 0));
    } catch (cause) {
      if (!isApiSessionEpochCurrent(operationEpoch)) return;
      const detail = cause instanceof Error ? cause.message : t.apiOffline;
      setNotificationsError(`${t.notificationUpdateFailed}: ${detail}`);
    } finally {
      if (isApiSessionEpochCurrent(operationEpoch)) setNotificationPendingId(null);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loggingOut) return;
    const recovering = isApiReauthenticationRequired();
    setError(null);
    const finishAction = actionTracker.begin();
    try {
      const nextSession =
        portfolioLogin.enabled && !recovering
          ? await apiRequest<LoginResponse>("/api/auth/portfolio", undefined, {
              method: "POST",
              body: JSON.stringify({})
            })
          : await (() => {
              const form = new FormData(event.currentTarget);
              if (recovering) {
                const password = String(form.get("password") ?? "");
                event.currentTarget.reset();
                return reauthenticateApiSession(String(form.get("email") ?? ""), password);
              }
              return apiRequest<LoginResponse>("/api/auth/login", undefined, {
                method: "POST",
                body: JSON.stringify({
                  email: String(form.get("email") ?? ""),
                  password: String(form.get("password") ?? "")
                })
              });
            })();
      if (!recovering) setApiSession(nextSession);
    } catch (cause) {
      publishActionError(
        cause instanceof CompanySwitchError
          ? cause.reason === "UNCERTAIN"
            ? t.companySwitchUncertain
            : cause.reason === "REJECTED"
              ? t.loginFailed
              : t.companySwitchBlocked
          : `${t.loginFailed}: ${cause instanceof Error ? cause.message : t.apiOffline}`
      );
    } finally {
      finishAction();
    }
  }

  async function moveActivity(id: string, status: string) {
    if (!token || !can("activities", "write")) return;
    const operationEpoch = renderedSessionEpoch;
    if (operationEpoch === null || !isApiSessionEpochCurrent(operationEpoch)) return;
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
      const operationEpoch = renderedSessionEpoch;
      if (operationEpoch === null) return config;
      const authority = layoutAuthority.current[config.dashboardType];
      const generation = dashboardLayoutGenerations[config.dashboardType];
      const isAuthorised = () =>
        isApiSessionEpochCurrent(operationEpoch) &&
        authority.ready &&
        authority.epoch === operationEpoch &&
        authority.generation === generation;
      if (!isAuthorised()) return config;
      authority.writeRevision += 1;
      authority.pending += 1;
      try {
        const saved = await apiRequest<DashboardConfiguration>(
          `/api/dashboard/configuration/${config.dashboardType}`,
          token,
          { method: "PUT", body: JSON.stringify(config) }
        );
        // Revocation cannot undo a dispatched server write, but it must suppress its stale client result.
        if (!isAuthorised() || saved.dashboardType !== config.dashboardType) return config;
        setDashboardLayouts((current) => ({ ...current, [config.dashboardType]: saved }));
        return saved;
      } finally {
        authority.pending -= 1;
      }
    },
    [can, dashboardLayoutGenerations, renderedSessionEpoch, token]
  );

  const resetDashboardLayout = useCallback(
    async (dashboardType: DashboardLayoutKey) => {
      if (!token || !can("dashboard", "write")) return defaultDashboardLayouts[dashboardType];
      const operationEpoch = renderedSessionEpoch;
      if (operationEpoch === null) return defaultDashboardLayouts[dashboardType];
      const authority = layoutAuthority.current[dashboardType];
      const generation = dashboardLayoutGenerations[dashboardType];
      const isAuthorised = () =>
        isApiSessionEpochCurrent(operationEpoch) &&
        authority.ready &&
        authority.epoch === operationEpoch &&
        authority.generation === generation;
      if (!isAuthorised()) return defaultDashboardLayouts[dashboardType];
      authority.writeRevision += 1;
      authority.pending += 1;
      try {
        const saved = await apiRequest<DashboardConfiguration>(
          `/api/dashboard/configuration/${dashboardType}/reset`,
          token,
          { method: "POST", body: JSON.stringify({}) }
        );
        if (!isAuthorised() || saved.dashboardType !== dashboardType)
          return defaultDashboardLayouts[dashboardType];
        setDashboardLayouts((current) => ({ ...current, [dashboardType]: saved }));
        return saved;
      } finally {
        authority.pending -= 1;
      }
    },
    [can, dashboardLayoutGenerations, renderedSessionEpoch, token]
  );

  async function switchCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !isApiSessionEpochCurrent(renderedSessionEpoch) ||
      companySwitchRef.current ||
      loggingOut ||
      modalStateRef.current
    )
      return;
    const form = new FormData(event.currentTarget);
    const companyId = String(form.get("companyId") ?? "");
    const password = String(form.get("companyPassword") ?? "");
    event.currentTarget.reset();
    companySwitchRef.current = true;
    setCompanySwitchPending(true);
    setError(null);
    try {
      await switchApiCompany(companyId, password, renderedSessionEpoch);
    } catch (cause) {
      if (!isApiSessionEpochCurrent(renderedSessionEpoch) && captureApiSessionEpoch() !== null)
        return;
      const reason = cause instanceof CompanySwitchError ? cause.reason : "BLOCKED";
      publishActionError(
        reason === "UNCERTAIN"
          ? t.companySwitchUncertain
          : reason === "REJECTED"
            ? t.companySwitchRejected
            : t.companySwitchBlocked
      );
    } finally {
      companySwitchRef.current = false;
      setCompanySwitchPending(false);
    }
  }

  async function logout() {
    if (
      loggingOut ||
      companySwitchRef.current ||
      isApiCompanySwitchPending() ||
      !isApiSessionEpochCurrent(renderedSessionEpoch)
    )
      return;
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
    const authority = layoutAuthority.current[dashboardKind];
    if (
      !authority.ready ||
      authority.epoch !== operationEpoch ||
      authority.generation !== dashboardLayoutGenerations[dashboardKind]
    )
      return;
    window.dispatchEvent(new Event("shiftflow:customize-dashboard"));
  }

  async function runRbacMutation<T>(
    requiredAction: "write" | "delete",
    operation: () => Promise<T>,
    afterSuccess?: () => void | Promise<void>
  ) {
    if (!token || !can("rbac", requiredAction)) return "STALE" as const;
    const operationEpoch = renderedSessionEpoch;
    if (operationEpoch === null || !isApiSessionEpochCurrent(operationEpoch))
      return "STALE" as const;
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
          <form
            autoComplete={portfolioLogin.enabled ? "off" : undefined}
            className="login-card"
            onSubmit={submitLogin}
          >
            <div>
              <p className="eyebrow">{t.liveApi}</p>
              <h1>{t.loginTitle}</h1>
              <p>{t.loginSubtitle}</p>
              {reauthenticationRequired ? <p role="alert">{t.companySwitchUncertain}</p> : null}
              {portfolioLogin.enabled ? (
                <p className="guard-note" id="portfolio-access-hint">
                  {t.portfolioAccessHint}
                </p>
              ) : null}
            </div>
            <label>
              {t.email}
              <input
                aria-describedby={portfolioLogin.enabled ? "portfolio-access-hint" : undefined}
                autoComplete={portfolioLogin.enabled ? "off" : "username"}
                name={portfolioLogin.enabled ? undefined : "email"}
                readOnly={portfolioLogin.enabled}
                type="email"
                value={portfolioLogin.enabled ? portfolioLogin.email : undefined}
                required
              />
            </label>
            <label>
              {t.password}
              <input
                aria-describedby={portfolioLogin.enabled ? "portfolio-access-hint" : undefined}
                autoComplete={portfolioLogin.enabled ? "off" : "current-password"}
                name={portfolioLogin.enabled ? undefined : "password"}
                readOnly={portfolioLogin.enabled}
                type="password"
                value={portfolioLogin.enabled ? portfolioPasswordDisplay : undefined}
                required
              />
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
    <PageWorkspace
      key={captureApiSessionEpoch() ?? "anonymous"}
      activeTitleKey={activeTitleKey}
      actionLoading={actionLoading}
      activities={activities}
      activityDisplayedPage={activityDisplayedPage}
      activityDisplayedPageSize={activityDisplayedPageSize}
      activityTotal={activityTotal}
      authorisedView={authorisedView}
      availableMenu={availableMenu}
      availableViews={availableViews}
      charts={dashboardAvailability.charts === "ready" ? charts : emptyDashboardCharts}
      clients={clients}
      companySwitchPending={companySwitchPending}
      switchCompany={switchCompany}
      dashboardLayouts={{
        MAIN: mainDashboardReady ? dashboardLayouts.MAIN : defaultDashboardLayouts.MAIN,
        TEAM: teamDashboardReady ? dashboardLayouts.TEAM : defaultDashboardLayouts.TEAM
      }}
      dashboardAvailability={dashboardAvailability}
      dashboardLayoutGenerations={dashboardLayoutGenerations}
      dragged={dragged}
      drawerOpen={drawerOpen}
      filters={filters}
      kanbanActivities={kanbanActivities}
      kanbanDisplayedPage={kanbanDisplayedPage}
      kanbanDisplayedPageSize={kanbanDisplayedPageSize}
      kanbanTotal={kanbanTotal}
      loading={loading}
      locale={locale}
      mainDashboardReady={mainDashboardReady}
      managementClients={managementClients}
      managementLoading={managementLoading}
      managementShifts={managementShifts}
      managementSnapshot={managementSnapshot}
      managementTeams={managementTeams}
      managementUsers={managementUsers}
      modal={modal}
      modalCapabilities={modalCapabilities}
      monitorMode={monitorMode}
      navCollapsed={navCollapsed}
      notificationItems={notificationItems}
      notificationPendingId={notificationPendingId}
      notificationsError={notificationsError}
      notificationsLoading={notificationsLoading}
      notificationsOpen={notificationsOpen}
      operationalActivities={
        dashboardAvailability.operationalActivities === "ready" ? operationalActivities : []
      }
      rbacDisplayedPage={rbacDisplayedPage}
      rbacDisplayedPageSize={rbacDisplayedPageSize}
      rbacLoading={rbacLoading}
      rbacPermissions={rbacPermissions}
      rbacTotal={rbacTotal}
      referenceAccess={referenceAccess}
      reportSummary={reportSummary}
      roles={roles}
      search={search}
      searchableViews={searchableViews}
      session={session}
      shifts={shifts}
      summary={dashboardAvailability.summary === "ready" ? summary : emptyDashboardSummary}
      t={t}
      teamDashboardReady={teamDashboardReady}
      teamDirectory={dashboardAvailability.teamDirectory === "ready" ? teamDirectory : []}
      teamDirectoryDisplayedPage={teamDirectoryDisplayedPage}
      teamDirectoryDisplayedPageSize={teamDirectoryDisplayedPageSize}
      teamDirectoryTotal={teamDirectoryTotal}
      teams={teams}
      theme={theme}
      token={token}
      topbarContext={topbarContext}
      unread={unread}
      users={users}
      view={view}
      visibleError={visibleError}
      assignRolePermission={assignRolePermission}
      can={can}
      canCreateRecord={canCreateRecord}
      changeActivityPage={changeActivityPage}
      changeFilters={changeFilters}
      changeKanbanPage={changeKanbanPage}
      changeManagementPage={changeManagementPage}
      changeRbacPage={changeRbacPage}
      changeTeamDirectoryPage={changeTeamDirectoryPage}
      createRole={createRole}
      creationBlockReason={creationBlockReason}
      customizeDashboard={customizeDashboard}
      deleteRole={deleteRole}
      duplicateRole={duplicateRole}
      logout={logout}
      markNotificationsRead={markNotificationsRead}
      moveActivity={moveActivity}
      openCreate={openCreate}
      openDetail={openDetail}
      refreshCurrent={refreshCurrent}
      reloadAfterModalMutation={reloadAfterModalMutation}
      removeRolePermission={removeRolePermission}
      resetDashboardLayout={resetDashboardLayout}
      saveDashboardLayout={saveDashboardLayout}
      selectView={selectView}
      setDragged={setDragged}
      setDrawerOpen={setDrawerOpen}
      setLocale={setLocale}
      setModal={setModal}
      setNotificationsOpen={setNotificationsOpen}
      setSearch={setSearch}
      setTheme={setTheme}
      toggleMonitorMode={toggleMonitorMode}
      toggleNavigation={toggleNavigation}
      toggleNotifications={toggleNotifications}
      updateRole={updateRole}
    />
  );
}
