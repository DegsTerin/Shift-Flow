// en-GB: Implements activities rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest, notFound } from "../../shared/errors/app-error.js";
import { toPagination } from "../../shared/http/pagination.js";
import { BaseService } from "../../shared/services/base.service.js";
import {
  activeCompanyId,
  assertClientInCompany,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { ActivitiesRepository } from "./activities.repository.js";

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
};

const publicAttachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  createdAt: true
};

const activityInclude = {
  client: true,
  team: true,
  shift: true,
  assignee: { select: publicUserSelect },
  reporter: { select: publicUserSelect },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { author: { select: publicUserSelect } }
  },
  attachments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: publicAttachmentSelect
  },
  history: {
    orderBy: { createdAt: "desc" },
    include: { actor: { select: publicUserSelect } }
  }
};

const defaultTaskColumns = [
  { name: "A Fazer", color: "#64748b", position: 0 },
  { name: "Em Andamento", color: "#0ea5e9", position: 1 },
  { name: "Revisao", color: "#f59e0b", position: 2 },
  { name: "Concluido", color: "#16a34a", position: 3 }
];

const taskInclude = {
  assignee: { select: publicUserSelect }
};

const activitySnapshotFields = [
  "id",
  "companyId",
  "clientId",
  "teamId",
  "shiftId",
  "assigneeId",
  "reporterId",
  "title",
  "description",
  "requested",
  "performed",
  "inProgressDetail",
  "pendingDetail",
  "finalizationDetail",
  "observations",
  "systemName",
  "serviceName",
  "status",
  "priority",
  "slaDueAt",
  "startedAt",
  "completedAt",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "createdById",
  "updatedById",
  "deletedById"
] as const;

function historyScalar(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function activityHistorySnapshot(value: unknown) {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    activitySnapshotFields
      .filter((field) => Object.hasOwn(record, field))
      .map((field) => [field, historyScalar(record[field])])
  );
}

export function activityHistoryDelta(before: unknown, after: unknown) {
  const beforeSnapshot = activityHistorySnapshot(before);
  const afterSnapshot = activityHistorySnapshot(after);
  const changedFields = new Set(
    [...Object.keys(beforeSnapshot), ...Object.keys(afterSnapshot)].filter(
      (field) => JSON.stringify(beforeSnapshot[field]) !== JSON.stringify(afterSnapshot[field])
    )
  );
  return {
    before: Object.fromEntries(
      Object.entries(beforeSnapshot).filter(([field]) => changedFields.has(field))
    ),
    after: Object.fromEntries(
      Object.entries(afterSnapshot).filter(([field]) => changedFields.has(field))
    )
  };
}

export class ActivitiesService extends BaseService {
  private readonly activitiesRepository: ActivitiesRepository;

  constructor(repository = new ActivitiesRepository()) {
    super(repository, "Activity", { userStamps: true });
    this.activitiesRepository = repository;
  }

  override async list(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    const pagination = toPagination({
      ...query,
      pageSize: query.pageSize ?? 100
    });
    return this.activitiesRepository.filteredList(this.activityWhere(req), pagination);
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.activitiesRepository.findById(
      id,
      this.companyId(req),
      activityInclude,
      true
    );
    if (!item) {
      throw notFound("Activity not found");
    }
    return item;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    await this.assertScopedReferences(req, data);
    const created = await super.create(req, {
      ...data,
      reporterId: data.reporterId ?? req.auth?.id
    });
    await this.history(req, String((created as { id: string }).id), "CREATED", {});
    return created;
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const previous = (await this.get(req, id)) as { status?: string };
    await this.assertScopedReferences(req, data);
    if (data.status) {
      this.assertStatusTransition(previous.status, String(data.status));
    }
    const updated = await super.update(req, id, data);
    await this.history(req, id, "UPDATED", {
      metadata: activityHistoryDelta(previous, updated)
    });
    return updated;
  }

  override async remove(req: ApiRequest, id: string) {
    const previous = await this.get(req, id);
    const removed = await super.remove(req, id);
    await this.history(req, id, "SOFT_DELETED", {
      note: "Soft deleted",
      metadata: { ...activityHistoryDelta(previous, removed), action: "SOFT_DELETE" }
    });
    return removed;
  }

