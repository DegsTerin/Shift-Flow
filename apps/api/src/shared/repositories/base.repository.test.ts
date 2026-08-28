// en-GB: Verifies that tenant-scoped writes keep their scope in the atomic database mutation.
import { beforeEach, describe, expect, it, vi } from "vitest";

const delegate = vi.hoisted(() => ({
  update: vi.fn()
}));

vi.mock("../lib/prisma.js", () => ({
  getDelegate: vi.fn().mockResolvedValue(delegate)
}));

import { BaseRepository } from "./base.repository.js";

describe("BaseRepository tenant-scoped updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delegate.update.mockResolvedValue({ id: "resource-a" });
  });

  it("carries company and active-record scope into the atomic update predicate", async () => {
    const repository = new BaseRepository("resource");

    await repository.update("resource-a", { name: "Updated" }, "company-a");

    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: "resource-a", companyId: "company-a", deletedAt: null },
      data: { name: "Updated" }
    });
  });

  it("translates an atomic scoped miss into a bounded not-found error", async () => {
    delegate.update.mockRejectedValueOnce({ code: "P2025" });
    const repository = new BaseRepository("resource");

    await expect(
      repository.update("resource-a", { name: "Updated" }, "company-a")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not mask unrelated persistence failures", async () => {
    const failure = new Error("database unavailable");
    delegate.update.mockRejectedValueOnce(failure);
    const repository = new BaseRepository("resource");

    await expect(repository.update("resource-a", {}, "company-a")).rejects.toBe(failure);
  });
});
