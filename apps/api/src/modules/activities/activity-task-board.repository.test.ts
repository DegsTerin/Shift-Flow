// en-GB: Verifies task-board transaction ownership and ordering without a database runtime.
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn(),
  columnFindMany: vi.fn(),
  columnFindFirst: vi.fn(),
  columnCreate: vi.fn(),
  columnUpdate: vi.fn(),
  taskFindMany: vi.fn(),
  taskFindFirst: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  historyFindMany: vi.fn(),
  historyCreate: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getPrisma: vi.fn().mockResolvedValue({ $transaction: persistence.transaction })
}));

import { ActivityTaskBoardRepository } from "./activity-task-board.repository.js";
import { updateActivityTaskSchema } from "./activities.validators.js";

const context = {
  companyId: "c40e2a7b-72a8-4aca-a780-d6d239134d38",
  activityId: "93d913f9-d743-49ac-a814-33f32dbf9eb2",
  actorUserId: "0afec920-40f8-4018-80f8-f4ef386b3e52"
};

const columns = {
  todo: {
    id: "82efb855-67fd-447a-9c7b-57bd22c1e061",
    name: "To do",
    position: 0,
    createdAt: new Date(1)
  },
  doing: {
    id: "f5951f87-5bf6-4e95-9d48-f77740e9d11d",
    name: "Doing",
    position: 1,
    createdAt: new Date(2)
  },
  done: {
    id: "cab494bf-6287-45af-b770-8e88be929b28",
    name: "Done",
    position: 2,
    createdAt: new Date(3)
  }
};

const assigneeId = "70965bb0-c40a-4609-86e9-7ec2aac622f7";
const attachmentIds = [
  "29a6f168-0f63-4547-a7cd-689b88435a59",
  "73d7bc97-2f23-4236-a6b5-4989d022c137"
];
const missingAttachmentId = "b559ab55-16cb-42f7-a1df-d5805392daca";

function transactionClient() {
  return {
    $queryRawUnsafe: persistence.query,
    activityTaskColumn: {
      findMany: persistence.columnFindMany,
      findFirst: persistence.columnFindFirst,
      create: persistence.columnCreate,
      update: persistence.columnUpdate
    },
    activityTask: {
      findMany: persistence.taskFindMany,
      findFirst: persistence.taskFindFirst,
      create: persistence.taskCreate,
      update: persistence.taskUpdate
    },
    activityTaskHistory: {
      findMany: persistence.historyFindMany,
      create: persistence.historyCreate
    }
  };
}

