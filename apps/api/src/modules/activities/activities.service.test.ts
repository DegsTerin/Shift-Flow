// en-GB: Exercises activity query and evidence shaping without a database runtime.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { DateRangeQuery } from "../../shared/services/date-range.service.js";
import type { ActivityTaskBoardRepository } from "./activity-task-board.repository.js";
import type { ActivitiesRepository } from "./activities.repository.js";

const scopeChecks = vi.hoisted(() => ({
  client: vi.fn().mockResolvedValue(undefined),
  shift: vi.fn().mockResolvedValue(undefined),
  team: vi.fn().mockResolvedValue(undefined),
  user: vi.fn().mockResolvedValue(undefined)
}));

const dateRanges = vi.hoisted(() => ({
  resolve: vi.fn()
}));

vi.mock("../../shared/services/scope.service.js", () => ({
  activeCompanyId: (req: ApiRequest) => req.auth?.companyId,
  assertClientInCompany: scopeChecks.client,
  assertShiftInCompany: scopeChecks.shift,
  assertTeamInCompany: scopeChecks.team,
  assertUserInCompany: scopeChecks.user
}));

vi.mock("../../shared/services/date-range.service.js", () => ({
  resolveDateRange: dateRanges.resolve
}));

import {
  ActivitiesService,
  activityHistoryDelta,
  activityHistorySnapshot
} from "./activities.service.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const calendarBounds: DateRangeQuery = {
  from: { kind: "calendar-date", value: "2026-08-01" },
  to: { kind: "calendar-date", value: "2026-08-31" }
};
const instantBounds: DateRangeQuery = {
  from: { kind: "instant", value: "2026-08-01T00:00:00.123Z" },
  to: { kind: "instant", value: "2026-08-31T23:59:59.987Z" }
};

beforeEach(() => {
  vi.clearAllMocks();
  dateRanges.resolve.mockResolvedValue(undefined);
});

function request(query: Record<string, unknown> = {}) {
  return { query, auth: { id: "user-1", email: "owner@example.com", companyId } } as ApiRequest;
}

function serviceWith(
  repository: Partial<ActivitiesRepository>,
  taskBoardRepository?: Partial<ActivityTaskBoardRepository>
) {
  return new ActivitiesService(
    repository as ActivitiesRepository,
    taskBoardRepository as ActivityTaskBoardRepository
  );
}

function evidencedRepository(previous: Record<string, unknown> = {}) {
  const captured: {
    createData?: Record<string, unknown>;
    taskColumns?: Array<{ name: string; color: string; position: number }>;
    mutationData?: Record<string, unknown>;
    evidence?: { audit: Record<string, unknown>; history: Record<string, unknown> };
  } = {};
  const createWithEvidence = vi.fn(
    async (
      data: Record<string, unknown>,
      evidenceFor: (created: Record<string, unknown>) => NonNullable<typeof captured.evidence>,
      taskColumns: Array<{ name: string; color: string; position: number }> = []
    ) => {
      captured.createData = data;
      captured.taskColumns = taskColumns;
      const created = { id: "activity-1", status: "PENDING", ...data };
      captured.evidence = evidenceFor(created);
      return created;
    }
  );
  const updateWithEvidence = vi.fn(
    async (
      _companyId: string,
      _id: string,
      planFor: (record: Record<string, unknown>) => {
        data: Record<string, unknown>;
        evidenceFor: (updated: Record<string, unknown>) => NonNullable<typeof captured.evidence>;
      }
    ) => {
      const current = { id: "activity-1", status: "PENDING", ...previous };
      const plan = planFor(current);
      captured.mutationData = plan.data;
      const updated = { ...current, ...plan.data };
      captured.evidence = plan.evidenceFor(updated);
      return updated;
    }
  );
  return {
    captured,
    repository: {
      findById: vi.fn().mockResolvedValue({ id: "activity-1", status: "PENDING", ...previous }),
      createWithEvidence,
      updateWithEvidence
    } as Partial<ActivitiesRepository>
  };
}

