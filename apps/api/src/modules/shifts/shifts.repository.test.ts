// en-GB: Proves tenant-scoped Shift period locks precede the complete row read.
import { describe, expect, it, vi } from "vitest";
import { ShiftsRepository } from "./shifts.repository.js";

describe("ShiftsRepository.findForUpdate", () => {
  it("locks the active Company before reading the locked, non-deleted tenant Shift", async () => {
    const row = { id: "shift-1", startsAt: new Date(0), endsAt: new Date(1), timezone: "UTC" };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: "company-a" }])
      .mockResolvedValueOnce([row]);
    await expect(
      new ShiftsRepository().findForUpdate({ $queryRawUnsafe: query }, "shift-1", "company-a")
    ).resolves.toEqual(row);
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT "id" FROM "companies" WHERE "id" = $1::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE',
      "company-a"
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM "shifts" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
      "shift-1",
      "company-a"
    );
  });

  it("does not read a Shift when the active Company is unavailable", async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    await expect(
      new ShiftsRepository().findForUpdate({ $queryRawUnsafe: query }, "shift-1", "company-a")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(query).toHaveBeenCalledOnce();
  });

  it("returns null for a missing, deleted or other-tenant Shift without an unscoped fallback", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: "company-a" }])
      .mockResolvedValueOnce([]);
    await expect(
      new ShiftsRepository().findForUpdate({ $queryRawUnsafe: query }, "shift-1", "company-a")
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
