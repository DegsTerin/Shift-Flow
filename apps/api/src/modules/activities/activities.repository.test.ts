// en-GB: Verifies activity query persistence and atomic evidence commands without a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  getDelegate: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  activityFindFirst: vi.fn(),
  activityCreate: vi.fn(),
  activityUpdate: vi.fn(),
  taskColumnCreateMany: vi.fn(),
  auditCreate: vi.fn(),
  historyCreate: vi.fn(),
  lockActivity: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: persistence.getDelegate,
  getPrisma: vi.fn().mockResolvedValue({ $transaction: persistence.transaction })
}));

import { ActivitiesRepository } from "./activities.repository.js";

const validCreateData = {
  companyId: "company-1",
  clientId: "client-1",
  teamId: "team-1",
  reporterId: "user-a",
  title: "Incident"
};

function expectReferenceLock(
  callIndex: number,
  table: string,
  identifierColumn: string,
  identifier: string
) {
  const [query, receivedIdentifier, companyId] = persistence.lockActivity.mock.calls[callIndex];
  expect(query).toContain(`FROM "${table}"`);
  expect(query).toContain(`"${identifierColumn}" = $1::uuid`);
  expect(query).toContain('"companyId" = $2::uuid');
  expect(query).toContain('"deletedAt" IS NULL');
  expect(query).toContain("FOR SHARE");
  expect(receivedIdentifier).toBe(identifier);
  expect(companyId).toBe("company-1");
}

