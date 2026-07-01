import type { FormEvent } from "react";
import { apiRequest } from "./api";
import type {
  ActivityItem,
  ClientRef,
  Filters,
  Locale,
  ShiftRef,
  TeamRef,
  Texts,
  UserRef,
  View
} from "./types";

export const emptyFilters: Filters = {
  clientId: "",
  teamId: "",
  shiftId: "",
  assigneeId: "",
  priority: "",
  status: "",
  from: "",
  to: ""
};
export const statusGroups = [
  "PENDING",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_THIRD_PARTY",
  "MONITORING",
  "DONE",
  "CANCELLED"
];
export const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const activityStatuses = statusGroups;
export const shiftStatuses = ["PLANNED", "OPEN", "CLOSED", "REOPENED", "CANCELLED"];
export const statusColors: Record<string, string> = {
  PENDING: "#64748b",
  IN_PROGRESS: "#0ea5e9",
  WAITING_CUSTOMER: "#8b5cf6",
  WAITING_THIRD_PARTY: "#f59e0b",
  MONITORING: "#14b8a6",
  DONE: "#16a34a",
  CANCELLED: "#dc2626"
};

export function countOf(item: { _count?: { _all?: number } }) {
  return item._count?._all ?? 0;
}

export function formatDateTime(value?: string | null, locale: Locale = "pt-BR") {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value)
  );
}

export function formatTime(value?: string | null, locale: Locale = "pt-BR") {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value)
  );
}

export function slaLabel(value?: string | null) {
  if (!value) return "-";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (minutes < 0) return "SLA breach";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

export function statusLabel(status: string | undefined, t: Texts) {
  const labels: Record<string, string> = {
    PENDING: t.statusPending,
    IN_PROGRESS: t.statusInProgress,
    WAITING_CUSTOMER: t.statusWaitingCustomer,
    WAITING_THIRD_PARTY: t.statusWaitingThirdParty,
    MONITORING: t.statusMonitoring,
    DONE: t.statusDone,
    CANCELLED: t.statusCancelled
  };
  return labels[status ?? ""] ?? status ?? "-";
}

export function statusLegend(t: Texts) {
  return statusGroups.map((status) => ({
    status,
    label: statusLabel(status, t),
    color: statusColors[status]
  }));
}

export function matchesSearch(row: unknown, search: string) {
  if (!search.trim()) return true;
  return JSON.stringify(row).toLowerCase().includes(search.trim().toLowerCase());
}

export function userOptionLabel(user: UserRef) {
  return user.email ?? user.displayName ?? "-";
}

export function idOf(row: unknown) {
  return typeof row === "object" && row && "id" in row
    ? String((row as { id?: unknown }).id ?? "")
    : "";
}

export function toDateInputValue(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function activityPayload(form: FormData) {
  const description = String(form.get("description") || form.get("requested") || "");
  return {
    title: String(form.get("title") ?? ""),
    clientId: String(form.get("clientId") ?? ""),
    teamId: String(form.get("teamId") ?? ""),
    shiftId: String(form.get("shiftId") || "") || undefined,
    assigneeId: String(form.get("assigneeId") || "") || undefined,
    systemName: String(form.get("systemName") || "") || undefined,
    serviceName: String(form.get("serviceName") || "") || undefined,
    status: String(form.get("status") || "PENDING"),
    priority: String(form.get("priority") || "MEDIUM"),
    slaDueAt: String(form.get("slaDueAt") || "") || undefined,
    description,
    requested: String(form.get("requested") || "") || undefined,
    performed: String(form.get("performed") || "") || undefined,
    inProgressDetail: String(form.get("inProgressDetail") || "") || undefined,
    pendingDetail: String(form.get("pendingDetail") || "") || undefined,
    finalizationDetail: String(form.get("finalizationDetail") || "") || undefined,
    observations: String(form.get("observations") || "") || undefined
  };
}

export function userPayload(form: FormData, includePassword = false) {
  const password = String(form.get("password") || "");
  return {
    email: String(form.get("email") ?? ""),
    displayName: String(form.get("displayName") ?? ""),
    jobTitle: String(form.get("jobTitle") || "") || undefined,
    status: String(form.get("status") || "ACTIVE"),
    preferredLocale: String(form.get("preferredLocale") || "PT_BR"),
    preferredTheme: String(form.get("preferredTheme") || "SYSTEM"),
    roleId: String(form.get("roleId") || "") || undefined,
    ...(includePassword || password ? { password } : {})
  };
}

export function clientPayload(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    code: String(form.get("code") || "") || undefined,
    status: String(form.get("status") || "ACTIVE")
  };
}

export function userRoleName(user: UserRef) {
  return user.roleAssignments?.[0]?.role?.name ?? "-";
}

export function userRoleId(user: UserRef) {
  return user.roleAssignments?.[0]?.roleId ?? user.roleAssignments?.[0]?.role?.id ?? "";
}

export function hasPermission(permissions: string[] | undefined, resource: string, action: string) {
  return Boolean(permissions?.includes("*:*") || permissions?.includes(`${resource}:${action}`));
}

export function teamPayload(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") || "") || undefined,
    color: String(form.get("color") || "") || undefined,
    defaultSlaMinutes: Number(form.get("defaultSlaMinutes") || 240)
  };
}

