// en-GB: Owns task-board transactions so ordering, references and evidence change atomically.
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { getPrisma } from "../../shared/lib/prisma.js";

const MAX_TASK_COLUMNS = 100;
const ARCHIVED_TASK_WINDOW = 100;
const DONE_COLUMN_NAMES = new Set(["concluido", "concluído", "done"]);

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
};

const taskInclude = {
  assignee: { select: publicUserSelect }
};

type EntityRecord = Record<string, unknown> & { id: string };

type EntityDelegate = {
  findMany(args: unknown): Promise<EntityRecord[]>;
  findFirst(args: unknown): Promise<EntityRecord | null>;
  create(args: unknown): Promise<EntityRecord>;
  update(args: unknown): Promise<EntityRecord>;
};

type HistoryDelegate = {
  findMany(args: unknown): Promise<EntityRecord[]>;
  create(args: unknown): Promise<EntityRecord>;
};

type TaskBoardTransaction = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  activityTaskColumn: EntityDelegate;
  activityTask: EntityDelegate;
  activityTaskHistory: HistoryDelegate;
};

export type TaskBoardContext = {
  companyId: string;
  activityId: string;
  actorUserId?: string;
};

const columnOrder = [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }];
const taskOrder = [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }];

function numericPosition(record: EntityRecord) {
  return typeof record.position === "number" ? record.position : 0;
}

function boundedPosition(value: unknown, length: number) {
  const requested = typeof value === "number" ? value : length;
  return Math.max(0, Math.min(requested, length));
}

