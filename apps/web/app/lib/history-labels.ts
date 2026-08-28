// en-GB: Presents structured history values in the active locale while preserving human notes verbatim.
import type { ActivityTaskHistoryItem, HistoryItem, Texts } from "./types";

const activityTypeKeys = {
  CREATED: "historyTypeCreated",
  UPDATED: "historyTypeUpdated",
  STATUS_CHANGED: "historyTypeStatusChanged",
  PRIORITY_CHANGED: "historyTypePriorityChanged",
  ASSIGNED: "historyTypeAssigned",
  UNASSIGNED: "historyTypeUnassigned",
  MOVED_TEAM: "historyTypeMovedTeam",
  MOVED_SHIFT: "historyTypeMovedShift",
  SLA_UPDATED: "historyTypeSlaUpdated",
  COMMENTED: "historyTypeCommented",
  ATTACHMENT_ADDED: "historyTypeAttachmentAdded",
  CLOSED: "historyTypeClosed",
  REOPENED: "historyTypeReopened",
  SOFT_DELETED: "historyTypeSoftDeleted"
} as const satisfies Record<string, keyof Texts>;

const taskTypeKeys = {
  CREATED: "taskHistoryTypeCreated",
  UPDATED: "taskHistoryTypeUpdated",
  MOVED: "taskHistoryTypeMoved",
  ARCHIVED: "taskHistoryTypeArchived",
  RESTORED: "taskHistoryTypeRestored",
  DELETED: "taskHistoryTypeDeleted"
} as const satisfies Record<string, keyof Texts>;

const statusKeys = {
  PENDING: "statusPending",
  IN_PROGRESS: "statusInProgress",
  WAITING_CUSTOMER: "statusWaitingCustomer",
  WAITING_THIRD_PARTY: "statusWaitingThirdParty",
  MONITORING: "statusMonitoring",
  DONE: "statusDone",
  CANCELLED: "statusCancelled"
} as const satisfies Record<string, keyof Texts>;

const priorityKeys = {
  LOW: "priorityLow",
  MEDIUM: "priorityMedium",
  HIGH: "priorityHigh",
  CRITICAL: "priorityCritical"
} as const satisfies Record<string, keyof Texts>;

const legacyActivityNoteKeys = {
  "Moved from integrated Kanban": "historyMovementRecorded",
  "Encerrado pelo modal operacional": "historyTypeClosed",
  "Reaberto pelo modal operacional": "historyTypeReopened"
} as const satisfies Record<string, keyof Texts>;

const legacyTaskNoteKeys = {
  "Movido no Kanban interno": "movementRecorded"
} as const satisfies Record<string, keyof Texts>;

function valueForKey(t: Texts, key: keyof Texts) {
  return String(t[key]);
}

export function activityHistoryTypeLabel(type: string, t: Texts) {
  const key = activityTypeKeys[type as keyof typeof activityTypeKeys];
  return key ? valueForKey(t, key) : t.changeRecorded;
}

export function taskHistoryTypeLabel(type: string, t: Texts) {
  const key = taskTypeKeys[type as keyof typeof taskTypeKeys];
  return key ? valueForKey(t, key) : t.changeRecorded;
}

function statusValueLabel(value: string, t: Texts) {
  const key = statusKeys[value as keyof typeof statusKeys];
  return key ? valueForKey(t, key) : value;
}

function priorityValueLabel(value: string, t: Texts) {
  const key = priorityKeys[value as keyof typeof priorityKeys];
  return key ? valueForKey(t, key) : value;
}

export function activityHistoryText(item: HistoryItem, t: Texts) {
  if (item.note) {
    const key = legacyActivityNoteKeys[item.note as keyof typeof legacyActivityNoteKeys];
    return key ? valueForKey(t, key) : item.note;
  }
  const statusChange = [item.fromStatus, item.toStatus]
    .filter((value): value is string => Boolean(value))
    .map((value) => statusValueLabel(value, t))
    .join(" -> ");
  if (statusChange) return statusChange;
  const priorityChange = [item.fromPriority, item.toPriority]
    .filter((value): value is string => Boolean(value))
    .map((value) => priorityValueLabel(value, t))
    .join(" -> ");
  if (priorityChange) return priorityChange;
  if (item.metadata) return t.historyChangeRecorded;
  return t.historyChangeRecorded;
}

export function taskHistoryText(item: ActivityTaskHistoryItem, t: Texts) {
  if (item.note) {
    const key = legacyTaskNoteKeys[item.note as keyof typeof legacyTaskNoteKeys];
    return key ? valueForKey(t, key) : item.note;
  }
  const moved = [item.fromPosition, item.toPosition].filter(
    (value) => value !== undefined && value !== null
  );
  if (item.fromColumnId || item.toColumnId || moved.length) return t.movementRecorded;
  return t.changeRecorded;
}
