// en-GB: Verifies consistent dashboard snapshots and atomic configuration persistence.
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  getDelegate: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
  activityCount: vi.fn(),
  activityGroupBy: vi.fn(),
  activityFindMany: vi.fn(),
  configurationFindMany: vi.fn(),
  configurationCreate: vi.fn(),
  configurationUpdate: vi.fn(),
  widgetDeleteMany: vi.fn(),
  widgetCreateMany: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: persistence.getDelegate,
  getPrisma: vi.fn().mockResolvedValue({ $transaction: persistence.transaction })
}));

import { DashboardRepository } from "./dashboard.repository.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const userId = "8f536533-317b-41ea-ab86-d7545910e3cb";
const teamId = "62cddc37-5198-4a90-9a48-6b82c7a39f38";
const configurationId = "94fcc433-72dd-4428-8af6-dff05a739d2c";
const widgetId = "71078e07-6d10-44ad-a199-cdb43a90caf1";

function transactionClient() {
  return {
    $queryRawUnsafe: persistence.query,
    activity: {
      count: persistence.activityCount,
      groupBy: persistence.activityGroupBy,
      findMany: persistence.activityFindMany
    },
    dashboardConfiguration: {
      findMany: persistence.configurationFindMany,
      create: persistence.configurationCreate,
      update: persistence.configurationUpdate
    },
    dashboardWidget: {
      deleteMany: persistence.widgetDeleteMany,
      createMany: persistence.widgetCreateMany
    }
  };
}

function transactionConcurrencyTracker() {
  let inFlight = 0;
  let maximum = 0;
  return {
    async run<T>(value: T) {
      inFlight += 1;
      maximum = Math.max(maximum, inFlight);
      try {
        await Promise.resolve();
        return value;
      } finally {
        inFlight -= 1;
      }
    },
    maximum: () => maximum
  };
}

function context(team: string | null = null) {
  return { companyId, userId, dashboardType: "MAIN" as const, teamId: team };
}

function widget(id?: string) {
  return {
    ...(id ? { id } : {}),
    widgetType: "SUMMARY_CARD",
    title: "Total",
    description: null,
    gridColumn: 1,
    gridRow: 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order: 0,
    refreshIntervalMs: 60000,
    settings: { key: "summary-total" },
    metadata: {}
  };
}