function isDoneColumn(column: EntityRecord) {
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

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function taskSnapshot(value: EntityRecord) {
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

export class ActivityTaskBoardRepository {
  async read(context: TaskBoardContext) {
    return this.withSharedActivity(context, (tx) => this.readFromTransaction(tx, context));
  }

  async createColumn(context: TaskBoardContext, input: Record<string, unknown>) {
    return this.withLockedActivity(context, async (tx) => {
      const columns = await this.activeColumns(tx, context);
      if (columns.length >= MAX_TASK_COLUMNS) {
        throw badRequest(`A task board cannot contain more than ${MAX_TASK_COLUMNS} columns`);
      }
      const position = boundedPosition(input.position, columns.length);
      const data = Object.fromEntries(
        Object.entries(input).filter(([field]) => field !== "position")
      );
      await this.persistPositions(
        tx.activityTaskColumn,
        context.companyId,
        columns.slice(0, position)
      );
      await this.persistPositions(
        tx.activityTaskColumn,
        context.companyId,
        columns.slice(position),
        position + 1
      );
      return tx.activityTaskColumn.create({
        data: { ...data, companyId: context.companyId, activityId: context.activityId, position }
      });
    });
  }

  async updateColumn(context: TaskBoardContext, columnId: string, input: Record<string, unknown>) {
    return this.withLockedActivity(context, async (tx) => {
      const column = await this.activeColumn(tx, context, columnId);
      const changesCompletionClass =
        Object.hasOwn(input, "name") &&
        isDoneColumn(column) !== isDoneColumn({ id: column.id, name: input.name });
      if (changesCompletionClass) {
        const task = await tx.activityTask.findFirst({
          where: {
            companyId: context.companyId,
            activityId: context.activityId,
            columnId,
            deletedAt: null
          }
        });
        if (task) {
          throw badRequest("A column containing tasks cannot be renamed across completion states");
        }
      }
      const data = Object.fromEntries(
        ["name", "color"]
          .filter(
            (field) => Object.hasOwn(input, field) && !valuesEqual(input[field], column[field])
          )
          .map((field) => [field, input[field]])
      );
      if (!Object.keys(data).length) return column;
      return tx.activityTaskColumn.update({ where: { id: columnId }, data });
    });
  }

  async deleteColumn(context: TaskBoardContext, columnId: string) {
    return this.withLockedActivity(context, async (tx) => {
      await this.activeColumn(tx, context, columnId);
      const task = await tx.activityTask.findFirst({
        where: {
          companyId: context.companyId,
          activityId: context.activityId,
          columnId,
          deletedAt: null
        }
      });
      if (task) {
        throw badRequest(
          "Task columns containing tasks, including archived tasks, cannot be deleted"
        );
      }
      const deleted = await tx.activityTaskColumn.update({
        where: { id: columnId },
        data: { deletedAt: new Date() }
      });
      const remaining = (await this.activeColumns(tx, context)).filter(
        (column) => column.id !== columnId
      );
      await this.persistPositions(tx.activityTaskColumn, context.companyId, remaining);
      return deleted;
    });
  }

  async reorderColumns(context: TaskBoardContext, columnIds: string[]) {
    return this.withLockedActivity(context, async (tx) => {
      const columns = await this.activeColumns(tx, context);
      const canonicalColumnIds = columnIds.map((columnId) => columnId.toLowerCase());
      const requested = new Set(canonicalColumnIds);
      const existing = new Set(columns.map((column) => column.id.toLowerCase()));
      if (
        requested.size !== canonicalColumnIds.length ||
        canonicalColumnIds.length !== columns.length ||
        canonicalColumnIds.some((columnId) => !existing.has(columnId))
      ) {
        throw badRequest("Column order must contain every active column exactly once");
      }
      const byId = new Map(columns.map((column) => [column.id.toLowerCase(), column]));
      await this.persistPositions(
        tx.activityTaskColumn,
        context.companyId,
        canonicalColumnIds.map((columnId) => byId.get(columnId) as EntityRecord)
      );
      return this.readFromTransaction(tx, context);
    });
  }

  async createTask(context: TaskBoardContext, input: Record<string, unknown>) {
    return this.withLockedActivity(context, async (tx) => {
      const columnId = String(input.columnId).toLowerCase();
      const column = await this.activeColumn(tx, context, columnId);
      await this.lockChangedReferences(tx, context, input);
      const siblings = await this.activeTasks(tx, context, columnId);
      const position = boundedPosition(input.position, siblings.length);
      const data = Object.fromEntries(
        Object.entries(input).filter(([field]) => field !== "position" && field !== "columnId")
      );
      if (Array.isArray(data.attachmentIds)) {
        data.attachmentIds = data.attachmentIds.map(String).map((id) => id.toLowerCase());
      }
      if (typeof data.assigneeId === "string") data.assigneeId = data.assigneeId.toLowerCase();
      await this.persistPositions(tx.activityTask, context.companyId, siblings.slice(0, position));
      await this.persistPositions(
        tx.activityTask,
        context.companyId,
        siblings.slice(position),
        position + 1
      );
      const created = await tx.activityTask.create({
        data: {
          ...data,
          companyId: context.companyId,
          activityId: context.activityId,
          columnId,
          position,
          completedAt: isDoneColumn(column) ? new Date() : null
        }
      });
      await this.writeHistory(tx, context, "CREATED", {
        taskId: created.id,
        toColumnId: columnId,
        toPosition: position,
        metadata: { after: taskSnapshot(created) }
      });
      return created;
    });
  }

  async updateTask(context: TaskBoardContext, taskId: string, input: Record<string, unknown>) {
    return this.withLockedActivity(context, async (tx) => {
      const previous = await this.activeTask(tx, context, taskId);
      if (previous.archivedAt) throw badRequest("Archived tasks cannot be updated");

      const requestedColumnId = Object.hasOwn(input, "columnId")
        ? String(input.columnId).toLowerCase()
        : String(previous.columnId).toLowerCase();
      const movesColumn = requestedColumnId !== String(previous.columnId).toLowerCase();
      const targetColumn = movesColumn
        ? await this.activeColumn(tx, context, requestedColumnId)
        : await this.activeColumn(tx, context, String(previous.columnId));
      const changedData = this.changedTaskData(previous, input);
      await this.lockChangedReferences(tx, context, changedData);

      if (!movesColumn) {
        if (!Object.keys(changedData).length) return previous;
        const updated = await tx.activityTask.update({ where: { id: taskId }, data: changedData });
        await this.writeHistory(tx, context, "UPDATED", {
          taskId,
          metadata: { before: taskSnapshot(previous), after: taskSnapshot(updated) }
        });
        return updated;
      }

      const moved = await this.moveTaskInTransaction(
        tx,
        context,
        previous,
        targetColumn,
        Number.MAX_SAFE_INTEGER,
        changedData
      );
      await this.writeHistory(tx, context, "MOVED", {
        taskId,
        fromColumnId: String(previous.columnId),
        toColumnId: requestedColumnId,
        fromPosition: numericPosition(previous),
        toPosition: numericPosition(moved),
        metadata: { before: taskSnapshot(previous), after: taskSnapshot(moved) }
      });
      return moved;
    });
  }

  async deleteTask(context: TaskBoardContext, taskId: string) {
    return this.withLockedActivity(context, async (tx) => {
      const previous = await this.activeTask(tx, context, taskId);
      if (!previous.archivedAt) {
        const siblings = await this.activeTasks(tx, context, String(previous.columnId), taskId);
        await this.persistPositions(tx.activityTask, context.companyId, siblings);
      }
      const deleted = await tx.activityTask.update({
        where: { id: taskId },
        data: { deletedAt: new Date() }
      });
      await this.writeHistory(tx, context, "DELETED", {
        taskId,
        metadata: { before: taskSnapshot(previous), after: taskSnapshot(deleted) }
      });
      return deleted;
    });
  }

  async archiveTask(context: TaskBoardContext, taskId: string) {
    return this.withLockedActivity(context, async (tx) => {
      const previous = await this.activeTask(tx, context, taskId);
      if (previous.archivedAt) return previous;
      const siblings = await this.activeTasks(tx, context, String(previous.columnId), taskId);
      await this.persistPositions(tx.activityTask, context.companyId, siblings);
      const archived = await tx.activityTask.update({
        where: { id: taskId },
        data: { archivedAt: new Date() }
      });
      await this.writeHistory(tx, context, "ARCHIVED", {
        taskId,
        metadata: { before: taskSnapshot(previous), after: taskSnapshot(archived) }
      });
      return archived;
    });
  }

  async restoreTask(context: TaskBoardContext, taskId: string, columnId?: string) {
    return this.withLockedActivity(context, async (tx) => {
      const previous = await this.activeTask(tx, context, taskId);
      if (!previous.archivedAt) return previous;
      const targetColumnId = (columnId ?? String(previous.columnId)).toLowerCase();
      const column = await this.activeColumn(tx, context, targetColumnId);
      const siblings = await this.activeTasks(tx, context, targetColumnId, taskId);
      await this.persistPositions(tx.activityTask, context.companyId, siblings);
      const restored = await tx.activityTask.update({
        where: { id: taskId },
        data: {
          archivedAt: null,
          columnId: targetColumnId,
          position: siblings.length,
          completedAt: isDoneColumn(column) ? (previous.completedAt ?? new Date()) : null
        }
      });
      await this.writeHistory(tx, context, "RESTORED", {
        taskId,
        fromColumnId: String(previous.columnId),
        toColumnId: targetColumnId,
        toPosition: siblings.length,
        metadata: { before: taskSnapshot(previous), after: taskSnapshot(restored) }
      });
      return restored;
    });
  }

  async moveTask(
    context: TaskBoardContext,
    taskId: string,
    columnId: string,
    position: number,
    note?: string
  ) {
    return this.withLockedActivity(context, async (tx) => {
      const previous = await this.activeTask(tx, context, taskId);
      if (previous.archivedAt) throw badRequest("Archived tasks cannot be moved");
      const targetColumn = await this.activeColumn(tx, context, columnId.toLowerCase());
      const moved = await this.moveTaskInTransaction(
        tx,
        context,
        previous,
        targetColumn,
        position,
        {}
      );
      if (moved === previous) return previous;
      await this.writeHistory(tx, context, "MOVED", {
        taskId,
        fromColumnId: String(previous.columnId),
        toColumnId: targetColumn.id,
        fromPosition: numericPosition(previous),
        toPosition: numericPosition(moved),
        note
      });
      return moved;
    });
  }

  private async withLockedActivity<T>(
    context: TaskBoardContext,
    command: (tx: TaskBoardTransaction) => Promise<T>
  ) {
    return this.withActivityLock(context, "UPDATE", command);
  }

  private async withSharedActivity<T>(
    context: TaskBoardContext,
    query: (tx: TaskBoardTransaction) => Promise<T>
  ) {
    return this.withActivityLock(context, "SHARE", query);
  }

  private async withActivityLock<T>(
    context: TaskBoardContext,
    strength: "SHARE" | "UPDATE",
    operation: (tx: TaskBoardTransaction) => Promise<T>
  ) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TaskBoardTransaction) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "activities" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR ${strength}`,
        context.activityId,
        context.companyId
      );
      if (!locked.length) throw notFound("Activity not found");
      return operation(tx);
    });
  }

  private async readFromTransaction(tx: TaskBoardTransaction, context: TaskBoardContext) {
    const columns = await tx.activityTaskColumn.findMany({
      where: { companyId: context.companyId, activityId: context.activityId, deletedAt: null },
      orderBy: columnOrder,
      include: {
        tasks: {
          where: {
            companyId: context.companyId,
            activityId: context.activityId,
            deletedAt: null,
            archivedAt: null
          },
          orderBy: taskOrder,
          include: taskInclude
        }
      }
    });
    const archivedTaskWindow = await tx.activityTask.findMany({
      where: {
        companyId: context.companyId,
        activityId: context.activityId,
        deletedAt: null,
        archivedAt: { not: null }
      },
      orderBy: [{ archivedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: ARCHIVED_TASK_WINDOW + 1,
      include: taskInclude
    });
    const history = await tx.activityTaskHistory.findMany({
      where: { companyId: context.companyId, activityId: context.activityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 40,
      include: { actor: { select: publicUserSelect } }
    });
    return {
      columns,
      archivedTasks: archivedTaskWindow.slice(0, ARCHIVED_TASK_WINDOW),
      archivedTasksTruncated: archivedTaskWindow.length > ARCHIVED_TASK_WINDOW,
      history
    };
  }

  private activeColumns(tx: TaskBoardTransaction, context: TaskBoardContext) {
    return tx.activityTaskColumn.findMany({
      where: { companyId: context.companyId, activityId: context.activityId, deletedAt: null },
      orderBy: columnOrder
    });
  }

  private async activeColumn(
    tx: TaskBoardTransaction,
    context: TaskBoardContext,
    columnId: string
  ) {
    const column = await tx.activityTaskColumn.findFirst({
      where: {
        id: columnId,
        companyId: context.companyId,
        activityId: context.activityId,
        deletedAt: null
      }
    });
    if (!column) throw badRequest("Task column does not belong to this activity");
    return column;
  }

  private async activeTask(tx: TaskBoardTransaction, context: TaskBoardContext, taskId: string) {
    const task = await tx.activityTask.findFirst({
      where: {
        id: taskId,
        companyId: context.companyId,
        activityId: context.activityId,
        deletedAt: null
      }
    });
    if (!task) throw badRequest("Task does not belong to this activity");
    return task;
  }

  private activeTasks(
    tx: TaskBoardTransaction,
    context: TaskBoardContext,
    columnId: string,
    excludedTaskId?: string
  ) {
    return tx.activityTask.findMany({
      where: {
        companyId: context.companyId,
        activityId: context.activityId,
        columnId,
        deletedAt: null,
        archivedAt: null,
        ...(excludedTaskId ? { NOT: { id: excludedTaskId } } : {})
      },
      orderBy: taskOrder
    });
  }

  private async persistPositions(
    delegate: EntityDelegate,
    companyId: string,
    records: EntityRecord[],
    offset = 0,
    skippedId?: string
  ) {
    for (let index = 0; index < records.length; index += 1) {
      const position = index + offset;
      if (records[index].id === skippedId) continue;
      if (numericPosition(records[index]) === position) continue;
      await delegate.update({
        where: { id: records[index].id, companyId },
        data: { position }
      });
    }
  }

  private changedTaskData(previous: EntityRecord, input: Record<string, unknown>) {
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
        .map((field) => [field, this.canonicalTaskField(field, input[field])] as const)
        .filter(
          ([field, value]) => !valuesEqual(value, this.canonicalTaskField(field, previous[field]))
        )
    );
  }

  private canonicalTaskField(field: string, value: unknown) {
    if (field === "attachmentIds" && Array.isArray(value)) {
      return value.map(String).map((attachmentId) => attachmentId.toLowerCase());
    }
    if (field === "assigneeId" && typeof value === "string") return value.toLowerCase();
    return value;
  }

  private async lockChangedReferences(
    tx: TaskBoardTransaction,
    context: TaskBoardContext,
    data: Record<string, unknown>
  ) {
    if (Object.hasOwn(data, "assigneeId") && data.assigneeId) {
      const memberships = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "user_companies" WHERE "userId" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR SHARE',
        String(data.assigneeId).toLowerCase(),
        context.companyId
      );
      if (!memberships.length) throw forbidden("User does not belong to the active company");
    }

    if (!Object.hasOwn(data, "attachmentIds")) return;
    const attachmentIds = Array.isArray(data.attachmentIds)
      ? data.attachmentIds
          .map(String)
          .map((attachmentId) => attachmentId.toLowerCase())
          .sort()
      : [];
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      throw badRequest("Task attachments must be unique");
    }
    if (!attachmentIds.length) return;
    const attachments = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "attachments" WHERE "id" = ANY($1::uuid[]) AND "companyId" = $2::uuid AND "activityId" = $3::uuid AND "deletedAt" IS NULL ORDER BY "id" FOR SHARE',
      attachmentIds,
      context.companyId,
      context.activityId
    );
    const found = new Set(attachments.map((attachment) => attachment.id.toLowerCase()));
    if (attachmentIds.some((attachmentId) => !found.has(attachmentId))) {
      throw badRequest("Task attachments must belong to this active activity");
    }
  }

  private async moveTaskInTransaction(
    tx: TaskBoardTransaction,
    context: TaskBoardContext,
    previous: EntityRecord,
    targetColumn: EntityRecord,
    requestedPosition: number,
    additionalData: Record<string, unknown>
  ) {
    const sourceColumnId = String(previous.columnId);
    const targetColumnId = targetColumn.id;
    const sourceSiblings = await this.activeTasks(tx, context, sourceColumnId, previous.id);
    const targetSiblings =
      sourceColumnId === targetColumnId
        ? sourceSiblings
        : await this.activeTasks(tx, context, targetColumnId, previous.id);
    const position = boundedPosition(requestedPosition, targetSiblings.length);
    const desiredCompletedAt = isDoneColumn(targetColumn)
      ? (previous.completedAt ?? new Date())
      : null;

    if (sourceColumnId === targetColumnId) {
      const ordered = [...targetSiblings];
      ordered.splice(position, 0, previous);
      const alreadyCanonical = ordered.every((task, index) =>
        task.id === previous.id
          ? numericPosition(previous) === index
          : numericPosition(task) === index
      );
      if (
        alreadyCanonical &&
        valuesEqual(previous.completedAt ?? null, desiredCompletedAt) &&
        !Object.keys(additionalData).length
      ) {
        return previous;
      }
      await this.persistPositions(tx.activityTask, context.companyId, ordered, 0, previous.id);
    } else {
      await this.persistPositions(tx.activityTask, context.companyId, sourceSiblings);
      const targetOrder = [...targetSiblings];
      targetOrder.splice(position, 0, previous);
      await this.persistPositions(tx.activityTask, context.companyId, targetOrder, 0, previous.id);
    }

    return tx.activityTask.update({
      where: { id: previous.id },
      data: {
        ...additionalData,
        columnId: targetColumnId,
        position,
        completedAt: desiredCompletedAt
      }
    });
  }

  private writeHistory(
    tx: TaskBoardTransaction,
    context: TaskBoardContext,
    type: string,
    data: Record<string, unknown>
  ) {
    return tx.activityTaskHistory.create({
      data: {
        ...data,
        companyId: context.companyId,
        activityId: context.activityId,
        actorUserId: context.actorUserId,
        type
      }
    });
  }
}
