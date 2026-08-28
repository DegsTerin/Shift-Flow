// en-GB: Verifies search composition without weakening tenant or deletion scopes.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../http/request-types.js";
import type { BaseRepository } from "../repositories/base.repository.js";
import { BaseService } from "./base.service.js";

describe("BaseService searchable lists", () => {
  it("composes case-insensitive search with tenant, deletion and pagination constraints", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    };
    const service = new BaseService(repository as unknown as BaseRepository, "Client", {
      orderBy: [{ name: "asc" }, { id: "asc" }],
      searchFields: ["name", "code"]
    });
    const request = {
      auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
      tenant: { companyId: "company-a" },
      query: { search: "  needle  ", page: "2", pageSize: "12" }
    } as unknown as ApiRequest;

    await service.list(request);

    const where = {
      companyId: "company-a",
      deletedAt: null,
      OR: [
        { name: { contains: "needle", mode: "insensitive" } },
        { code: { contains: "needle", mode: "insensitive" } }
      ]
    };
    expect(repository.list).toHaveBeenCalledWith({
      where,
      skip: 12,
      take: 12,
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
    expect(repository.count).toHaveBeenCalledWith(where);
  });
});