  async move(req: ApiRequest, id: string, status: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string; priority?: string };
    this.assertStatusTransition(previous.status, status);
    const updated = await super.update(req, id, {
      status,
      ...(status === "DONE" ? { completedAt: new Date() } : {}),
      ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
      ...(status !== "DONE" ? { completedAt: null } : {})
    });
    await this.history(req, id, status === "DONE" ? "CLOSED" : "STATUS_CHANGED", {
      fromStatus: previous.status,
      toStatus: status,
      note
    });
    return updated;
  }

  async assign(req: ApiRequest, id: string, assigneeId: string | null, note?: string) {
    await assertUserInCompany(assigneeId, activeCompanyId(req));
    const updated = await super.update(req, id, { assigneeId });
    await this.history(req, id, assigneeId ? "ASSIGNED" : "UNASSIGNED", { note });
    return updated;
  }

  async close(req: ApiRequest, id: string, note?: string) {
    return this.move(req, id, "DONE", note ?? "Closed from API");
  }

  async reopen(req: ApiRequest, id: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string };
    if (previous.status !== "DONE" && previous.status !== "CANCELLED") {
      throw badRequest("Only completed or cancelled activities can be reopened");
    }
    const updated = await super.update(req, id, {
      status: "PENDING",
      completedAt: null,
      startedAt: null
    });
    await this.history(req, id, "REOPENED", {
      fromStatus: previous.status,
      toStatus: "PENDING",
      note: note ?? "Reopened from API"
    });
    return updated;
  }

  async kanban(req: ApiRequest) {
    return this.list(req);
  }

  async taskBoard(req: ApiRequest, activityId: string) {
    await this.get(req, activityId);
    await this.ensureTaskColumns(req, activityId);
    const companyId = this.companyId(req);
    const columns = await (
      await this.activitiesRepository.taskColumns()
    ).findMany({
      where: { companyId, activityId, deletedAt: null },
      orderBy: { position: "asc" },
      include: {
        tasks: {
          where: { deletedAt: null, archivedAt: null },
          orderBy: { position: "asc" },
          include: taskInclude
        }
      }
    });
    const history = await (
      await this.activitiesRepository.taskHistory()
    ).findMany({
      where: { companyId, activityId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: publicUserSelect } }
    });
    return { columns, history };
  }

  async createTaskColumn(req: ApiRequest, activityId: string, data: Record<string, unknown>) {
    await this.get(req, activityId);
    const companyId = this.companyId(req);
    const position =
      typeof data.position === "number"
        ? data.position
        : (
            await (
              await this.activitiesRepository.taskColumns()
            ).findMany({
              where: { companyId, activityId, deletedAt: null }
            })
          ).length;
    const created = await (
      await this.activitiesRepository.taskColumns()
    ).create({
      data: { ...data, activityId, companyId, position }
    });
    return created;
  }

  async updateTaskColumn(
    req: ApiRequest,
    activityId: string,
    columnId: string,
    data: Record<string, unknown>
  ) {
    await this.assertTaskColumn(req, activityId, columnId);
    return (await this.activitiesRepository.taskColumns()).update({
      where: { id: columnId },
      data
    });
  }

  async deleteTaskColumn(req: ApiRequest, activityId: string, columnId: string) {
    const column = await this.assertTaskColumn(req, activityId, columnId);
    const taskCount = (
      await (
        await this.activitiesRepository.tasks()
      ).findMany({
        where: { columnId, deletedAt: null, archivedAt: null }
      })
    ).length;
    if (taskCount > 0) {
      throw badRequest("Task columns with active tasks cannot be deleted");
    }
    return (await this.activitiesRepository.taskColumns()).update({
      where: { id: (column as { id: string }).id },
      data: { deletedAt: new Date() }
    });
  }

  async reorderTaskColumns(req: ApiRequest, activityId: string, columnIds: string[]) {
    await this.get(req, activityId);
    const companyId = this.companyId(req);
    const columns = await (
      await this.activitiesRepository.taskColumns()
    ).findMany({
      where: { companyId, activityId, deletedAt: null }
    });
    const existingIds = new Set(columns.map((column) => column.id));
    if (columnIds.some((columnId) => !existingIds.has(columnId))) {
      throw badRequest("Column order contains invalid columns");
    }
    await Promise.all(
      columnIds.map((columnId, position) =>
        (async () =>
          (await this.activitiesRepository.taskColumns()).update({
            where: { id: columnId },
            data: { position }
          }))()
      )
    );
    return this.taskBoard(req, activityId);
  }

  async createTask(req: ApiRequest, activityId: string, data: Record<string, unknown>) {
    await this.assertTaskColumn(req, activityId, String(data.columnId));
    await assertUserInCompany(
      data.assigneeId ? String(data.assigneeId) : undefined,
      activeCompanyId(req)
    );
    const companyId = this.companyId(req);
    const position =
      typeof data.position === "number"
        ? data.position
        : (
            await (
              await this.activitiesRepository.tasks()
            ).findMany({
              where: {
                companyId,
                activityId,
                columnId: String(data.columnId),
                deletedAt: null,
                archivedAt: null
              }
            })
          ).length;
    const created = await (
      await this.activitiesRepository.tasks()
    ).create({
      data: { ...data, activityId, companyId, position }
    });
    await this.taskHistory(req, activityId, "CREATED", {
      taskId: String((created as { id: string }).id),
      toColumnId: String(data.columnId),
      toPosition: position,
      metadata: { after: created }
    });
    return created;
  }

  async updateTask(
    req: ApiRequest,
    activityId: string,
    taskId: string,
    data: Record<string, unknown>
  ) {
    await this.assertTask(req, activityId, taskId);
    if (data.columnId) {
      await this.assertTaskColumn(req, activityId, String(data.columnId));
    }
    await assertUserInCompany(
      data.assigneeId ? String(data.assigneeId) : undefined,
      activeCompanyId(req)
    );
    const updated = await (
      await this.activitiesRepository.tasks()
    ).update({
      where: { id: taskId },
      data
    });
    await this.taskHistory(req, activityId, "UPDATED", {
      taskId,
      metadata: { after: updated }
    });
    return updated;
  }

  async deleteTask(req: ApiRequest, activityId: string, taskId: string) {
    await this.assertTask(req, activityId, taskId);
    const deleted = await (
      await this.activitiesRepository.tasks()
    ).update({
      where: { id: taskId },
      data: { deletedAt: new Date() }
    });
    await this.taskHistory(req, activityId, "DELETED", { taskId, metadata: { after: deleted } });
    return deleted;
  }

  async archiveTask(req: ApiRequest, activityId: string, taskId: string) {
    const task = await this.assertTask(req, activityId, taskId);
    const nextArchivedAt = (task as { archivedAt?: Date | null }).archivedAt ? null : new Date();
    const archived = await (
      await this.activitiesRepository.tasks()
    ).update({
      where: { id: taskId },
      data: { archivedAt: nextArchivedAt }
    });
    await this.taskHistory(req, activityId, nextArchivedAt ? "ARCHIVED" : "RESTORED", {
      taskId,
      metadata: { after: archived }
    });
    return archived;
  }

  async moveTask(
    req: ApiRequest,
    activityId: string,
    taskId: string,
    columnId: string,
    position: number,
    note?: string
  ) {
    const previous = await this.assertTask(req, activityId, taskId);
    const targetColumn = await this.assertTaskColumn(req, activityId, columnId);
    const companyId = this.companyId(req);
    const siblings = await (
      await this.activitiesRepository.tasks()
    ).findMany({
      where: {
        companyId,
        activityId,
        columnId,
        deletedAt: null,
        archivedAt: null,
        NOT: { id: taskId }
      },
      orderBy: { position: "asc" }
    });
    const boundedPosition = Math.max(0, Math.min(position, siblings.length));
    await Promise.all(
      siblings.map((task, index) =>
        (async () =>
          (await this.activitiesRepository.tasks()).update({
            where: { id: task.id },
            data: { position: index >= boundedPosition ? index + 1 : index }
          }))()
      )
    );
    const moved = await (
      await this.activitiesRepository.tasks()
    ).update({
      where: { id: taskId },
      data: {
        columnId,
        position: boundedPosition,
        completedAt: this.isDoneColumn(targetColumn.name) ? new Date() : null
      }
    });
    await this.taskHistory(req, activityId, "MOVED", {
      taskId,
      fromColumnId: (previous as { columnId: string }).columnId,
      toColumnId: columnId,
      fromPosition: (previous as { position: number }).position,
      toPosition: boundedPosition,
      note
    });
    return moved;
  }

  private async history(
    req: ApiRequest,
    activityId: string,
    type: string,
    data: Record<string, unknown>
  ) {
    await this.activitiesRepository.addHistory({
      ...data,
      activityId,
      type,
      companyId: this.companyId(req),
      actorUserId: req.auth?.id
    });
  }

  private async taskHistory(
    req: ApiRequest,
    activityId: string,
    type: string,
    data: Record<string, unknown>
  ) {
    await (
      await this.activitiesRepository.taskHistory()
    ).create({
      data: {
        ...data,
        activityId,
        type,
        companyId: this.companyId(req),
        actorUserId: req.auth?.id
      }
    });
  }

  private async ensureTaskColumns(req: ApiRequest, activityId: string) {
    const companyId = this.companyId(req);
    const columns = await (
      await this.activitiesRepository.taskColumns()
    ).findMany({
      where: { companyId, activityId, deletedAt: null }
    });
    if (columns.length) return;
    await (
      await this.activitiesRepository.taskColumns()
    ).createMany({
      data: defaultTaskColumns.map((column) => ({ ...column, activityId, companyId }))
    });
  }

  private async assertTaskColumn(req: ApiRequest, activityId: string, columnId: string) {
    await this.get(req, activityId);
    const column = await (
      await this.activitiesRepository.taskColumns()
    ).findFirst({
      where: { id: columnId, activityId, companyId: this.companyId(req), deletedAt: null }
    });
    if (!column) {
      throw badRequest("Task column does not belong to this activity");
    }
    return column;
  }

  private async assertTask(req: ApiRequest, activityId: string, taskId: string) {
    await this.get(req, activityId);
    const task = await (
      await this.activitiesRepository.tasks()
    ).findFirst({
      where: { id: taskId, activityId, companyId: this.companyId(req), deletedAt: null }
    });
    if (!task) {
      throw badRequest("Task does not belong to this activity");
    }
    return task;
  }

  private isDoneColumn(columnName: string | undefined) {
    return ["concluido", "concluído", "done"].includes((columnName ?? "").toLowerCase());
  }

  private async assertScopedReferences(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertClientInCompany(data.clientId ? String(data.clientId) : undefined, companyId),
      assertTeamInCompany(data.teamId ? String(data.teamId) : undefined, companyId),
      assertShiftInCompany(data.shiftId ? String(data.shiftId) : undefined, companyId),
      assertUserInCompany(data.assigneeId ? String(data.assigneeId) : undefined, companyId),
      assertUserInCompany(data.reporterId ? String(data.reporterId) : req.auth?.id, companyId)
    ]);
  }

  private assertStatusTransition(from: string | undefined, to: string) {
    const allowed: Record<string, string[]> = {
      PENDING: [
        "IN_PROGRESS",
        "WAITING_CUSTOMER",
        "WAITING_THIRD_PARTY",
        "MONITORING",
        "DONE",
        "CANCELLED"
      ],
      IN_PROGRESS: [
        "PENDING",
        "WAITING_CUSTOMER",
        "WAITING_THIRD_PARTY",
        "MONITORING",
        "DONE",
        "CANCELLED"
      ],
      WAITING_CUSTOMER: ["PENDING", "IN_PROGRESS", "MONITORING", "DONE", "CANCELLED"],
      WAITING_THIRD_PARTY: ["PENDING", "IN_PROGRESS", "MONITORING", "DONE", "CANCELLED"],
      MONITORING: ["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"],
      DONE: [],
      CANCELLED: []
    };
    if (from && from !== to && !(allowed[from] ?? []).includes(to)) {
      throw badRequest("Activity cannot move to the requested status from its current status");
    }
  }

  private activityWhere(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    const search = query.search ? String(query.search).trim() : "";
    const now = new Date();
    const uuidSearch =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    return {
      companyId: activeCompanyId(req),
      deletedAt: null,
      ...(query.clientId ? { clientId: String(query.clientId) } : {}),
      ...(query.teamId ? { teamId: String(query.teamId) } : {}),
      ...(query.shiftId ? { shiftId: String(query.shiftId) } : {}),
      ...(query.assigneeId ? { assigneeId: String(query.assigneeId) } : {}),
      ...(query.priority ? { priority: String(query.priority) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
      ...(query.attention === "OVERDUE"
        ? { AND: [{ status: { notIn: ["DONE", "CANCELLED"] }, slaDueAt: { lt: now } }] }
        : {}),
      ...(query.attention === "SLA_RISK"
        ? {
            AND: [
              {
                status: { notIn: ["DONE", "CANCELLED"] },
                slaDueAt: { gte: now, lte: new Date(now.getTime() + 60 * 60 * 1000) }
              }
            ]
          }
        : {}),
      ...(query.attention === "CRITICAL" ? { AND: [{ priority: "CRITICAL" }] } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from
                ? { gte: query.from instanceof Date ? query.from : new Date(String(query.from)) }
                : {}),
              ...(query.to
                ? { lte: query.to instanceof Date ? query.to : new Date(String(query.to)) }
                : {})
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              ...(uuidSearch ? [{ id: search }] : []),
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { systemName: { contains: search, mode: "insensitive" } },
              { serviceName: { contains: search, mode: "insensitive" } },
              { client: { name: { contains: search, mode: "insensitive" } } },
              { team: { name: { contains: search, mode: "insensitive" } } },
              { assignee: { displayName: { contains: search, mode: "insensitive" } } },
              { assignee: { email: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
  }
}