describe("ActivityTaskBoardRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.query.mockResolvedValue([{ id: context.activityId }]);
    persistence.columnFindMany.mockResolvedValue([]);
    persistence.columnFindFirst.mockResolvedValue(columns.todo);
    persistence.columnCreate.mockResolvedValue({ id: "column-new", position: 0 });
    persistence.columnUpdate.mockImplementation(async ({ data }: { data: object }) => ({
      id: "column-updated",
      ...data
    }));
    persistence.taskFindMany.mockResolvedValue([]);
    persistence.taskFindFirst.mockResolvedValue({
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: null,
      completedAt: null,
      title: "Task"
    });
    persistence.taskCreate.mockImplementation(async ({ data }: { data: object }) => ({
      id: "task-new",
      ...data
    }));
    persistence.taskUpdate.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: object }) => ({
        id: where.id,
        ...data
      })
    );
    persistence.historyFindMany.mockResolvedValue([]);
    persistence.historyCreate.mockResolvedValue({ id: "history-1" });
    persistence.transaction.mockImplementation(
      async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
        callback(transactionClient())
    );
  });

  it("reads a board without invoking any write and uses deterministic tenant filters", async () => {
    persistence.columnFindMany.mockResolvedValue([columns.todo]);
    persistence.taskFindMany.mockResolvedValue([{ id: "archived-task" }]);

    const repository = new ActivityTaskBoardRepository();
    await expect(repository.read(context)).resolves.toEqual({
      columns: [columns.todo],
      archivedTasks: [{ id: "archived-task" }],
      archivedTasksTruncated: false,
      history: []
    });

    expect(persistence.columnFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: context.companyId, activityId: context.activityId, deletedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: expect.objectContaining({
          tasks: expect.objectContaining({
            where: {
              companyId: context.companyId,
              activityId: context.activityId,
              deletedAt: null,
              archivedAt: null
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }]
          })
        })
      })
    );
    expect(persistence.taskFindMany).toHaveBeenCalledWith({
      where: {
        companyId: context.companyId,
        activityId: context.activityId,
        deletedAt: null,
        archivedAt: { not: null }
      },
      orderBy: [{ archivedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 101,
      include: expect.any(Object)
    });
    expect(persistence.historyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: context.companyId, activityId: context.activityId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 40
      })
    );
    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.query.mock.calls[0][0]).toContain("FOR SHARE");
    expect(persistence.query.mock.calls[0].slice(1)).toEqual([
      context.activityId,
      context.companyId
    ]);
    expect(persistence.columnCreate).not.toHaveBeenCalled();
    expect(persistence.columnUpdate).not.toHaveBeenCalled();
    expect(persistence.taskCreate).not.toHaveBeenCalled();
    expect(persistence.taskUpdate).not.toHaveBeenCalled();
  });

  it("bounds the archived task window and reports truncation", async () => {
    persistence.taskFindMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({ id: `archived-${index}` }))
    );
    const repository = new ActivityTaskBoardRepository();

    const result = await repository.read(context);

    expect(result.archivedTasks).toHaveLength(100);
    expect(result.archivedTasksTruncated).toBe(true);
  });

  it("locks the active tenant activity before every board mutation", async () => {
    persistence.query.mockResolvedValue([]);
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.createColumn(context, { name: "Review" })).rejects.toMatchObject({
      statusCode: 404
    });

    const [query, activityId, companyId] = persistence.query.mock.calls[0];
    expect(query).toContain('FROM "activities"');
    expect(query).toContain('"deletedAt" IS NULL');
    expect(query).toContain("FOR UPDATE");
    expect(activityId).toBe(context.activityId);
    expect(companyId).toBe(context.companyId);
    expect(persistence.columnFindMany).not.toHaveBeenCalled();
    expect(persistence.columnCreate).not.toHaveBeenCalled();
  });

  it("inserts a column at a bounded position and shifts following columns in one transaction", async () => {
    persistence.columnFindMany.mockResolvedValue([columns.todo, columns.doing, columns.done]);
    persistence.columnCreate.mockResolvedValue({ id: "column-new", position: 1 });
    const repository = new ActivityTaskBoardRepository();

    await repository.createColumn(context, { name: "Triage", position: 1 });

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: columns.doing.id, companyId: context.companyId },
      data: { position: 2 }
    });
    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: columns.done.id, companyId: context.companyId },
      data: { position: 3 }
    });
    expect(persistence.columnCreate).toHaveBeenCalledWith({
      data: {
        name: "Triage",
        companyId: context.companyId,
        activityId: context.activityId,
        position: 1
      }
    });
  });

  it("rejects a new column when the board already has the maximum allowed", async () => {
    persistence.columnFindMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({ id: `column-${index}`, position: index }))
    );
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.createColumn(context, { name: "Overflow" })).rejects.toThrow(
      "more than 100 columns"
    );

    expect(persistence.columnUpdate).not.toHaveBeenCalled();
    expect(persistence.columnCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a subset", [columns.todo.id, columns.doing.id]],
    ["a duplicate", [columns.todo.id, columns.todo.id, columns.done.id]],
    ["an unknown identifier", [columns.todo.id, columns.doing.id, "column-x"]]
  ])("rejects %s instead of partially reordering columns", async (_case, columnIds) => {
    persistence.columnFindMany.mockResolvedValue([columns.todo, columns.doing, columns.done]);
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.reorderColumns(context, columnIds)).rejects.toMatchObject({
      statusCode: 400
    });

    expect(persistence.columnUpdate).not.toHaveBeenCalled();
  });

  it("persists a complete uppercase UUID permutation and returns its transactional board", async () => {
    const reorderedColumns = [
      { ...columns.done, position: 0 },
      { ...columns.todo, position: 1 },
      { ...columns.doing, position: 2 }
    ];
    persistence.columnFindMany
      .mockResolvedValueOnce([columns.todo, columns.doing, columns.done])
      .mockResolvedValueOnce(reorderedColumns);
    const repository = new ActivityTaskBoardRepository();

    await expect(
      repository.reorderColumns(context, [
        columns.done.id.toUpperCase(),
        columns.todo.id.toUpperCase(),
        columns.doing.id.toUpperCase()
      ])
    ).resolves.toEqual({
      columns: reorderedColumns,
      archivedTasks: [],
      archivedTasksTruncated: false,
      history: []
    });

    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: columns.done.id, companyId: context.companyId },
      data: { position: 0 }
    });
    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: columns.todo.id, companyId: context.companyId },
      data: { position: 1 }
    });
    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: columns.doing.id, companyId: context.companyId },
      data: { position: 2 }
    });
    expect(persistence.columnFindMany).toHaveBeenCalledTimes(2);
    expect(persistence.taskFindMany).toHaveBeenCalledOnce();
    expect(persistence.historyFindMany).toHaveBeenCalledOnce();
    expect(persistence.transaction).toHaveBeenCalledOnce();
  });

  it("rejects deleting a column that still owns an archived task", async () => {
    persistence.taskFindFirst.mockResolvedValue({ id: "archived-task", archivedAt: new Date() });
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.deleteColumn(context, columns.todo.id)).rejects.toThrow(
      "including archived tasks"
    );

    expect(persistence.columnUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes an empty column and compacts the remaining positions", async () => {
    persistence.taskFindFirst.mockResolvedValue(null);
    persistence.columnFindMany.mockResolvedValue([columns.todo, columns.doing, columns.done]);
    const repository = new ActivityTaskBoardRepository();

    await repository.deleteColumn(context, columns.todo.id);

    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: columns.todo.id },
      data: { deletedAt: expect.any(Date) }
    });
    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: columns.doing.id, companyId: context.companyId },
      data: { position: 0 }
    });
    expect(persistence.columnUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: columns.done.id, companyId: context.companyId },
      data: { position: 1 }
    });
    expect(persistence.columnUpdate).toHaveBeenCalledTimes(3);
  });

  it("rejects renaming a populated column across completion states", async () => {
    persistence.columnFindFirst.mockResolvedValue(columns.todo);
    persistence.taskFindFirst.mockResolvedValue({ id: "task-1" });
    const repository = new ActivityTaskBoardRepository();

    await expect(
      repository.updateColumn(context, columns.todo.id, { name: "Done" })
    ).rejects.toThrow("cannot be renamed across completion states");

    expect(persistence.columnUpdate).not.toHaveBeenCalled();
  });

  it("allows an empty column to change completion classification", async () => {
    persistence.columnFindFirst.mockResolvedValue(columns.todo);
    persistence.taskFindFirst.mockResolvedValue(null);
    const repository = new ActivityTaskBoardRepository();

    await repository.updateColumn(context, columns.todo.id, { name: "Done" });

    expect(persistence.columnUpdate).toHaveBeenCalledWith({
      where: { id: columns.todo.id },
      data: { name: "Done" }
    });
  });

  it("keeps a populated column within the same canonical completion classification", async () => {
    persistence.columnFindFirst.mockResolvedValue(columns.done);
    const repository = new ActivityTaskBoardRepository();

    await repository.updateColumn(context, columns.done.id, { name: "  done  " });

    expect(persistence.taskFindFirst).not.toHaveBeenCalled();
    expect(persistence.columnUpdate).toHaveBeenCalledWith({
      where: { id: columns.done.id },
      data: { name: "  done  " }
    });
  });

  it("completes a task created in a trimmed decomposed completion column", async () => {
    persistence.columnFindFirst.mockResolvedValue({
      ...columns.done,
      name: "  CONCLUI\u0301DO  "
    });
    const repository = new ActivityTaskBoardRepository();

    await repository.createTask(context, {
      columnId: columns.done.id,
      title: "Publish report"
    });

    expect(persistence.taskCreate).toHaveBeenCalledWith({
      data: {
        title: "Publish report",
        companyId: context.companyId,
        activityId: context.activityId,
        columnId: columns.done.id,
        position: 0,
        completedAt: expect.any(Date)
      }
    });
  });

  it("creates a task, locks its references and writes history through the same transaction", async () => {
    persistence.columnFindFirst.mockResolvedValue(columns.done);
    persistence.taskFindMany.mockResolvedValue([
      { id: "task-a", columnId: columns.done.id, position: 0 },
      { id: "task-b", columnId: columns.done.id, position: 1 }
    ]);
    persistence.query.mockImplementation(async (query: string, value: unknown) => {
      if (query.includes('FROM "attachments"')) {
        return (value as string[]).map((id) => ({ id }));
      }
      return [{ id: "locked" }];
    });
    const repository = new ActivityTaskBoardRepository();

    const result = await repository.createTask(context, {
      columnId: columns.done.id,
      title: "Publish report",
      assigneeId: assigneeId.toUpperCase(),
      attachmentIds: [attachmentIds[1].toUpperCase(), attachmentIds[0].toUpperCase()],
      position: 1
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "task-new",
        position: 1,
        completedAt: expect.any(Date)
      })
    );
    expect(persistence.taskUpdate).toHaveBeenCalledWith({
      where: { id: "task-b", companyId: context.companyId },
      data: { position: 2 }
    });
    expect(persistence.taskCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigneeId,
        attachmentIds: [attachmentIds[1], attachmentIds[0]]
      })
    });
    const [membershipQuery, membershipUserId, membershipCompanyId] =
      persistence.query.mock.calls[1];
    expect(membershipQuery).toContain('FROM "user_companies"');
    expect(membershipQuery).toContain('"userId" = $1::uuid');
    expect(membershipQuery).toContain('"companyId" = $2::uuid');
    expect(membershipQuery).toContain('"deletedAt" IS NULL');
    expect(membershipQuery).toContain("FOR SHARE");
    expect([membershipUserId, membershipCompanyId]).toEqual([assigneeId, context.companyId]);
    const [attachmentQuery, receivedAttachmentIds, attachmentCompanyId, attachmentActivityId] =
      persistence.query.mock.calls[2];
    expect(attachmentQuery).toContain('FROM "attachments"');
    expect(attachmentQuery).toContain('"id" = ANY($1::uuid[])');
    expect(attachmentQuery).toContain('"companyId" = $2::uuid');
    expect(attachmentQuery).toContain('"activityId" = $3::uuid');
    expect(attachmentQuery).toContain('"deletedAt" IS NULL');
    expect(attachmentQuery).toContain('ORDER BY "id" FOR SHARE');
    expect([attachmentCompanyId, attachmentActivityId]).toEqual([
      context.companyId,
      context.activityId
    ]);
    expect(receivedAttachmentIds).toEqual(attachmentIds);
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "CREATED",
        companyId: context.companyId,
        activityId: context.activityId,
        actorUserId: context.actorUserId,
        taskId: "task-new",
        toColumnId: columns.done.id,
        toPosition: 1
      })
    });
    expect(persistence.taskCreate.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.historyCreate.mock.invocationCallOrder[0]
    );
  });

  it("rejects an invalid attachment set before task or history writes", async () => {
    persistence.query.mockImplementation(async (query: string) =>
      query.includes('FROM "attachments"') ? [] : [{ id: "locked" }]
    );
    const repository = new ActivityTaskBoardRepository();

    await expect(
      repository.createTask(context, {
        columnId: columns.todo.id,
        title: "Task",
        attachmentIds: [missingAttachmentId]
      })
    ).rejects.toThrow("belong to this active activity");

    expect(persistence.taskCreate).not.toHaveBeenCalled();
    expect(persistence.taskUpdate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("accepts the real web edit shape without treating an unchanged column as a move", async () => {
    const dueAt = new Date("2026-08-30T15:00:00.000Z");
    persistence.taskFindFirst.mockResolvedValue({
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: null,
      completedAt: null,
      title: "Before",
      description: "Description",
      assigneeId,
      priority: "HIGH",
      dueAt,
      labels: ["incident", "owner"],
      attachmentIds: [attachmentIds[0]]
    });
    persistence.columnFindFirst.mockResolvedValue(columns.todo);
    const repository = new ActivityTaskBoardRepository();
    const webPayload = updateActivityTaskSchema.parse({
      columnId: columns.todo.id,
      title: "After",
      description: "Description",
      assigneeId,
      priority: "HIGH",
      dueAt: dueAt.toISOString(),
      labels: ["incident", "owner"],
      attachmentIds: [attachmentIds[0]]
    });

    await repository.updateTask(context, "task-1", webPayload);

    expect(persistence.taskFindMany).not.toHaveBeenCalled();
    expect(persistence.query).toHaveBeenCalledOnce();
    expect(persistence.taskUpdate).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { title: "After" }
    });
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "UPDATED", taskId: "task-1" })
    });
  });

  it("routes a changed web column through an atomic move to the target end", async () => {
    persistence.taskFindFirst.mockResolvedValue({
      id: "task-1",
      columnId: columns.todo.id,
      position: 1,
      archivedAt: null,
      completedAt: null,
      title: "Before"
    });
    persistence.columnFindFirst.mockResolvedValue(columns.done);
    persistence.taskFindMany
      .mockResolvedValueOnce([
        { id: "task-a", columnId: columns.todo.id, position: 0 },
        { id: "task-c", columnId: columns.todo.id, position: 2 }
      ])
      .mockResolvedValueOnce([{ id: "task-d", columnId: columns.done.id, position: 0 }]);
    const repository = new ActivityTaskBoardRepository();

    await repository.updateTask(context, "task-1", {
      columnId: columns.done.id,
      title: "After"
    });

    expect(persistence.taskUpdate).toHaveBeenCalledWith({
      where: { id: "task-c", companyId: context.companyId },
      data: { position: 1 }
    });
    expect(persistence.taskUpdate).toHaveBeenLastCalledWith({
      where: { id: "task-1" },
      data: {
        title: "After",
        columnId: columns.done.id,
        position: 1,
        completedAt: expect.any(Date)
      }
    });
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "MOVED",
        fromColumnId: columns.todo.id,
        toColumnId: columns.done.id,
        fromPosition: 1,
        toPosition: 1
      })
    });
  });

  it("does not write task or history for a canonical same-position move", async () => {
    const previous = {
      id: "task-1",
      columnId: columns.todo.id,
      position: 1,
      archivedAt: null,
      completedAt: null,
      title: "Task"
    };
    persistence.taskFindFirst.mockResolvedValue(previous);
    persistence.columnFindFirst.mockResolvedValue(columns.todo);
    persistence.taskFindMany.mockResolvedValue([
      { id: "task-a", columnId: columns.todo.id, position: 0 },
      { id: "task-c", columnId: columns.todo.id, position: 2 }
    ]);
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.moveTask(context, previous.id, columns.todo.id, 1)).resolves.toBe(
      previous
    );

    expect(persistence.taskUpdate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("compacts the source and inserts into the target before recording a cross-column move", async () => {
    persistence.taskFindFirst.mockResolvedValue({
      id: "task-1",
      columnId: columns.todo.id,
      position: 1,
      archivedAt: null,
      completedAt: null
    });
    persistence.columnFindFirst.mockResolvedValue(columns.doing);
    persistence.taskFindMany
      .mockResolvedValueOnce([
        { id: "task-a", columnId: columns.todo.id, position: 0 },
        { id: "task-c", columnId: columns.todo.id, position: 2 }
      ])
      .mockResolvedValueOnce([
        { id: "task-d", columnId: columns.doing.id, position: 0 },
        { id: "task-e", columnId: columns.doing.id, position: 1 }
      ]);
    const repository = new ActivityTaskBoardRepository();

    await repository.moveTask(context, "task-1", columns.doing.id, 1, "Operator move");

    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "task-c", companyId: context.companyId },
      data: { position: 1 }
    });
    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "task-e", companyId: context.companyId },
      data: { position: 2 }
    });
    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: "task-1" },
      data: {
        columnId: columns.doing.id,
        position: 1,
        completedAt: null
      }
    });
    expect(persistence.taskUpdate.mock.invocationCallOrder[2]).toBeLessThan(
      persistence.historyCreate.mock.invocationCallOrder[0]
    );
  });

  it("makes archive idempotent and records no duplicate evidence", async () => {
    const archived = {
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: new Date(),
      completedAt: null
    };
    persistence.taskFindFirst.mockResolvedValue(archived);
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.archiveTask(context, archived.id)).resolves.toBe(archived);

    expect(persistence.taskFindMany).not.toHaveBeenCalled();
    expect(persistence.taskUpdate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("deletes an active task, compacts its column and records lifecycle evidence", async () => {
    const active = {
      id: "task-1",
      columnId: columns.todo.id,
      position: 1,
      archivedAt: null,
      completedAt: null,
      title: "Delete me"
    };
    persistence.taskFindFirst.mockResolvedValue(active);
    persistence.taskFindMany.mockResolvedValue([
      { id: "task-a", columnId: columns.todo.id, position: 0 },
      { id: "task-c", columnId: columns.todo.id, position: 2 }
    ]);
    const repository = new ActivityTaskBoardRepository();

    await repository.deleteTask(context, active.id);

    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "task-c", companyId: context.companyId },
      data: { position: 1 }
    });
    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: active.id },
      data: { deletedAt: expect.any(Date) }
    });
    expect(persistence.taskUpdate).toHaveBeenCalledTimes(2);
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "DELETED",
        taskId: active.id,
        metadata: expect.objectContaining({
          before: expect.objectContaining({ id: active.id }),
          after: expect.objectContaining({ id: active.id, deletedAt: expect.any(String) })
        })
      })
    });
    expect(persistence.taskUpdate.mock.invocationCallOrder[1]).toBeLessThan(
      persistence.historyCreate.mock.invocationCallOrder[0]
    );
    expect(persistence.historyCreate).toHaveBeenCalledOnce();
  });

  it("archives an active task, compacts its column and records lifecycle evidence", async () => {
    const active = {
      id: "task-1",
      columnId: columns.todo.id,
      position: 1,
      archivedAt: null,
      completedAt: null,
      title: "Archive me"
    };
    persistence.taskFindFirst.mockResolvedValue(active);
    persistence.taskFindMany.mockResolvedValue([
      { id: "task-a", columnId: columns.todo.id, position: 0 },
      { id: "task-c", columnId: columns.todo.id, position: 2 }
    ]);
    const repository = new ActivityTaskBoardRepository();

    await repository.archiveTask(context, active.id);

    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "task-c", companyId: context.companyId },
      data: { position: 1 }
    });
    expect(persistence.taskUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: active.id },
      data: { archivedAt: expect.any(Date) }
    });
    expect(persistence.taskUpdate).toHaveBeenCalledTimes(2);
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "ARCHIVED",
        taskId: active.id,
        metadata: expect.objectContaining({
          before: expect.objectContaining({ id: active.id }),
          after: expect.objectContaining({ id: active.id, archivedAt: expect.any(String) })
        })
      })
    });
    expect(persistence.taskUpdate.mock.invocationCallOrder[1]).toBeLessThan(
      persistence.historyCreate.mock.invocationCallOrder[0]
    );
    expect(persistence.historyCreate).toHaveBeenCalledOnce();
  });

  it("makes restore idempotent for an already active task", async () => {
    const active = {
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: null,
      completedAt: null
    };
    persistence.taskFindFirst.mockResolvedValue(active);
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.restoreTask(context, active.id)).resolves.toBe(active);

    expect(persistence.query).toHaveBeenCalledOnce();
    expect(persistence.columnFindFirst).not.toHaveBeenCalled();
    expect(persistence.taskFindMany).not.toHaveBeenCalled();
    expect(persistence.taskUpdate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("rejects updating an archived task before reference or task writes", async () => {
    persistence.taskFindFirst.mockResolvedValue({
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: new Date("2026-08-27T12:00:00.000Z")
    });
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.updateTask(context, "task-1", { assigneeId })).rejects.toThrow(
      "Archived tasks cannot be updated"
    );

    expect(persistence.query).toHaveBeenCalledOnce();
    expect(persistence.columnFindFirst).not.toHaveBeenCalled();
    expect(persistence.taskUpdate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("rejects moving an archived task before column or task writes", async () => {
    persistence.taskFindFirst.mockResolvedValue({
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: new Date("2026-08-27T12:00:00.000Z")
    });
    const repository = new ActivityTaskBoardRepository();

    await expect(repository.moveTask(context, "task-1", columns.doing.id, 0)).rejects.toThrow(
      "Archived tasks cannot be moved"
    );

    expect(persistence.query).toHaveBeenCalledOnce();
    expect(persistence.columnFindFirst).not.toHaveBeenCalled();
    expect(persistence.taskFindMany).not.toHaveBeenCalled();
    expect(persistence.taskUpdate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("restores an archived task at the end with lifecycle evidence", async () => {
    const archived = {
      id: "task-1",
      columnId: columns.done.id,
      position: 0,
      archivedAt: new Date("2026-08-27T12:00:00.000Z"),
      completedAt: new Date("2026-08-27T11:00:00.000Z")
    };
    persistence.taskFindFirst.mockResolvedValue(archived);
    persistence.columnFindFirst.mockResolvedValue(columns.done);
    persistence.taskFindMany.mockResolvedValue([
      { id: "task-a", columnId: columns.done.id, position: 0 },
      { id: "task-b", columnId: columns.done.id, position: 1 }
    ]);
    const repository = new ActivityTaskBoardRepository();

    await repository.restoreTask(context, archived.id);

    expect(persistence.taskUpdate).toHaveBeenCalledWith({
      where: { id: archived.id },
      data: {
        archivedAt: null,
        columnId: columns.done.id,
        position: 2,
        completedAt: archived.completedAt
      }
    });
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "RESTORED",
        taskId: archived.id,
        fromColumnId: columns.done.id,
        toColumnId: columns.done.id,
        toPosition: 2
      })
    });
  });

  it("restores a legacy orphan into an explicit active destination", async () => {
    const archived = {
      id: "task-1",
      columnId: columns.todo.id,
      position: 0,
      archivedAt: new Date("2026-08-27T12:00:00.000Z"),
      completedAt: null
    };
    persistence.taskFindFirst.mockResolvedValue(archived);
    persistence.columnFindFirst.mockResolvedValue(columns.doing);
    persistence.taskFindMany.mockResolvedValue([]);
    const repository = new ActivityTaskBoardRepository();

    await repository.restoreTask(context, archived.id, columns.doing.id);

    expect(persistence.columnFindFirst).toHaveBeenCalledWith({
      where: {
        id: columns.doing.id,
        companyId: context.companyId,
        activityId: context.activityId,
        deletedAt: null
      }
    });
    expect(persistence.taskUpdate).toHaveBeenCalledWith({
      where: { id: archived.id },
      data: {
        archivedAt: null,
        columnId: columns.doing.id,
        position: 0,
        completedAt: null
      }
    });
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "RESTORED",
        fromColumnId: columns.todo.id,
        toColumnId: columns.doing.id
      })
    });
  });

  it("propagates a history failure from the task mutation transaction", async () => {
    persistence.historyCreate.mockRejectedValue(new Error("history unavailable"));
    const repository = new ActivityTaskBoardRepository();

    await expect(
      repository.createTask(context, { columnId: columns.todo.id, title: "Task" })
    ).rejects.toThrow("history unavailable");

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.taskCreate).toHaveBeenCalledOnce();
    expect(persistence.historyCreate).toHaveBeenCalledOnce();
  });
});
