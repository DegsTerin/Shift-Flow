// en-GB: Verifies that completed metrics preserve every caller-supplied filter.
import { beforeEach, describe, expect, it, vi } from "vitest";

const activity = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn(async () => activity),
  getPrisma: vi.fn()
}));

import { DashboardRepository } from "./dashboard.repository.js";

describe("DashboardRepository.completedForAverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activity.findMany.mockResolvedValue([]);
  });

  it("adds completed predicates without overwriting explicit filters", async () => {
    const repository = new DashboardRepository();
    const where = { companyId: "company-1", status: "PENDING", AND: [{ priority: "LOW" }] };

    await repository.completedForAverage(where);

    expect(activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: "company-1",
          status: "PENDING",
          AND: [{ priority: "LOW" }, { status: "DONE" }, { completedAt: { not: null } }]
        }
      })
    );
  });
});
