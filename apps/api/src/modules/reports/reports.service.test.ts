// en-GB: Exercises report filter precision without a database runtime.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { ReportsRepository } from "./reports.repository.js";
import { ReportsService } from "./reports.service.js";

describe("ReportsService.activitySummary", () => {
  it("preserves exact millisecond date boundaries produced by validation", async () => {
    const from = new Date("2026-08-01T00:00:00.123Z");
    const to = new Date("2026-08-31T23:59:59.987Z");
    const activitySummary = vi.fn().mockResolvedValue({ total: 0, byStatus: [], byPriority: [] });
    const service = new ReportsService({ activitySummary } as unknown as ReportsRepository);

    await service.activitySummary({
      query: { from, to },
      auth: {
        id: "user-1",
        email: "owner@example.com",
        companyId: "c40e2a7b-72a8-4aca-a780-d6d239134d38"
      }
    } as unknown as ApiRequest);

    expect(activitySummary).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: { gte: from, lte: to } })
    );
  });
});
