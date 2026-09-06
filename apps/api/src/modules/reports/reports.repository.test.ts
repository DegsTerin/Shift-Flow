// en-GB: Verifies tenant-qualified report locks and native repository transaction binding.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsRepository } from "./reports.repository.js";

const persistence = vi.hoisted(() => ({ transaction: vi.fn(), outsideDelegate: vi.fn() }));
vi.mock("../../shared/lib/prisma.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withPrismaTransaction: persistence.transaction,
  getDelegate: persistence.outsideDelegate
}));

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const reportId = "47ce098b-8a38-4484-a5d1-d0ee4bfb6d45";
const lockSql =
  'SELECT * FROM "shift_reports" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE';

afterEach(() => vi.resetAllMocks());

describe("ReportsRepository.findForUpdate", () => {
  it("binds identifiers as values and returns the complete locked snapshot", async () => {
    const before = {
      id: reportId,
      companyId,
      status: "REJECTED",
      summary: "Before",
      metrics: { total: 2 }
    };
    const transaction = { $queryRawUnsafe: vi.fn().mockResolvedValue([before]) };
    const hostileId = `${reportId}' OR TRUE --`;

    await expect(
      new ReportsRepository().findForUpdate(transaction, hostileId, companyId)
    ).resolves.toBe(before);

    expect(transaction.$queryRawUnsafe).toHaveBeenCalledExactlyOnceWith(
      lockSql,
      hostileId,
      companyId
    );
    expect(lockSql).not.toContain(hostileId);
    expect(lockSql).not.toContain(companyId);
    expect(persistence.outsideDelegate).not.toHaveBeenCalled();
  });

  it.each(["missing", "foreign", "deleted"])("does not return a %s report", async (kind) => {
    const row = {
      id: kind === "missing" ? "another-report" : reportId,
      companyId: kind === "foreign" ? "another-company" : companyId,
      deletedAt: kind === "deleted" ? new Date() : null
    };
    const transaction = {
      $queryRawUnsafe: vi.fn(async (query: string, id: string, company: string) => {
        const visible =
          (!query.includes('"id" = $1::uuid') || row.id === id) &&
          (!query.includes('"companyId" = $2::uuid') || row.companyId === company) &&
          (!query.includes('"deletedAt" IS NULL') || row.deletedAt === null);
        return visible ? [row] : [];
      })
    };

    await expect(
      new ReportsRepository().findForUpdate(transaction, reportId, companyId)
    ).resolves.toBeNull();
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledExactlyOnceWith(
      lockSql,
      reportId,
      companyId
    );
  });

  it("preserves the original transaction and async context through lock, CAS and readback", async () => {
    const before = { id: reportId, companyId, status: "DRAFT", summary: "Before" };
    const after = { ...before, summary: "After" };
    const transaction = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([before]),
      shiftReport: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(after)
      }
    };
    persistence.transaction.mockImplementation(async (operation) => operation(transaction));
    const repository = new ReportsRepository();

    await repository.withTransaction(async (bound, client) => {
      expect(bound).toBe(repository);
      expect(client).toBe(transaction);
      expect(await bound.findForUpdate(client, reportId, companyId)).toBe(before);
      expect(
        await bound.updateWhenStatus(client, reportId, companyId, ["DRAFT", "REJECTED"], {
          summary: "After"
        })
      ).toBe(after);
      await bound.withTransaction(async (nested, nestedClient) => {
        expect(nestedClient).toBe(client);
        expect(await nested.findById(reportId, companyId)).toBe(after);
      });
    });

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(persistence.outsideDelegate).not.toHaveBeenCalled();
    expect(transaction.shiftReport.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: reportId, companyId, deletedAt: null, status: { in: ["DRAFT", "REJECTED"] } },
      data: { summary: "After" }
    });
    expect(transaction.$queryRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.shiftReport.updateMany.mock.invocationCallOrder[0]
    );
    expect(transaction.shiftReport.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.shiftReport.findFirst.mock.invocationCallOrder[0]
    );
  });

  it("does not read back a report after a failed status compare-and-swap", async () => {
    const transaction = {
      shiftReport: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn() }
    };
    await expect(
      new ReportsRepository().updateWhenStatus(transaction, reportId, companyId, ["DRAFT"], {
        summary: "After"
      })
    ).resolves.toBeNull();
    expect(transaction.shiftReport.findFirst).not.toHaveBeenCalled();
  });
});
