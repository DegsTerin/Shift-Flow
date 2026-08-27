// en-GB: Provides shared types definitions so frontend modules use one consistent implementation.
import type { Dispatch, SetStateAction } from "react";
import type { LayoutDashboard, Moon } from "lucide-react";
import type { messages } from "./i18n";

export type Locale = "pt-BR" | "en-GB";
export type Theme = "light" | "dark";
export type View =
  | "dashboard"
  | "team-dashboard"
  | "users"
  | "clients"
  | "teams"
  | "roles"
  | "shifts"
  | "activities"
  | "kanban"
  | "reports"
  | "settings";
export type ApiEnvelope<T> = { data: T };
export type SessionUser = {
  id: string;
  email: string;
  displayName?: string;
  companyId?: string;
  permissions?: string[];
};
export type LoginResponse = { accessToken: string; user: SessionUser };
export type ListResponse<T> = { items: T[]; total: number };
export type DashboardSummary = {
  total: number;
  pending: number;
  inProgress: number;
  done: number;
  critical: number;
  slaAtRisk: number;
  overdue: number;
  averageResolutionHours: number;
};
export type GroupCount = {
  _count?: { _all?: number };
  teamId?: string | null;
  clientId?: string | null;
  status?: string | null;
  priority?: string | null;
  shiftId?: string | null;
};
export type DashboardCharts = {
  byTeam: GroupCount[];
  byClient: GroupCount[];
  byStatus: GroupCount[];
  byPriority: GroupCount[];
  byShift: GroupCount[];
};
export type DashboardType = "MAIN" | "TEAM" | "EXECUTIVE";
export type DashboardWidget = {
  id?: string;
  key: string;
  widgetType:
    | "SUMMARY_CARD"
    | "BAR_CHART"
    | "LINE_CHART"
    | "PIE_CHART"
    | "TABLE"
    | "LIST"
    | "INDICATOR"
    | "CALENDAR"
    | "RECENT_ACTIVITIES"
    | "CUSTOM";
  title: string;
  description?: string | null;
  gridColumn: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  isVisible: boolean;
  isPinned: boolean;
  order: number;
  refreshIntervalMs?: number | null;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
export type DashboardConfiguration = {
  id?: string;
  dashboardType: DashboardType;
  teamId?: string | null;
  gridColumns: number;
  gridGap: number;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
  widgets: DashboardWidget[];
};
export type ClientRef = { id?: string; name?: string; code?: string; status?: string };
export type TeamMemberRole = "LEADER" | "MEMBER";
export type TeamMemberRef = {
  id?: string;
  userId?: string;
  role?: TeamMemberRole;
  user?: UserRef;
};
export type TeamRef = {
  id?: string;
  name?: string;
  color?: string;
  defaultSlaMinutes?: number;
  members?: TeamMemberRef[];
};
export type PermissionRef = {
  id?: string;
  resource?: string;
  action?: string;
  description?: string;
  isSystem?: boolean;
};
export type RolePermissionRef = {
  id?: string;
  permissionId?: string;
  permission?: PermissionRef;
};
export type RoleRef = {
  id?: string;
  name?: string;
  description?: string;
  color?: string | null;
  scope?: string;
  isSystem?: boolean;
  isActive?: boolean;
  deletedAt?: string | null;
  permissions?: RolePermissionRef[];
  _count?: { assignments?: number };
};
export type UserRoleAssignmentRef = {
  roleId?: string;
  clientId?: string | null;
  teamId?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  role?: RoleRef;
};
export type UserRef = {
  id?: string;
  displayName?: string;
  email?: string;
  jobTitle?: string;
  status?: string;
  roleAssignments?: UserRoleAssignmentRef[];
};
export type ShiftRef = {
  id?: string;
  name?: string;
  startsAt?: string;
  endsAt?: string;
  status?: string;
  timezone?: string;
};
export type CommentItem = { id: string; body: string; createdAt?: string; author?: UserRef };
export type AttachmentItem = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: string | number;
  createdAt?: string;
};
export type HistoryItem = {
  id: string;
  type: string;
  note?: string;
  fromStatus?: string;
  toStatus?: string;
  fromPriority?: string;
  toPriority?: string;
  createdAt?: string;
  actor?: UserRef | null;
  metadata?: unknown;
};
export type ActivityItem = {
  id: string;
  title: string;
  description?: string | null;
  requested?: string | null;
  performed?: string | null;
  inProgressDetail?: string | null;
  pendingDetail?: string | null;
  finalizationDetail?: string | null;
  observations?: string | null;
  client?: ClientRef;
  clientId?: string;
  systemName?: string | null;
  serviceName?: string | null;
  team?: TeamRef;
  teamId?: string;
  shift?: ShiftRef | null;
  shiftId?: string | null;
  assignee?: UserRef | null;
  assigneeId?: string | null;
  reporter?: UserRef | null;
  priority?: string;
  status?: string;
  slaDueAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  history?: HistoryItem[];
  comments?: CommentItem[];
  attachments?: AttachmentItem[];
};
export type ActivityTaskColumn = {
  id: string;
  name: string;
  color?: string | null;
  position: number;
  tasks?: ActivityTaskItem[];
};
export type ActivityTaskItem = {
  id: string;
  columnId: string;
  title: string;
  description?: string | null;
  priority?: string;
  labels?: string[];
  attachmentIds?: string[];
  position: number;
  completedAt?: string | null;
  archivedAt?: string | null;
  dueAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  assigneeId?: string | null;
  assignee?: UserRef | null;
};
export type ActivityTaskHistoryItem = {
  id: string;
  taskId?: string | null;
  type: string;
  fromColumnId?: string | null;
  toColumnId?: string | null;
  fromPosition?: number | null;
  toPosition?: number | null;
  note?: string | null;
  createdAt?: string;
  actor?: UserRef | null;
};
export type ActivityTaskBoard = {
  columns: ActivityTaskColumn[];
  history?: ActivityTaskHistoryItem[];
};
export type Filters = {
  clientId: string;
  teamId: string;
  shiftId: string;
  assigneeId: string;
  priority: string;
  status: string;
  attention: string;
  from: string;
  to: string;
};
export type ModalState = { mode: "create" | "detail"; entity: View; record?: unknown } | null;
export type Texts = (typeof messages)["pt-BR"];
export type MenuItem = { id: View; icon: typeof LayoutDashboard };
export type IconType = typeof Moon;
export type SetFilters = Dispatch<SetStateAction<Filters>>;
