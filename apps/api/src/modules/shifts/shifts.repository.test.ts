// en-GB: Proves tenant-scoped Shift period locks precede the complete row read.
import { describe, expect, it, vi } from "vitest";
import { ShiftsRepository } from "./shifts.repository.js";

const persistence = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../../shared/lib/prisma.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPrisma: vi.fn(async () => ({ $transaction: persistence.transaction }))
}));

describe("ShiftsRepository.listCoverages", () => {
  function snapshot(
    parent: { id: string } | null = { id: "shift-a" },
    items: unknown[] = [],
    total = 0
  ) {
    const shift = { findFirst: vi.fn().mockResolvedValue(parent) };
    const shiftCoverage = {
      findMany: vi.fn().mockResolvedValue(items),
      count: vi.fn().mockResolvedValue(total)
    };
    const transaction = { shift, shiftCoverage };
    persistence.transaction
      .mockReset()
      .mockImplementation(async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      );
    return transaction;
  }

  it("reads parent, public rows and real count using one RepeatableRead client", async () => {
    const rows = [{ id: "coverage-a", user: { id: "historical-user", status: "INACTIVE" } }];
    const tx = snapshot({ id: "shift-a" }, rows, 51);
    await expect(
      new ShiftsRepository().listCoverages("company-a", "shift-a", { page: 2, pageSize: 25 })
    ).resolves.toEqual({ items: rows, total: 51, page: 2, pageSize: 25 });
    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead"
    });
    expect(tx.shift.findFirst).toHaveBeenCalledWith({
      where: { id: "shift-a", companyId: "company-a", deletedAt: null },
      select: { id: true }
    });
    const publicUser = { id: true, email: true, displayName: true, jobTitle: true, status: true };
    expect(tx.shiftCoverage.findMany).toHaveBeenCalledWith({
      where: { companyId: "company-a", shiftId: "shift-a", deletedAt: null },
      skip: 25,
      take: 25,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        shiftId: true,
        userId: true,
        replacementForUserId: true,
        type: true,
        startsAt: true,
        endsAt: true,
        note: true,
        user: { select: publicUser },
        replacementForUser: { select: publicUser }
      }
    });
    expect(tx.shiftCoverage.count).toHaveBeenCalledWith({
      where: { companyId: "company-a", shiftId: "shift-a", deletedAt: null }
    });
    expect(tx.shift.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.shiftCoverage.findMany.mock.invocationCallOrder[0]
    );
    expect(tx.shiftCoverage.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.shiftCoverage.count.mock.invocationCallOrder[0]
    );
  });

  it.each(["missing", "foreign", "deleted"])(
    "does not consult rows or count for a %s parent",
    async () => {
      const tx = snapshot(null);
      await expect(
        new ShiftsRepository().listCoverages("company-a", "shift-a", { page: 1, pageSize: 25 })
      ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
      expect(tx.shiftCoverage.findMany).not.toHaveBeenCalled();
      expect(tx.shiftCoverage.count).not.toHaveBeenCalled();
    }
  );

  it("returns a valid out-of-range page empty without correcting its real total", async () => {
    const tx = snapshot({ id: "shift-a" }, [], 2);
    await expect(
      new ShiftsRepository().listCoverages("company-a", "shift-a", { page: 10000, pageSize: 100 })
    ).resolves.toEqual({ items: [], total: 2, page: 10000, pageSize: 100 });
    expect(tx.shiftCoverage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 999900, take: 100 })
    );
  });

  it("propagates count failure instead of publishing a partial snapshot", async () => {
    const tx = snapshot({ id: "shift-a" }, [{ id: "coverage-a" }]);
    const failure = new Error("Count unavailable");
    tx.shiftCoverage.count.mockRejectedValueOnce(failure);
    await expect(
      new ShiftsRepository().listCoverages("company-a", "shift-a", { page: 1, pageSize: 25 })
    ).rejects.toBe(failure);
  });
});

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