describe("DashboardRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.transaction.mockImplementation(
      async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
        callback(transactionClient())
    );
    persistence.getDelegate.mockResolvedValue({ findMany: persistence.activityFindMany });
    persistence.query.mockImplementation(async (query: string) => {
      if (query.includes('FROM "user_companies"')) return [{ id: "membership-1" }];
      if (query.includes('FROM "teams"')) return [{ id: teamId }];
      return [];
    });
    persistence.activityCount.mockResolvedValue(0);
    persistence.activityGroupBy.mockResolvedValue([]);
    persistence.activityFindMany.mockResolvedValue([]);
    persistence.configurationFindMany.mockResolvedValue([]);
    persistence.configurationCreate.mockResolvedValue({ id: configurationId });
    persistence.configurationUpdate.mockResolvedValue({ id: configurationId });
    persistence.widgetDeleteMany.mockResolvedValue({ count: 0 });
    persistence.widgetCreateMany.mockResolvedValue({ count: 1 });
  });

  it("reads every summary component from one repeatable-read snapshot", async () => {
    const repository = new DashboardRepository();
    const where = { companyId, status: "PENDING", AND: [{ priority: "LOW" }] };
    const riskWhere = { companyId, AND: [{ slaDueAt: { gte: new Date(0) } }] };
    const overdueWhere = { companyId, AND: [{ slaDueAt: { lt: new Date(0) } }] };
    const concurrency = transactionConcurrencyTracker();
    persistence.activityCount
      .mockImplementationOnce(() => concurrency.run(12))
      .mockImplementationOnce(() => concurrency.run(2))
      .mockImplementationOnce(() => concurrency.run(3));
    persistence.activityGroupBy.mockImplementation(() => concurrency.run([]));
    persistence.activityFindMany.mockImplementation(() => concurrency.run([]));

    const result = await repository.summarySnapshot(where, riskWhere, overdueWhere);

    expect(result).toMatchObject({ total: 12, slaAtRisk: 2, overdue: 3 });
    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
    expect(persistence.activityCount).toHaveBeenNthCalledWith(1, { where });
    expect(persistence.activityCount).toHaveBeenNthCalledWith(2, { where: riskWhere });
    expect(persistence.activityCount).toHaveBeenNthCalledWith(3, { where: overdueWhere });
    expect(persistence.activityGroupBy).toHaveBeenNthCalledWith(1, {
      by: ["status"],
      where,
      _count: { _all: true },
      orderBy: { status: "asc" }
    });
    expect(persistence.activityGroupBy).toHaveBeenNthCalledWith(2, {
      by: ["priority"],
      where,
      _count: { _all: true },
      orderBy: { priority: "asc" }
    });
    expect(persistence.activityFindMany).toHaveBeenCalledWith({
      where: {
        companyId,
        status: "PENDING",
        AND: [{ priority: "LOW" }, { status: "DONE" }, { completedAt: { not: null } }]
      },
      select: { createdAt: true, completedAt: true },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      take: 500
    });
    expect(concurrency.maximum()).toBe(1);
  });

  it("reads all chart groupings in canonical order from one snapshot", async () => {
    const repository = new DashboardRepository();
    const where = { companyId, deletedAt: null };
    const concurrency = transactionConcurrencyTracker();
    persistence.activityGroupBy.mockImplementation(() => concurrency.run([]));

    await repository.chartsSnapshot(where);

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
    expect(persistence.activityGroupBy.mock.calls.map(([args]) => args)).toEqual(
      ["teamId", "clientId", "status", "priority", "shiftId"].map((field) => ({
        by: [field],
        where,
        _count: { _all: true },
        orderBy: { [field]: "asc" }
      }))
    );
    expect(concurrency.maximum()).toBe(1);
  });

  it("uses a total order for the bounded operational list", async () => {
    const repository = new DashboardRepository();
    const where = { companyId, deletedAt: null };

    await repository.operationalList(where);

    expect(persistence.activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        take: 50,
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }]
      })
    );
  });

  it("returns an absent configuration without performing any write", async () => {
    const repository = new DashboardRepository();

    await expect(
      repository.findConfiguration({ ...context(), deletedAt: null })
    ).resolves.toBeNull();

    expect(persistence.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
    expect(persistence.configurationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          widgets: expect.objectContaining({
            orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }]
          })
        }
      })
    );
    expect(persistence.configurationCreate).not.toHaveBeenCalled();
    expect(persistence.configurationUpdate).not.toHaveBeenCalled();
    expect(persistence.widgetDeleteMany).not.toHaveBeenCalled();
    expect(persistence.widgetCreateMany).not.toHaveBeenCalled();
  });

  it("fails closed when an existing context contains multiple active configurations", async () => {
    persistence.configurationFindMany.mockResolvedValue([{ id: "one" }, { id: "two" }]);
    const repository = new DashboardRepository();

    await expect(
      repository.findConfiguration({ ...context(), deletedAt: null })
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });

  it("creates the parent, replaces widgets and returns the aggregate in one command", async () => {
    const updated = {
      id: configurationId,
      ...context(),
      widgets: [{ id: widgetId, ...widget() }]
    };
    persistence.configurationFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([updated]);
    const repository = new DashboardRepository();

    const result = await repository.writeConfiguration(
      context(),
      { gridColumns: 12, gridGap: 16, isDefault: false, metadata: {} },
      [widget()]
    );

    expect(result).toBe(updated);
    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.configurationCreate).toHaveBeenCalledWith({
      data: {
        ...context(),
        gridColumns: 12,
        gridGap: 16,
        isDefault: false,
        metadata: {}
      }
    });
    expect(persistence.widgetDeleteMany).toHaveBeenCalledWith({
      where: { dashboardConfigId: configurationId, companyId }
    });
    expect(persistence.widgetCreateMany).toHaveBeenCalledWith({
      data: [{ ...widget(), companyId, dashboardConfigId: configurationId }]
    });
    expect(persistence.configurationUpdate).toHaveBeenCalledWith({
      where: { id: configurationId },
      data: { gridColumns: 12, gridGap: 16, isDefault: false, metadata: {} }
    });
    expect(persistence.getDelegate).not.toHaveBeenCalled();
    expect(persistence.query.mock.calls[0][0]).toContain('FROM "user_companies"');
    expect(persistence.query.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(persistence.query.mock.calls[1][0]).toContain('FROM "dashboard_configurations"');
    expect(persistence.query.mock.calls[1][0]).toContain('"teamId" IS NOT DISTINCT FROM');
  });

  it("locks and revalidates a team before any aggregate write", async () => {
    persistence.query.mockImplementation(async (query: string) => {
      if (query.includes('FROM "user_companies"')) return [{ id: "membership-1" }];
      if (query.includes('FROM "teams"')) return [];
      return [];
    });
    const repository = new DashboardRepository();

    await expect(
      repository.writeConfiguration(context(teamId), { gridColumns: 12 }, [widget()])
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    expect(persistence.query.mock.calls[1][0]).toContain("FOR SHARE");
    expect(persistence.configurationFindMany).not.toHaveBeenCalled();
    expect(persistence.widgetDeleteMany).not.toHaveBeenCalled();
  });

  it("preserves widget identity by durable key across replacement retries", async () => {
    const existing = {
      id: configurationId,
      ...context(),
      widgets: [{ id: widgetId, ...widget() }]
    };
    persistence.configurationFindMany
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([existing]);
    const repository = new DashboardRepository();

    await repository.writeConfiguration(context(), { gridColumns: 12 }, [widget()]);

    expect(persistence.configurationCreate).not.toHaveBeenCalled();
    expect(persistence.widgetCreateMany).toHaveBeenCalledWith({
      data: [{ ...widget(widgetId), companyId, dashboardConfigId: configurationId }]
    });
  });

  it("rejects a caller-supplied widget identity outside the current configuration", async () => {
    const existing = {
      id: configurationId,
      ...context(),
      widgets: [{ id: widgetId, ...widget() }]
    };
    persistence.configurationFindMany.mockResolvedValueOnce([existing]);
    const repository = new DashboardRepository();

    await expect(
      repository.writeConfiguration(context(), { gridColumns: 12 }, [
        widget("068391ea-6a40-4c8f-aa4c-2fe30b6810a2")
      ])
    ).rejects.toMatchObject({ statusCode: 400, code: "BAD_REQUEST" });

    expect(persistence.widgetDeleteMany).not.toHaveBeenCalled();
  });
});
