// en-GB: Verifies bounded activity list persistence arguments without a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const delegates = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn(async () => delegates)
}));

import { ActivitiesRepository } from "./activities.repository.js";

describe("ActivitiesRepository.filteredList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delegates.findMany.mockResolvedValue([]);
    delegates.count.mockResolvedValue(135);
  });

  it("uses the requested page window while counting the full filter", async () => {
    const repository = new ActivitiesRepository();
    const where = { companyId: "company-1", deletedAt: null };

    const result = await repository.filteredList(where, { page: 3, pageSize: 20 });

    expect(delegates.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 40, take: 20 })
    );
    expect(delegates.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ items: [], total: 135, page: 3, pageSize: 20 });
  });
});
