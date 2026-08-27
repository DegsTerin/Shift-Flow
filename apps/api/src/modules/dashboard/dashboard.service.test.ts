// en-GB: Exercises dashboard clocks, pure defaults and atomic configuration command planning.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { DashboardConfigurationDto } from "./dashboard.dto.js";
import type { DashboardRepository } from "./dashboard.repository.js";
import { DashboardService } from "./dashboard.service.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const userId = "8f536533-317b-41ea-ab86-d7545910e3cb";

function request(query: Record<string, unknown> = {}) {
  return {
    query,
    auth: { id: userId, email: "owner@example.com", companyId }
  } as unknown as ApiRequest;
}

function configuration(): DashboardConfigurationDto {
  return {
    dashboardType: "MAIN",
    teamId: null,
    gridColumns: 12,
    gridGap: 16,
    isDefault: false,
    metadata: {},
    widgets: [
      {
        key: "summary-total",
        widgetType: "SUMMARY_CARD",
        title: "Total",
        gridColumn: 1,
        gridRow: 1,
        gridWidth: 2,
        gridHeight: 2,
        isVisible: true,
        isPinned: false,
        order: 0
      }
    ]
  };
}

describe("DashboardService", () => {
  it("uses one clock and a gap-free SLA partition for a summary snapshot", async () => {
    const repository = {
      summarySnapshot: vi.fn().mockResolvedValue({
        total: 0,
        byStatus: [],
        byPriority: [],
        slaAtRisk: 0,
        overdue: 0,
        completedActivities: []
      })
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await service.summary(request({ priority: "LOW", status: "PENDING", attention: "SLA_RISK" }));

    const [baseWhere, riskWhere, overdueWhere] = vi.mocked(repository.summarySnapshot).mock
      .calls[0] as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
    expect(baseWhere).toMatchObject({
      companyId,
      priority: "LOW",
      status: "PENDING",
      AND: [
        {
          status: { notIn: ["DONE", "CANCELLED"] },
          slaDueAt: { gte: expect.any(Date), lte: expect.any(Date) }
        }
      ]
    });
    expect(riskWhere.AND).toEqual([
      {
        status: { notIn: ["DONE", "CANCELLED"] },
        slaDueAt: { gte: expect.any(Date), lte: expect.any(Date) }
      },
      { status: { notIn: ["DONE", "CANCELLED"] } },
      { slaDueAt: { gte: expect.any(Date), lte: expect.any(Date) } }
    ]);
    expect(overdueWhere.AND).toEqual([
      {
        status: { notIn: ["DONE", "CANCELLED"] },
        slaDueAt: { gte: expect.any(Date), lte: expect.any(Date) }
      },
      { status: { notIn: ["DONE", "CANCELLED"] } },
      { slaDueAt: { lt: expect.any(Date) } }
    ]);
    const baseBoundary = (baseWhere.AND as Array<Record<string, unknown>>)[0] as {
      slaDueAt: { gte: Date; lte: Date };
    };
    const riskBoundary = (riskWhere.AND as Array<Record<string, unknown>>)[2] as {
      slaDueAt: { gte: Date; lte: Date };
    };
    const overdueBoundary = (overdueWhere.AND as Array<Record<string, unknown>>)[2] as {
      slaDueAt: { lt: Date };
    };
    expect(baseBoundary.slaDueAt.gte).toBe(riskBoundary.slaDueAt.gte);
    expect(baseBoundary.slaDueAt.lte).toBe(riskBoundary.slaDueAt.lte);
    expect(riskBoundary.slaDueAt.gte).toBe(overdueBoundary.slaDueAt.lt);
    expect(riskBoundary.slaDueAt.lte.getTime() - riskBoundary.slaDueAt.gte.getTime()).toBe(
      60 * 60 * 1000
    );
  });

  it("excludes invalid negative durations instead of turning them into zero-hour completions", async () => {
    const repository = {
      summarySnapshot: vi.fn().mockResolvedValue({
        total: 2,
        byStatus: [{ status: "DONE", _count: { _all: 2 } }],
        byPriority: [{ priority: "CRITICAL", _count: { _all: 4 } }],
        slaAtRisk: 0,
        overdue: 0,
        completedActivities: [
          {
            createdAt: new Date("2026-08-27T02:00:00.000Z"),
            completedAt: new Date("2026-08-27T01:00:00.000Z")
          },
          {
            createdAt: new Date("2026-08-27T01:00:00.000Z"),
            completedAt: new Date("2026-08-27T03:00:00.000Z")
          }
        ]
      })
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await expect(service.summary(request())).resolves.toMatchObject({
      critical: 4,
      averageResolutionHours: 2
    });
  });

  it("preserves exact millisecond date boundaries produced by validation", async () => {
    const from = new Date("2026-08-01T00:00:00.123Z");
    const to = new Date("2026-08-31T23:59:59.987Z");
    const repository = {
      operationalList: vi.fn().mockResolvedValue([])
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await service.operationalList(request({ from, to }));

    expect(repository.operationalList).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: { gte: from, lte: to } })
    );
  });

  it("returns a virtual default without asking the repository to persist it", async () => {
    const repository = {
      findConfiguration: vi.fn().mockResolvedValue(null),
      writeConfiguration: vi.fn()
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    const result = await service.configuration(request(), "MAIN");

    expect(result).toMatchObject({
      dashboardType: "MAIN",
      teamId: null,
      gridColumns: 12,
      gridGap: 16,
      isDefault: true
    });
    expect(result).not.toHaveProperty("id");
    expect(result.widgets).toHaveLength(18);
    expect(result.widgets[0]).toMatchObject({
      key: "summary-total",
      refreshIntervalMs: 60000,
      settings: { key: "summary-total" },
      metadata: {}
    });
    expect(repository.writeConfiguration).not.toHaveBeenCalled();
  });

  it("normalises legacy response orders into a deterministic contiguous sequence", async () => {
    const repository = {
      findConfiguration: vi.fn().mockResolvedValue({
        id: "94fcc433-72dd-4428-8af6-dff05a739d2c",
        dashboardType: "MAIN",
        teamId: null,
        gridColumns: 12,
        gridGap: 16,
        isDefault: false,
        metadata: {},
        widgets: [
          {
            id: "71078e07-6d10-44ad-a199-cdb43a90caf1",
            ...configuration().widgets[0],
            order: 8,
            settings: { key: "summary-total" }
          },
          {
            id: "ff4d82a8-2ac3-4103-aa51-cf429052cb0e",
            ...configuration().widgets[0],
            key: "summary-pending",
            title: "Pending",
            order: 8,
            settings: { key: "summary-pending" }
          }
        ]
      })
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    const result = await service.configuration(request(), "MAIN");

    expect(result.widgets.map((widget) => ({ key: widget.key, order: widget.order }))).toEqual([
      { key: "summary-total", order: 0 },
      { key: "summary-pending", order: 1 }
    ]);
  });

  it("rejects a path and body type mismatch before consulting persistence", async () => {
    const repository = {
      writeConfiguration: vi.fn()
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);
    const data = { ...configuration(), dashboardType: "TEAM" as const };

    await expect(service.saveConfiguration({} as ApiRequest, "MAIN", data)).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST"
    });
    expect(repository.writeConfiguration).not.toHaveBeenCalled();
  });

  it("plans a save as one repository-owned aggregate command", async () => {
    const saved = {
      id: "94fcc433-72dd-4428-8af6-dff05a739d2c",
      ...configuration(),
      widgets: [
        {
          id: "71078e07-6d10-44ad-a199-cdb43a90caf1",
          ...configuration().widgets[0],
          description: null,
          refreshIntervalMs: 60000,
          settings: { key: "summary-total" },
          metadata: {}
        }
      ]
    };
    const repository = {
      writeConfiguration: vi.fn().mockResolvedValue(saved)
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    const result = await service.saveConfiguration(request(), "MAIN", configuration());

    expect(repository.writeConfiguration).toHaveBeenCalledWith(
      { companyId, userId, dashboardType: "MAIN", teamId: null },
      { gridColumns: 12, gridGap: 16, isDefault: false, metadata: {} },
      [
        expect.objectContaining({
          widgetType: "SUMMARY_CARD",
          order: 0,
          refreshIntervalMs: 60000,
          settings: { key: "summary-total" }
        })
      ]
    );
    expect(result).toMatchObject({ id: saved.id, dashboardType: "MAIN" });
  });

  it("normalises sparse or duplicate input orders before persistence", async () => {
    const data = configuration();
    data.widgets = [
      { ...data.widgets[0], key: "summary-pending", title: "Pending", order: 7 },
      { ...data.widgets[0], key: "summary-total", order: 7 }
    ];
    const repository = {
      writeConfiguration: vi.fn().mockResolvedValue({
        id: "94fcc433-72dd-4428-8af6-dff05a739d2c",
        ...data,
        widgets: []
      })
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await service.saveConfiguration(request(), "MAIN", data);

    const persistedWidgets = vi.mocked(repository.writeConfiguration).mock.calls[0][2];
    expect(persistedWidgets).toEqual([
      expect.objectContaining({ settings: { key: "summary-pending" }, order: 0 }),
      expect.objectContaining({ settings: { key: "summary-total" }, order: 1 })
    ]);
  });

  it("plans reset defaults through the same atomic command even when no row exists yet", async () => {
    const repository = {
      writeConfiguration: vi.fn().mockResolvedValue({
        id: "94fcc433-72dd-4428-8af6-dff05a739d2c",
        dashboardType: "TEAM",
        teamId: null,
        gridColumns: 12,
        gridGap: 16,
        isDefault: true,
        metadata: {},
        widgets: []
      })
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await service.resetConfiguration(request(), "TEAM");

    expect(repository.writeConfiguration).toHaveBeenCalledWith(
      { companyId, userId, dashboardType: "TEAM", teamId: null },
      { gridColumns: 12, gridGap: 16, isDefault: true, metadata: {} },
      expect.arrayContaining([
        expect.objectContaining({ settings: { key: "team-summary" }, order: 0 })
      ])
    );
    expect(vi.mocked(repository.writeConfiguration).mock.calls[0][2]).toHaveLength(4);
  });
});
