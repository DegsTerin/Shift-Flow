// en-GB: Composes one page-data snapshot so endpoint results stay distinct until the current view commits them.
import { apiRequest, queryString } from "./api";
import type {
  ActivityItem,
  ClientRef,
  DashboardCharts,
  DashboardConfiguration,
  DashboardSummary,
  Filters,
  ListResponse,
  PermissionRef,
  ReportActivitySummary,
  RoleRef,
  ShiftRef,
  TeamRef,
  UserRef,
  View
} from "./types";

export const activityTablePageSize = 12;
export const kanbanPageSize = 100;
export const managementPageSize = 12;
export const rbacPageSize = 12;
const permissionCatalogPageSize = 100;

export type ManagementView = "users" | "clients" | "teams" | "shifts";
export type ManagementItem = UserRef | ClientRef | TeamRef | ShiftRef;

export function isManagementView(view: View): view is ManagementView {
  return view === "users" || view === "clients" || view === "teams" || view === "shifts";
}

function reportQuery(filters: Filters) {
  const params = new URLSearchParams();
  const supportedFilters: Array<keyof Filters> = [
    "clientId",
    "teamId",
    "shiftId",
    "status",
    "from",
    "to"
  ];
  supportedFilters.forEach((key) => {
    if (filters[key]) params.set(key, filters[key]);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function teamDirectoryQuery(page: number, search: string) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(managementPageSize)
  });
  const boundedSearch = search.trim().slice(0, 200);
  if (boundedSearch) params.set("search", boundedSearch);
  return params.toString();
}

export function lastPageForTotal(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type PageRequester = <T>(path: string, token?: string, init?: RequestInit) => Promise<T>;

type ReferenceDataMap = {
  clients: ListResponse<ClientRef>;
  users: ListResponse<UserRef>;
  teams: ListResponse<TeamRef>;
  shifts: ListResponse<ShiftRef>;
};

export type ReferenceSettlement<K extends keyof ReferenceDataMap = keyof ReferenceDataMap> = {
  [P in K]: { resource: P; value?: ReferenceDataMap[P]; error?: unknown };
}[K];

async function settleReference<K extends keyof ReferenceDataMap>(
  resource: K,
  request: Promise<ReferenceDataMap[K]> | undefined,
  onSettled?: (settlement: ReferenceSettlement) => void
): Promise<ReferenceSettlement<K>> {
  if (!request) return { resource };
  let settlement: ReferenceSettlement<K>;
  try {
    settlement = { resource, value: await request };
  } catch (error) {
    settlement = { resource, error };
  }
  onSettled?.(settlement as ReferenceSettlement);
  return settlement;
}

type RequestContext = {
  token: string;
  can: (resource: string, action: string) => boolean;
  signal: AbortSignal;
  request?: PageRequester;
};

export async function fetchPageData({
  token,
  can,
  filters,
  search,
  activityPage,
  kanbanPage,
  teamPage = 1,
  view,
  signal,
  request = apiRequest
}: {
  token: string;
  can: (resource: string, action: string) => boolean;
  filters: Filters;
  search: string;
  activityPage: number;
  kanbanPage: number;
  teamPage?: number;
  view: View;
  signal: AbortSignal;
  request?: PageRequester;
}) {
  const dashboardQuery = queryString(filters, search);
  const requestInit = { signal };
  try {
    if (view === "dashboard" && can("dashboard", "read")) {
      const [summary, charts, operationalActivities, mainLayout, teamDirectory] = await Promise.all(
        [
          request<DashboardSummary>(`/api/dashboard/summary${dashboardQuery}`, token, requestInit),
          request<DashboardCharts>(`/api/dashboard/charts${dashboardQuery}`, token, requestInit),
          request<ActivityItem[]>(
            `/api/dashboard/operational-list${dashboardQuery}`,
            token,
            requestInit
          ),
          request<DashboardConfiguration>("/api/dashboard/configuration/MAIN", token, requestInit),
          can("teams", "read")
            ? request<ListResponse<TeamRef>>(
                `/api/teams?${teamDirectoryQuery(teamPage, search)}`,
                token,
                requestInit
              )
            : undefined
        ]
      );
      return {
        dashboard: { summary, charts, operationalActivities, layouts: { MAIN: mainLayout } },
        teamDirectory,
        errors: [] as unknown[]
      };
    }

    if (view === "team-dashboard" && can("dashboard", "read")) {
      const [charts, operationalActivities, teamLayout, teamDirectory] = await Promise.all([
        request<DashboardCharts>(`/api/dashboard/charts${dashboardQuery}`, token, requestInit),
        request<ActivityItem[]>(
          `/api/dashboard/operational-list${dashboardQuery}`,
          token,
          requestInit
        ),
        request<DashboardConfiguration>("/api/dashboard/configuration/TEAM", token, requestInit),
        can("teams", "read")
          ? request<ListResponse<TeamRef>>(
              `/api/teams?${teamDirectoryQuery(teamPage, search)}`,
              token,
              requestInit
            )
          : undefined
      ]);
      return {
        dashboard: { charts, operationalActivities, layouts: { TEAM: teamLayout } },
        teamDirectory,
        errors: [] as unknown[]
      };
    }

    if ((view === "activities" || view === "kanban") && can("activities", "read")) {
      const requestedPage = view === "activities" ? activityPage : kanbanPage;
      const requestedPageSize = view === "activities" ? activityTablePageSize : kanbanPageSize;
      const activityQuery = queryString(filters, search, {
        page: requestedPage,
        pageSize: requestedPageSize
      });
      const activities = await request<ListResponse<ActivityItem>>(
        `/api/activities${activityQuery}`,
        token,
        requestInit
      );
      return { activities, errors: [] as unknown[] };
    }

    if (view === "reports" && can("reports", "read")) {
      const report = await request<ReportActivitySummary>(
        `/api/reports/activities${reportQuery(filters)}`,
        token,
        requestInit
      );
      return { report, errors: [] as unknown[] };
    }

    return { errors: [] as unknown[] };
  } catch (cause) {
    return { errors: [cause] };
  }
}

export async function fetchReferenceData({
  token,
  can,
  signal,
  request = apiRequest,
  onSettled
}: RequestContext & {
  onSettled?: (settlement: ReferenceSettlement) => void;
}) {
  const requestInit = { signal };
  const [clients, users, teams, shifts] = await Promise.all([
    settleReference(
      "clients",
      can("clients", "read")
        ? request<ListResponse<ClientRef>>("/api/clients", token, requestInit)
        : undefined,
      onSettled
    ),
    settleReference(
      "users",
      can("users", "read")
        ? request<ListResponse<UserRef>>("/api/users", token, requestInit)
        : undefined,
      onSettled
    ),
    settleReference(
      "teams",
      can("teams", "read")
        ? request<ListResponse<TeamRef>>("/api/teams", token, requestInit)
        : undefined,
      onSettled
    ),
    settleReference(
      "shifts",
      can("shifts", "read")
        ? request<ListResponse<ShiftRef>>("/api/shifts", token, requestInit)
        : undefined,
      onSettled
    )
  ]);

  return {
    clients: clients.value,
    users: users.value,
    teams: teams.value,
    shifts: shifts.value,
    errors: {
      ...(clients.error === undefined ? {} : { clients: clients.error }),
      ...(users.error === undefined ? {} : { users: users.error }),
      ...(teams.error === undefined ? {} : { teams: teams.error }),
      ...(shifts.error === undefined ? {} : { shifts: shifts.error })
    }
  };
}

export async function fetchManagementData({
  token,
  can,
  view,
  page,
  search,
  signal,
  request = apiRequest
}: RequestContext & {
  view: ManagementView;
  page: number;
  search: string;
}) {
  if (!can(view, "read")) return undefined;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(managementPageSize)
  });
  const boundedSearch = search.trim().slice(0, 200);
  if (boundedSearch) params.set("search", boundedSearch);
  return request<ListResponse<ManagementItem>>(`/api/${view}?${params}`, token, { signal });
}