export function shiftPayload(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    startsAt: String(form.get("startsAt") ?? ""),
    endsAt: String(form.get("endsAt") ?? ""),
    timezone: String(form.get("timezone") || "America/Sao_Paulo"),
    status: String(form.get("status") || "OPEN")
  };
}

export function recordEndpoint(entity: View, id: string) {
  if (entity === "users") return `/api/users/${id}`;
  if (entity === "clients") return `/api/clients/${id}`;
  if (entity === "teams") return `/api/teams/${id}`;
  if (entity === "shifts") return `/api/shifts/${id}`;
  if (entity === "activities" || entity === "kanban") return `/api/activities/${id}`;
  return "";
}

export function recordPayload(
  entity: View,
  form: FormData,
  clients: ClientRef[],
  teams: TeamRef[]
) {
  if (entity === "users") return userPayload(form);
  if (entity === "clients") return clientPayload(form);
  if (entity === "teams") return teamPayload(form);
  if (entity === "shifts") return shiftPayload(form);
  if (entity === "activities" || entity === "kanban")
    return {
      ...activityPayload(form),
      clientId: String(form.get("clientId") || clients[0]?.id || ""),
      teamId: String(form.get("teamId") || teams[0]?.id || "")
    };
  return Object.fromEntries(form);
}

export async function createRecord(
  entity: View,
  form: FormData,
  token: string,
  clients: ClientRef[],
  teams: TeamRef[]
) {
  if (entity === "users")
    return apiRequest("/api/users", token, {
      method: "POST",
      body: JSON.stringify(userPayload(form, true))
    });
  if (entity === "clients")
    return apiRequest("/api/clients", token, {
      method: "POST",
      body: JSON.stringify(clientPayload(form))
    });
  if (entity === "teams")
    return apiRequest("/api/teams", token, {
      method: "POST",
      body: JSON.stringify(teamPayload(form))
    });
  if (entity === "shifts")
    return apiRequest<ShiftRef>("/api/shifts", token, {
      method: "POST",
      body: JSON.stringify(shiftPayload(form))
    });
  if (entity === "activities" || entity === "kanban")
    return apiRequest<ActivityItem>("/api/activities", token, {
      method: "POST",
      body: JSON.stringify({
        ...activityPayload(form),
        clientId: String(form.get("clientId") || clients[0]?.id || ""),
        teamId: String(form.get("teamId") || teams[0]?.id || "")
      })
    });
  return undefined;
}

export type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void;
