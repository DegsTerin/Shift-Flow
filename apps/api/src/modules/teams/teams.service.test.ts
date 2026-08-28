// en-GB: Verifies tenant-scoped team search, pagination and deterministic ordering.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { TeamsService } from "./teams.service.js";

function request(query: Record<string, unknown>): ApiRequest {
  return {
    query,
    auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
    tenant: { companyId: "company-a" }
  } as unknown as ApiRequest;
}

describe("TeamsService.list", () => {
  it("uses one tenant-scoped predicate for rows and count with a stable tie-breaker", async () => {
    const service = new TeamsService() as unknown as {
      repository: {
        list(args: Record<string, unknown>): Promise<unknown[]>;
        count(where: Record<string, unknown>): Promise<number>;
      };
      list(req: ApiRequest): Promise<unknown>;
    };
    const list = vi.fn().mockResolvedValue([{ id: "team-13" }]);
    const count = vi.fn().mockResolvedValue(13);
    service.repository = { list, count };

    await expect(
      service.list(request({ page: 2, pageSize: 12, search: "  operations  " }))
    ).resolves.toMatchObject({
      items: [{ id: "team-13" }],
      total: 13,
      page: 2,
      pageSize: 12
    });

    const where = {
      companyId: "company-a",
      deletedAt: null,
      OR: ["name", "description"].map((field) => ({
        [field]: { contains: "operations", mode: "insensitive" }
      }))
    };
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 12,
        take: 12,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: expect.objectContaining({ members: expect.any(Object) })
      })
    );
    expect(count).toHaveBeenCalledWith(where);
  });
});