async function fetchPermissionCatalog(token: string, signal: AbortSignal, request: PageRequester) {
  const items: PermissionRef[] = [];
  let page = 1;
  let total: number;
  do {
    const response = await request<ListResponse<PermissionRef>>(
      `/api/rbac/permissions?page=${page}&pageSize=${permissionCatalogPageSize}`,
      token,
      { signal }
    );
    if (response.page !== undefined && response.page !== page) {
      throw new Error("Permission catalogue pagination mismatch");
    }
    items.push(...response.items);
    total = response.total;
    if (!response.items.length && items.length < total) {
      throw new Error("Permission catalogue pagination made no progress");
    }
    page += 1;
  } while (items.length < total);
  return { items, total, page: 1, pageSize: permissionCatalogPageSize };
}

export async function fetchRbacData({
  token,
  can,
  page = 1,
  search = "",
  signal,
  request = apiRequest
}: RequestContext & { page?: number; search?: string }) {
  if (!can("rbac", "read")) return undefined;
  const requestInit = { signal };
  const params = new URLSearchParams({ page: String(page), pageSize: String(rbacPageSize) });
  const boundedSearch = search.trim().slice(0, 200);
  if (boundedSearch) params.set("search", boundedSearch);
  const [roles, permissions] = await Promise.all([
    request<ListResponse<RoleRef>>(`/api/rbac/roles?${params}`, token, requestInit),
    fetchPermissionCatalog(token, signal, request)
  ]);
  return { roles, permissions };
}

export function fetchUnreadData({ token, can, signal, request = apiRequest }: RequestContext) {
  if (!can("notifications", "read")) return Promise.resolve(undefined);
  return request<{ unread: number; count?: number }>("/api/notifications/unread-count", token, {
    signal
  });
}
