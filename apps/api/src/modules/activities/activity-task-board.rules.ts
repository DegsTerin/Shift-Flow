// en-GB: Defines deterministic task-board rules separately from transactional persistence.

export type TaskBoardRecord = Record<string, unknown> & { id: string };

const DONE_COLUMN_NAMES = new Set(["concluido", "concluído", "done"]);

export function numericPosition(record: TaskBoardRecord) {
  return typeof record.position === "number" ? record.position : 0;
}

export function boundedPosition(value: unknown, length: number) {
  const requested = typeof value === "number" ? value : length;
  return Math.max(0, Math.min(requested, length));
}

export function isDoneColumn(column: TaskBoardRecord) {
  return DONE_COLUMN_NAMES.has(
    String(column.name ?? "")
      .trim()
      .normalize("NFC")
      .toLowerCase()
  );
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  return value;
}

export function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function taskSnapshot(value: TaskBoardRecord) {
  const fields = [
    "id",
    "companyId",
    "activityId",
    "columnId",
    "assigneeId",
    "title",
    "description",
    "priority",
    "labels",
    "attachmentIds",
    "position",
    "dueAt",
    "completedAt",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "deletedAt"
  ];
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => [field, comparable(value[field])])
  );
}

export function changedTaskData(previous: TaskBoardRecord, input: Record<string, unknown>) {
  const mutableFields = [
    "title",
    "description",
    "assigneeId",
    "priority",
    "labels",
    "attachmentIds",
    "dueAt"
  ];
  return Object.fromEntries(
    mutableFields
      .filter((field) => Object.hasOwn(input, field))
      .map((field) => [field, canonicalTaskField(field, input[field])] as const)
      .filter(([field, value]) => !valuesEqual(value, canonicalTaskField(field, previous[field])))
  );
}

function canonicalTaskField(field: string, value: unknown) {
  if (field === "attachmentIds" && Array.isArray(value)) {
    return value.map(String).map((attachmentId) => attachmentId.toLowerCase());
  }
  if (field === "assigneeId" && typeof value === "string") return value.toLowerCase();
  return value;
}