describe("ActivitiesService", () => {
  it("honours requested pagination and combines attention with explicit filters", async () => {
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.list(
      request({ page: "2", pageSize: "10", priority: "LOW", attention: "CRITICAL" })
    );

    expect(filteredList).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        priority: "LOW",
        AND: [{ priority: "CRITICAL" }]
      }),
      { page: 2, pageSize: 10 }
    );
  });

  it("preserves the legacy list window when pagination is omitted", async () => {
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.list(request());

    expect(filteredList).toHaveBeenCalledWith(expect.any(Object), { page: 1, pageSize: 100 });
  });

  it("passes authenticated civil bounds to the resolver and wires its exclusive range", async () => {
    const gte = new Date("2026-08-01T03:00:00.000Z");
    const lt = new Date("2026-09-01T03:00:00.000Z");
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0 });
    dateRanges.resolve.mockResolvedValueOnce({ gte, lt });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.list(request(calendarBounds));

    expect(dateRanges.resolve).toHaveBeenCalledWith(companyId, calendarBounds);
    expect(filteredList).toHaveBeenCalledWith(
      expect.objectContaining({ companyId, createdAt: { gte, lt } }),
      expect.any(Object)
    );
  });

  it("preserves inclusive explicit instants through the Kanban list path", async () => {
    const gte = new Date("2026-08-01T00:00:00.123Z");
    const lte = new Date("2026-08-31T23:59:59.987Z");
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0 });
    dateRanges.resolve.mockResolvedValueOnce({ gte, lte });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.kanban(request(instantBounds));

    expect(dateRanges.resolve).toHaveBeenCalledWith(companyId, instantBounds);
    expect(filteredList).toHaveBeenCalledWith(
      expect.objectContaining({ companyId, createdAt: { gte, lte } }),
      expect.any(Object)
    );
  });

  it("does not query activities when date-range resolution fails closed", async () => {
    const filteredList = vi.fn();
    dateRanges.resolve.mockRejectedValueOnce(new Error("timezone unavailable"));
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await expect(service.list(request(calendarBounds))).rejects.toThrow("timezone unavailable");

    expect(dateRanges.resolve).toHaveBeenCalledWith(companyId, calendarBounds);
    expect(filteredList).not.toHaveBeenCalled();
  });

  it("uses a public attachment projection for activity detail", async () => {
    const findById = vi.fn().mockResolvedValue({ id: "activity-1" });
    const service = serviceWith({ findById } as Partial<ActivitiesRepository>);

    await service.get(request(), "activity-1");

    expect(findById).toHaveBeenCalledWith(
      "activity-1",
      companyId,
      expect.objectContaining({
        comments: expect.objectContaining({
          include: { author: expect.any(Object) }
        }),
        attachments: expect.objectContaining({
          where: { deletedAt: null },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            byteSize: true,
            createdAt: true
          }
        })
      }),
      true
    );
  });

  it("keeps a legacy empty task board read-only", async () => {
    const read = vi.fn().mockResolvedValue({ columns: [], archivedTasks: [], history: [] });
    const service = serviceWith({}, { read });

    await expect(service.taskBoard(request(), "activity-1")).resolves.toEqual({
      columns: [],
      archivedTasks: [],
      history: []
    });

    expect(read).toHaveBeenCalledWith({
      companyId,
      activityId: "activity-1",
      actorUserId: "user-1"
    });
  });

  it("returns the transactional reorder result without a post-commit board read", async () => {
    const reordered = { columns: [{ id: "column-2" }, { id: "column-1" }], history: [] };
    const reorderColumns = vi.fn().mockResolvedValue(reordered);
    const read = vi.fn().mockRejectedValue(new Error("unexpected reread"));
    const service = serviceWith({}, { reorderColumns, read });

    await expect(
      service.reorderTaskColumns(request(), "activity-1", ["column-2", "column-1"])
    ).resolves.toBe(reordered);

    expect(reorderColumns).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it("propagates a validated close note to the lifecycle command", async () => {
    const service = serviceWith({} as Partial<ActivitiesRepository>);
    const move = vi.spyOn(service, "move").mockResolvedValue({ id: "activity-1" });

    await service.close(request(), "activity-1", "Closed after owner verification");

    expect(move).toHaveBeenCalledWith(
      expect.any(Object),
      "activity-1",
      "DONE",
      "Closed after owner verification"
    );
  });

  it("creates the activity and both evidence records through one aggregate command", async () => {
    const { captured, repository } = evidencedRepository();
    const service = serviceWith(repository);

    await service.create(request(), {
      clientId: "client-1",
      teamId: "team-1",
      title: "Incident",
      status: "IN_PROGRESS"
    });

    expect(captured.createData).toEqual(
      expect.objectContaining({
        companyId,
        reporterId: "user-1",
        createdById: "user-1",
        updatedById: "user-1",
        status: "IN_PROGRESS",
        startedAt: expect.any(Date),
        completedAt: null
      })
    );
    expect(captured.evidence).toEqual(
      expect.objectContaining({
        audit: expect.objectContaining({
          entityType: "Activity",
          entityId: "activity-1",
          action: "CREATE",
          activityId: "activity-1"
        }),
        history: expect.objectContaining({
          activityId: "activity-1",
          type: "CREATED",
          actorUserId: "user-1"
        })
      })
    );
    expect(captured.taskColumns).toEqual([
      { name: "A Fazer", color: "#64748b", position: 0 },
      { name: "Em Andamento", color: "#0ea5e9", position: 1 },
      { name: "Revisao", color: "#f59e0b", position: 2 },
      { name: "Concluido", color: "#16a34a", position: 3 }
    ]);
  });

  it("normalises a generic status update into closed lifecycle evidence", async () => {
    const { captured, repository } = evidencedRepository({ title: "Before" });
    const service = serviceWith(repository);

    await service.update(request(), "activity-1", { title: "After", status: "DONE" });

    expect(captured.mutationData).toEqual(
      expect.objectContaining({
        title: "After",
        status: "DONE",
        completedAt: expect.any(Date),
        updatedById: "user-1"
      })
    );
    expect(captured.evidence).toEqual(
      expect.objectContaining({
        audit: expect.objectContaining({ action: "UPDATE" }),
        history: expect.objectContaining({
          type: "CLOSED",
          fromStatus: "PENDING",
          toStatus: "DONE",
          metadata: expect.objectContaining({
            before: expect.objectContaining({ title: "Before", status: "PENDING" }),
            after: expect.objectContaining({ title: "After", status: "DONE" })
          })
        })
      })
    );
  });

  it("keeps unchanged modal lifecycle fields stable during an ordinary edit", async () => {
    vi.clearAllMocks();
    const { captured, repository } = evidencedRepository({
      title: "Before",
      status: "PENDING",
      assigneeId: "assignee-1",
      startedAt: null,
      completedAt: null
    });
    const service = serviceWith(repository);

    await service.update(request(), "activity-1", {
      title: "After",
      status: "PENDING",
      assigneeId: "assignee-1"
    });

    expect(captured.mutationData).toEqual(
      expect.objectContaining({
        title: "After",
        status: "PENDING",
        assigneeId: "assignee-1",
        updatedById: "user-1"
      })
    );
    expect(captured.mutationData).not.toHaveProperty("startedAt");
    expect(captured.mutationData).not.toHaveProperty("completedAt");
    expect(captured.evidence?.history).toEqual(
      expect.objectContaining({
        type: "UPDATED",
        metadata: expect.objectContaining({
          before: expect.objectContaining({ title: "Before" }),
          after: expect.objectContaining({ title: "After" })
        })
      })
    );
    const metadata = captured.evidence?.history.metadata as {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    };
    expect(metadata.before).not.toHaveProperty("status");
    expect(metadata.after).not.toHaveProperty("status");
    expect(metadata.before).not.toHaveProperty("assigneeId");
    expect(metadata.after).not.toHaveProperty("assigneeId");
    expect(scopeChecks.client).not.toHaveBeenCalled();
    expect(scopeChecks.team).not.toHaveBeenCalled();
    expect(scopeChecks.shift).not.toHaveBeenCalled();
    expect(scopeChecks.user).not.toHaveBeenCalled();
  });

  it("preserves explicit nullable Activity clears in the evidenced mutation plan", async () => {
    vi.clearAllMocks();
    const { captured, repository } = evidencedRepository({
      title: "Before",
      status: "PENDING",
      shiftId: "shift-1",
      assigneeId: "assignee-1",
      slaDueAt: new Date("2026-08-30T12:00:00.000Z")
    });
    const service = serviceWith(repository);

    await service.update(request(), "activity-1", {
      shiftId: null,
      assigneeId: null,
      slaDueAt: null
    });

    expect(captured.mutationData).toEqual(
      expect.objectContaining({
        shiftId: null,
        assigneeId: null,
        slaDueAt: null,
        updatedById: "user-1"
      })
    );
    expect(scopeChecks.shift).not.toHaveBeenCalled();
    expect(scopeChecks.user).not.toHaveBeenCalled();
  });

  it("preserves not-found precedence before validating update references", async () => {
    vi.clearAllMocks();
    const findById = vi.fn().mockResolvedValue(null);
    const updateWithEvidence = vi.fn();
    const service = serviceWith({ findById, updateWithEvidence });

    await expect(
      service.update(request(), "missing-activity", {
        clientId: "missing-client",
        teamId: "missing-team"
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(findById).toHaveBeenCalledWith("missing-activity", companyId, undefined, true);
    expect(scopeChecks.client).not.toHaveBeenCalled();
    expect(scopeChecks.team).not.toHaveBeenCalled();
    expect(scopeChecks.shift).not.toHaveBeenCalled();
    expect(scopeChecks.user).not.toHaveBeenCalled();
    expect(updateWithEvidence).not.toHaveBeenCalled();
  });

  it("soft-deletes with audit and history evidence in the aggregate plan", async () => {
    const { captured, repository } = evidencedRepository({ title: "Incident" });
    const service = serviceWith(repository);

    await service.remove(request(), "activity-1");

    expect(captured.mutationData).toEqual(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedById: "user-1",
        updatedById: "user-1"
      })
    );
    expect(captured.evidence).toEqual(
      expect.objectContaining({
        audit: expect.objectContaining({ action: "SOFT_DELETE" }),
        history: expect.objectContaining({
          type: "SOFT_DELETED",
          note: "Soft deleted",
          metadata: expect.objectContaining({ action: "SOFT_DELETE" })
        })
      })
    );
  });

  it("moves and assigns through evidenced aggregate plans", async () => {
    const moved = evidencedRepository();
    const moveService = serviceWith(moved.repository);

    await moveService.move(request(), "activity-1", "IN_PROGRESS", "Started by operator");

    expect(moved.captured.mutationData).toEqual(
      expect.objectContaining({
        status: "IN_PROGRESS",
        startedAt: expect.any(Date),
        completedAt: null
      })
    );
    expect(moved.captured.evidence?.history).toEqual(
      expect.objectContaining({
        type: "STATUS_CHANGED",
        fromStatus: "PENDING",
        toStatus: "IN_PROGRESS",
        note: "Started by operator"
      })
    );

    const assigned = evidencedRepository();
    const assignService = serviceWith(assigned.repository);
    await assignService.assign(request(), "activity-1", "assignee-1", "Owner selected");

    expect(assigned.captured.mutationData).toEqual(
      expect.objectContaining({ assigneeId: "assignee-1", updatedById: "user-1" })
    );
    expect(assigned.captured.evidence?.history).toEqual(
      expect.objectContaining({ type: "ASSIGNED", note: "Owner selected" })
    );
  });

  it("rejects a repeated assignee command before planning mutation evidence", async () => {
    vi.clearAllMocks();
    const repeated = evidencedRepository({ assigneeId: "assignee-1" });
    const service = serviceWith(repeated.repository);

    await expect(
      service.assign(request(), "activity-1", "assignee-1", "Duplicate assignment")
    ).rejects.toThrow("Activity already has the requested assignee");

    expect(repeated.captured.mutationData).toBeUndefined();
    expect(repeated.captured.evidence).toBeUndefined();
    expect(scopeChecks.user).not.toHaveBeenCalled();
  });

  it("rejects a repeated status command before planning mutation evidence", async () => {
    const repeated = evidencedRepository({ status: "IN_PROGRESS" });
    const service = serviceWith(repeated.repository);

    await expect(service.move(request(), "activity-1", "IN_PROGRESS")).rejects.toThrow(
      "Activity is already in the requested status"
    );

    expect(repeated.captured.mutationData).toBeUndefined();
    expect(repeated.captured.evidence).toBeUndefined();
  });

  it("reopens only from terminal state inside the aggregate plan", async () => {
    const reopened = evidencedRepository({ status: "DONE", completedAt: new Date() });
    const service = serviceWith(reopened.repository);

    await service.reopen(request(), "activity-1", "Reopened after review");

    expect(reopened.captured.mutationData).toEqual(
      expect.objectContaining({
        status: "PENDING",
        completedAt: null,
        startedAt: null,
        updatedById: "user-1"
      })
    );
    expect(reopened.captured.evidence?.history).toEqual(
      expect.objectContaining({
        type: "REOPENED",
        fromStatus: "DONE",
        toStatus: "PENDING",
        note: "Reopened after review"
      })
    );

    const invalid = evidencedRepository({ status: "IN_PROGRESS" });
    await expect(serviceWith(invalid.repository).reopen(request(), "activity-1")).rejects.toThrow(
      "Only completed or cancelled activities can be reopened"
    );
    expect(invalid.captured.mutationData).toBeUndefined();
    expect(invalid.captured.evidence).toBeUndefined();
  });
});

describe("activity history shaping", () => {
  it("keeps only scalar allowlisted fields and makes them JSON-safe", () => {
    const snapshot = activityHistorySnapshot({
      id: "activity-1",
      title: "Incident",
      updatedAt: new Date("2026-08-27T12:00:00.000Z"),
      comments: [{ body: "must not be copied" }],
      attachments: [{ byteSize: 99n }],
      history: [{ metadata: { history: ["recursive"] } }]
    });

    expect(snapshot).toEqual({
      id: "activity-1",
      title: "Incident",
      updatedAt: "2026-08-27T12:00:00.000Z"
    });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("records only fields that actually changed", () => {
    expect(
      activityHistoryDelta(
        { id: "activity-1", title: "Before", status: "PENDING", comments: ["ignored"] },
        { id: "activity-1", title: "After", status: "PENDING", history: ["ignored"] }
      )
    ).toEqual({
      before: { title: "Before" },
      after: { title: "After" }
    });
  });
});