describe("ActivitiesRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.getDelegate.mockResolvedValue({
      findMany: persistence.findMany,
      count: persistence.count
    });
    persistence.findMany.mockResolvedValue([]);
    persistence.count.mockResolvedValue(135);
    persistence.activityFindFirst.mockResolvedValue({ id: "activity-1", status: "PENDING" });
    persistence.activityCreate.mockResolvedValue({ id: "activity-1", status: "PENDING" });
    persistence.activityUpdate.mockResolvedValue({ id: "activity-1", status: "DONE" });
    persistence.taskColumnCreateMany.mockResolvedValue({ count: 4 });
    persistence.auditCreate.mockResolvedValue(undefined);
    persistence.historyCreate.mockResolvedValue(undefined);
    persistence.lockActivity.mockResolvedValue([{ id: "activity-1" }]);
    persistence.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRawUnsafe: persistence.lockActivity,
          activity: {
            findFirst: persistence.activityFindFirst,
            create: persistence.activityCreate,
            update: persistence.activityUpdate
          },
          activityTaskColumn: { createMany: persistence.taskColumnCreateMany },
          auditLog: { create: persistence.auditCreate },
          activityHistory: { create: persistence.historyCreate }
        })
    );
  });

  it("uses the requested page window while counting the full filter", async () => {
    const repository = new ActivitiesRepository();
    const where = { companyId: "company-1", deletedAt: null };

    const result = await repository.filteredList(where, { page: 3, pageSize: 20 });

    expect(persistence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 40, take: 20 })
    );
    expect(persistence.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ items: [], total: 135, page: 3, pageSize: 20 });
  });

  it("creates the activity, audit and history through one transaction client", async () => {
    const repository = new ActivitiesRepository();

    await repository.createWithEvidence(validCreateData, (created) => ({
      audit: { entityId: created.id, action: "CREATE" },
      history: { activityId: created.id, type: "CREATED" }
    }));

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.activityCreate).toHaveBeenCalledWith({ data: validCreateData });
    expect(persistence.auditCreate).toHaveBeenCalledWith({
      data: { entityId: "activity-1", action: "CREATE" }
    });
    expect(persistence.historyCreate).toHaveBeenCalledWith({
      data: { activityId: "activity-1", type: "CREATED" }
    });
    expect(persistence.taskColumnCreateMany).not.toHaveBeenCalled();
    expect(persistence.getDelegate).not.toHaveBeenCalled();
    expect(persistence.activityCreate.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.auditCreate.mock.invocationCallOrder[0]
    );
    expect(persistence.auditCreate.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.historyCreate.mock.invocationCallOrder[0]
    );
  });

  it("provisions default task columns in the activity creation transaction", async () => {
    const repository = new ActivitiesRepository();

    await repository.createWithEvidence(
      validCreateData,
      () => ({
        audit: { entityId: "activity-1", action: "CREATE" },
        history: { activityId: "activity-1", type: "CREATED" }
      }),
      [
        { name: "To do", color: "#64748b", position: 0 },
        { name: "Done", color: "#16a34a", position: 1 }
      ]
    );

    expect(persistence.taskColumnCreateMany).toHaveBeenCalledWith({
      data: [
        {
          name: "To do",
          color: "#64748b",
          position: 0,
          companyId: "company-1",
          activityId: "activity-1"
        },
        {
          name: "Done",
          color: "#16a34a",
          position: 1,
          companyId: "company-1",
          activityId: "activity-1"
        }
      ]
    });
    expect(persistence.activityCreate.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.taskColumnCreateMany.mock.invocationCallOrder[0]
    );
    expect(persistence.taskColumnCreateMany.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.auditCreate.mock.invocationCallOrder[0]
    );
  });

  it("locks every scoped reference deterministically before creating the activity", async () => {
    const repository = new ActivitiesRepository();

    await repository.createWithEvidence(
      {
        ...validCreateData,
        shiftId: "shift-1",
        assigneeId: "user-b"
      },
      () => ({
        audit: { entityId: "activity-1", action: "CREATE" },
        history: { activityId: "activity-1", type: "CREATED" }
      })
    );

    expectReferenceLock(0, "clients", "id", "client-1");
    expectReferenceLock(1, "teams", "id", "team-1");
    expectReferenceLock(2, "shifts", "id", "shift-1");
    expectReferenceLock(3, "user_companies", "userId", "user-a");
    expectReferenceLock(4, "user_companies", "userId", "user-b");
    expect(persistence.lockActivity.mock.invocationCallOrder[4]).toBeLessThan(
      persistence.activityCreate.mock.invocationCallOrder[0]
    );
  });

  it("rejects an inactive transactional reference before any aggregate write", async () => {
    persistence.lockActivity.mockImplementation(async (query: string) =>
      query.includes('FROM "user_companies"') ? [] : [{ id: "active-reference" }]
    );
    const repository = new ActivitiesRepository();

    await expect(
      repository.createWithEvidence(validCreateData, () => ({
        audit: { entityId: "activity-1", action: "CREATE" },
        history: { activityId: "activity-1", type: "CREATED" }
      }))
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(persistence.activityCreate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("locks and re-reads the activity before planning an evidenced update", async () => {
    const repository = new ActivitiesRepository();
    const planFor = vi.fn(() => ({
      data: { status: "DONE" },
      evidenceFor: (updated: Record<string, unknown>) => ({
        audit: { entityId: updated.id, action: "UPDATE" },
        history: { activityId: updated.id, type: "CLOSED" }
      })
    }));

    await repository.updateWithEvidence("company-1", "activity-1", planFor);

    const [activityLock, activityId, companyId] = persistence.lockActivity.mock.calls[0];
    expect(activityLock).toContain('FROM "activities"');
    expect(activityLock).toContain('"id" = $1::uuid');
    expect(activityLock).toContain('"companyId" = $2::uuid');
    expect(activityLock).toContain('"deletedAt" IS NULL');
    expect(activityLock).toContain("FOR UPDATE");
    expect(activityId).toBe("activity-1");
    expect(companyId).toBe("company-1");
    expect(persistence.activityFindFirst).toHaveBeenCalledWith({
      where: { id: "activity-1", companyId: "company-1", deletedAt: null }
    });
    expect(planFor).toHaveBeenCalledWith({ id: "activity-1", status: "PENDING" });
    expect(persistence.activityUpdate).toHaveBeenCalledWith({
      where: { id: "activity-1" },
      data: { status: "DONE" }
    });
    expect(persistence.lockActivity.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.activityFindFirst.mock.invocationCallOrder[0]
    );
    expect(persistence.activityFindFirst.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.activityUpdate.mock.invocationCallOrder[0]
    );
    expect(persistence.getDelegate).not.toHaveBeenCalled();
  });

  it("locks only a reference that actually changes during an evidenced update", async () => {
    persistence.activityFindFirst.mockResolvedValue({
      id: "activity-1",
      status: "PENDING",
      clientId: "client-1",
      teamId: "team-1",
      reporterId: "user-b"
    });
    const repository = new ActivitiesRepository();

    await repository.updateWithEvidence("company-1", "activity-1", () => ({
      data: { assigneeId: "user-a" },
      evidenceFor: () => ({
        audit: { entityId: "activity-1", action: "UPDATE" },
        history: { activityId: "activity-1", type: "ASSIGNED" }
      })
    }));

    expect(persistence.lockActivity).toHaveBeenCalledTimes(2);
    expectReferenceLock(1, "user_companies", "userId", "user-a");
    expect(persistence.lockActivity.mock.invocationCallOrder[1]).toBeLessThan(
      persistence.activityUpdate.mock.invocationCallOrder[0]
    );
  });

  it("does not revalidate unchanged historical references during an ordinary edit", async () => {
    persistence.activityFindFirst.mockResolvedValue({
      id: "activity-1",
      status: "PENDING",
      clientId: "client-1",
      teamId: "team-1",
      shiftId: "shift-1",
      assigneeId: "user-a",
      reporterId: "user-b"
    });
    persistence.lockActivity.mockImplementation(async (query: string) =>
      query.includes('FROM "activities"') ? [{ id: "activity-1" }] : []
    );
    const repository = new ActivitiesRepository();

    await repository.updateWithEvidence("company-1", "activity-1", () => ({
      data: {
        title: "Updated incident",
        status: "PENDING",
        clientId: "client-1",
        teamId: "team-1",
        shiftId: "shift-1",
        assigneeId: "user-a",
        reporterId: "user-b"
      },
      evidenceFor: () => ({
        audit: { entityId: "activity-1", action: "UPDATE" },
        history: { activityId: "activity-1", type: "UPDATED" }
      })
    }));

    expect(persistence.lockActivity).toHaveBeenCalledOnce();
    expect(persistence.activityUpdate).toHaveBeenCalledOnce();
    expect(persistence.auditCreate).toHaveBeenCalledOnce();
    expect(persistence.historyCreate).toHaveBeenCalledOnce();
  });

  it("rejects a newly inactive reference before mutation or evidence", async () => {
    persistence.activityFindFirst.mockResolvedValue({
      id: "activity-1",
      status: "PENDING",
      clientId: "client-1"
    });
    persistence.lockActivity.mockImplementation(async (query: string) =>
      query.includes('FROM "activities"') ? [{ id: "activity-1" }] : []
    );
    const repository = new ActivitiesRepository();

    await expect(
      repository.updateWithEvidence("company-1", "activity-1", () => ({
        data: { clientId: "client-2" },
        evidenceFor: () => ({
          audit: { entityId: "activity-1", action: "UPDATE" },
          history: { activityId: "activity-1", type: "UPDATED" }
        })
      }))
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(persistence.lockActivity).toHaveBeenCalledTimes(2);
    expectReferenceLock(1, "clients", "id", "client-2");
    expect(persistence.activityUpdate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });

  it("does not revalidate references for an aggregate soft-delete plan", async () => {
    persistence.activityFindFirst.mockResolvedValue({
      id: "activity-1",
      clientId: "inactive-client",
      teamId: "inactive-team",
      reporterId: "inactive-user"
    });
    persistence.lockActivity.mockImplementation(async (query: string) =>
      query.includes('FROM "activities"') ? [{ id: "activity-1" }] : []
    );
    const repository = new ActivitiesRepository();

    await repository.updateWithEvidence("company-1", "activity-1", () => ({
      data: { deletedAt: new Date("2026-08-27T00:00:00.000Z") },
      evidenceFor: () => ({
        audit: { entityId: "activity-1", action: "SOFT_DELETE" },
        history: { activityId: "activity-1", type: "SOFT_DELETED" }
      })
    }));

    expect(persistence.lockActivity).toHaveBeenCalledOnce();
    expect(persistence.activityUpdate).toHaveBeenCalledOnce();
    expect(persistence.auditCreate).toHaveBeenCalledOnce();
    expect(persistence.historyCreate).toHaveBeenCalledOnce();
  });

  it("propagates a late history failure from the aggregate transaction", async () => {
    persistence.historyCreate.mockRejectedValue(new Error("history unavailable"));
    const repository = new ActivitiesRepository();

    await expect(
      repository.updateWithEvidence("company-1", "activity-1", () => ({
        data: { status: "DONE" },
        evidenceFor: () => ({
          audit: { entityId: "activity-1", action: "UPDATE" },
          history: { activityId: "activity-1", type: "CLOSED" }
        })
      }))
    ).rejects.toThrow("history unavailable");

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.activityUpdate).toHaveBeenCalledOnce();
    expect(persistence.auditCreate).toHaveBeenCalledOnce();
    expect(persistence.historyCreate).toHaveBeenCalledOnce();
    expect(persistence.getDelegate).not.toHaveBeenCalled();
  });

  it("stops before history when the transactional audit write fails", async () => {
    persistence.auditCreate.mockRejectedValue(new Error("audit unavailable"));
    const repository = new ActivitiesRepository();

    await expect(
      repository.createWithEvidence(validCreateData, () => ({
        audit: { entityId: "activity-1", action: "CREATE" },
        history: { activityId: "activity-1", type: "CREATED" }
      }))
    ).rejects.toThrow("audit unavailable");

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.activityCreate).toHaveBeenCalledOnce();
    expect(persistence.auditCreate).toHaveBeenCalledOnce();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
    expect(persistence.getDelegate).not.toHaveBeenCalled();
  });

  it("returns no mutation when the scoped activity cannot be locked", async () => {
    persistence.lockActivity.mockResolvedValue([]);
    const repository = new ActivitiesRepository();
    const planFor = vi.fn();

    await expect(
      repository.updateWithEvidence("company-1", "missing-activity", planFor)
    ).resolves.toBeNull();

    expect(persistence.activityFindFirst).not.toHaveBeenCalled();
    expect(planFor).not.toHaveBeenCalled();
    expect(persistence.activityUpdate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
    expect(persistence.historyCreate).not.toHaveBeenCalled();
  });
});
