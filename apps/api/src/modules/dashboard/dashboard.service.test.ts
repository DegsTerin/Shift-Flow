// en-GB: Exercises dashboard filter composition and non-overlapping SLA metrics.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { DashboardRepository } from "./dashboard.repository.js";
import { DashboardService } from "./dashboard.service.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";

describe("DashboardService", () => {
  it("combines attention filters and excludes overdue work from SLA risk", async () => {
    const repository = {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      completedForAverage: vi.fn().mockResolvedValue([])
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);
    const req = {
      query: { priority: "LOW", status: "PENDING", attention: "CRITICAL" },
      auth: { id: "user-1", email: "owner@example.com", companyId }
    } as unknown as ApiRequest;

    await service.summary(req);

    const [baseWhere] = vi.mocked(repository.count).mock.calls[0] as [Record<string, unknown>];
    const [riskWhere] = vi.mocked(repository.count).mock.calls[1] as [Record<string, unknown>];
    const [overdueWhere] = vi.mocked(repository.count).mock.calls[2] as [Record<string, unknown>];
    expect(baseWhere).toMatchObject({
      companyId,
      priority: "LOW",
      status: "PENDING",
      AND: [{ priority: "CRITICAL" }]
    });
    expect(riskWhere.AND).toEqual([
      { priority: "CRITICAL" },
      { status: { notIn: ["DONE", "CANCELLED"] } },
      { slaDueAt: { gt: expect.any(Date), lte: expect.any(Date) } }
    ]);
    expect(overdueWhere.AND).toEqual([
      { priority: "CRITICAL" },
      { status: { notIn: ["DONE", "CANCELLED"] } },
      { slaDueAt: { lt: expect.any(Date) } }
    ]);
  });

  it("preserves exact millisecond date boundaries produced by validation", async () => {
    const from = new Date("2026-08-01T00:00:00.123Z");
    const to = new Date("2026-08-31T23:59:59.987Z");
    const repository = {
      operationalList: vi.fn().mockResolvedValue([])
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await service.operationalList({
      query: { from, to },
      auth: { id: "user-1", email: "owner@example.com", companyId }
    } as unknown as ApiRequest);

    expect(repository.operationalList).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: { gte: from, lte: to } })
    );
  });
});
