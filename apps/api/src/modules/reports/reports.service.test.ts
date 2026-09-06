// en-GB: Exercises report lifecycle integrity without a database runtime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import type { DateRangeQuery } from "../../shared/services/date-range.service.js";
import { writeAudit } from "../../shared/services/audit-writer.js";
import type { ReportsRepository } from "./reports.repository.js";
import { ReportsService } from "./reports.service.js";

const dateRanges = vi.hoisted(() => ({
  resolve: vi.fn()
}));

vi.mock("../../shared/services/audit-writer.js", () => ({ writeAudit: vi.fn() }));
vi.mock("../../shared/services/date-range.service.js", () => ({
  resolveDateRange: dateRanges.resolve
}));
vi.mock("../../shared/services/scope.service.js", () => ({
  activeCompanyId: (value: ApiRequest) => value.auth?.companyId,
  assertShiftInCompany: vi.fn().mockResolvedValue(undefined),
  assertTeamInCompany: vi.fn().mockResolvedValue(undefined),
  assertUserInCompany: vi.fn().mockResolvedValue(undefined)
}));

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const reportId = "47ce098b-8a38-4484-a5d1-d0ee4bfb6d45";
const transaction = { marker: "report-transaction" } as unknown as PrismaTransactionClient;
const calendarBounds: DateRangeQuery = {
  from: { kind: "calendar-date", value: "2026-08-01" },
  to: { kind: "calendar-date", value: "2026-08-31" }
};
const instantBounds: DateRangeQuery = {
  from: { kind: "instant", value: "2026-08-01T00:00:00.123Z" },
  to: { kind: "instant", value: "2026-08-31T23:59:59.987Z" }
};

type ReportStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type ReportState = {
  id: string;
  companyId: string;
  status: ReportStatus;
  summary: string;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  approvedById?: string | null;
};

function request() {
  return {
    query: {},
    auth: { id: "user-1", email: "owner@example.com", companyId }
  } as unknown as ApiRequest;
}

function repositoryHarness(initialStatus: ReportStatus, synchroniseFirstTwoReads = false) {
  let report: ReportState = {
    id: reportId,
    companyId,
    status: initialStatus,
    summary: "Initial summary"
  };
  let readCount = 0;
  let releaseReads: () => void = () => undefined;
  const bothReadsReady = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  let transactionCount = 0;
  let lockTail = Promise.resolve();
  const unlock = new Map<PrismaTransactionClient, () => void>();

  const repository = {
    activitySummary: vi.fn().mockResolvedValue({ total: 0, byStatus: [], byPriority: [] }),
    withTransaction: vi.fn(
      async (
        operation: (
          value: ReportsRepository,
          valueTransaction: PrismaTransactionClient
        ) => Promise<unknown>
      ) => {
        const client =
          transactionCount++ === 0 ? transaction : { marker: "concurrent-report-transaction" };
        try {
          return await operation(repository as unknown as ReportsRepository, client);
        } finally {
          unlock.get(client)?.();
          unlock.delete(client);
        }
      }
    ),
    findForUpdate: vi.fn(async (client: PrismaTransactionClient) => {
      const previous = lockTail;
      lockTail = new Promise<void>((resolve) => unlock.set(client, resolve));
      await previous;
      return { ...report };
    }),
    findById: vi.fn(async () => {
      const snapshot = { ...report };
      if (synchroniseFirstTwoReads && readCount < 2) {
        readCount += 1;
        if (readCount === 2) {
          releaseReads();
        }
        await bothReadsReady;
      }
      return snapshot;
    }),
    updateWhenStatus: vi.fn(
      async (
        _transaction: PrismaTransactionClient,
        _id: string,
        _companyId: string,
        expectedStatuses: readonly string[],
        data: Record<string, unknown>
      ) => {
        if (!expectedStatuses.includes(report.status)) {
          return null;
        }
        report = { ...report, ...data } as ReportState;
        return { ...report };
      }
    )
  };

  return {
    repository: repository as unknown as ReportsRepository,
    spies: repository,
    current: () => ({ ...report })
  };
}

beforeEach(() => {
  dateRanges.resolve.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("ReportsService.activitySummary", () => {
  it("preserves inclusive explicit instants from the authenticated range resolver", async () => {
    const gte = new Date("2026-08-01T00:00:00.123Z");
    const lte = new Date("2026-08-31T23:59:59.987Z");
    const activitySummary = vi.fn().mockResolvedValue({ total: 0, byStatus: [], byPriority: [] });
    dateRanges.resolve.mockResolvedValueOnce({ gte, lte });
    const service = new ReportsService({ activitySummary } as unknown as ReportsRepository);

    await service.activitySummary({ ...request(), query: instantBounds } as unknown as ApiRequest);

    expect(dateRanges.resolve).toHaveBeenCalledWith(companyId, instantBounds);
    expect(activitySummary).toHaveBeenCalledWith(
      expect.objectContaining({ companyId, createdAt: { gte, lte } })
    );
  });

  it("wires an exclusive civil upper bound without changing report filters", async () => {
    const gte = new Date("2026-08-01T03:00:00.000Z");
    const lt = new Date("2026-09-01T03:00:00.000Z");
    const activitySummary = vi.fn().mockResolvedValue({ total: 0, byStatus: [], byPriority: [] });
    dateRanges.resolve.mockResolvedValueOnce({ gte, lt });
    const service = new ReportsService({ activitySummary } as unknown as ReportsRepository);

    await service.activitySummary({
      ...request(),
      query: { ...calendarBounds, status: "DONE", teamId: "team-1" }
    } as unknown as ApiRequest);

    expect(dateRanges.resolve).toHaveBeenCalledWith(companyId, calendarBounds);
    expect(activitySummary).toHaveBeenCalledWith({
      companyId,
      deletedAt: null,
      teamId: "team-1",
      status: "DONE",
      createdAt: { gte, lt }
    });
  });

  it("does not query report data when date-range resolution fails closed", async () => {
    const activitySummary = vi.fn();
    dateRanges.resolve.mockRejectedValueOnce(new Error("timezone unavailable"));
    const service = new ReportsService({ activitySummary } as unknown as ReportsRepository);

    await expect(
      service.activitySummary({ ...request(), query: calendarBounds } as unknown as ApiRequest)
    ).rejects.toThrow("timezone unavailable");

    expect(dateRanges.resolve).toHaveBeenCalledWith(companyId, calendarBounds);
    expect(activitySummary).not.toHaveBeenCalled();
  });
});

describe("ReportsService lifecycle", () => {
  it("rejects an empty patch before persistence", async () => {
    const harness = repositoryHarness("DRAFT");
    const service = new ReportsService(harness.repository);

    await expect(service.update(request(), reportId, {})).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });

    expect(harness.spies.withTransaction).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("rejects lifecycle and ownership fields before a generic patch reaches persistence", async () => {
    const harness = repositoryHarness("DRAFT");
    const service = new ReportsService(harness.repository);

    await expect(service.update(request(), reportId, { status: "APPROVED" })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST"
      }
    );
    await expect(
      service.update(request(), reportId, { authorId: "attacker" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });

    expect(harness.spies.withTransaction).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("edits content only while the report is draft or rejected", async () => {
    const harness = repositoryHarness("DRAFT");
    const service = new ReportsService(harness.repository);

    const updated = await service.update(request(), reportId, { summary: "Reviewed content" });

    expect(updated).toMatchObject({ status: "DRAFT", summary: "Reviewed content" });
    expect(harness.spies.findForUpdate).toHaveBeenCalledExactlyOnceWith(
      transaction,
      reportId,
      companyId
    );
    expect(harness.spies.findById).not.toHaveBeenCalled();
    expect(harness.spies.updateWhenStatus).toHaveBeenCalledWith(
      transaction,
      reportId,
      companyId,
      ["DRAFT", "REJECTED"],
      { summary: "Reviewed content" }
    );
    expect(writeAudit).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "ShiftReport", entityId: reportId, action: "UPDATE" }),
      transaction
    );
    expect(harness.spies.findForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      harness.spies.updateWhenStatus.mock.invocationCallOrder[0]
    );
    expect(harness.spies.updateWhenStatus.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(writeAudit).mock.invocationCallOrder[0]
    );
  });

  it("does not edit submitted or approved report content", async () => {
    for (const status of ["SUBMITTED", "APPROVED"] as const) {
      const harness = repositoryHarness(status);
      const service = new ReportsService(harness.repository);

      await expect(
        service.update(request(), reportId, { summary: "Mutated after approval" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(harness.spies.updateWhenStatus).not.toHaveBeenCalled();
    }
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("applies coherent timestamps across submit, reject, resubmit and approve", async () => {
    vi.useFakeTimers();
    const harness = repositoryHarness("DRAFT");
    const service = new ReportsService(harness.repository);

    const firstSubmission = new Date("2026-09-02T10:00:00.000Z");
    vi.setSystemTime(firstSubmission);
    await service.submit(request(), reportId);
    expect(harness.current()).toMatchObject({
      status: "SUBMITTED",
      submittedAt: firstSubmission,
      approvedAt: null,
      approvedById: null
    });

    await service.reject(request(), reportId);
    expect(harness.current()).toMatchObject({
      status: "REJECTED",
      submittedAt: firstSubmission,
      approvedAt: null,
      approvedById: null
    });

    const secondSubmission = new Date("2026-09-02T11:00:00.000Z");
    vi.setSystemTime(secondSubmission);
    await service.submit(request(), reportId);
    expect(harness.current()).toMatchObject({
      status: "SUBMITTED",
      submittedAt: secondSubmission,
      approvedAt: null,
      approvedById: null
    });

    const approvalTime = new Date("2026-09-02T12:00:00.000Z");
    vi.setSystemTime(approvalTime);
    await service.approve(request(), reportId);
    expect(harness.current()).toMatchObject({
      status: "APPROVED",
      submittedAt: secondSubmission,
      approvedAt: approvalTime,
      approvedById: "user-1"
    });
    expect(writeAudit).toHaveBeenCalledTimes(4);
  });

  it("rejects invalid submit, approve and reject transitions without audit", async () => {
    const submitted = new ReportsService(repositoryHarness("SUBMITTED").repository);
    const draft = new ReportsService(repositoryHarness("DRAFT").repository);

    await expect(submitted.submit(request(), reportId)).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
    await expect(draft.approve(request(), reportId)).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
    await expect(draft.reject(request(), reportId)).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("allows exactly one winner and one audit for concurrent approval", async () => {
    const harness = repositoryHarness("SUBMITTED", true);
    const service = new ReportsService(harness.repository);

    const results = await Promise.allSettled([
      service.approve(request(), reportId),
      service.approve(request(), reportId)
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(harness.current().status).toBe("APPROVED");
    expect(writeAudit).toHaveBeenCalledOnce();
  });

  it.each(["DRAFT", "REJECTED"] as const)(
    "serialises the audit chain for two same-status %s edits",
    async (status) => {
      const harness = repositoryHarness(status, true);
      const service = new ReportsService(harness.repository);
      const initial = harness.current();

      const results = await Promise.all([
        service.update(request(), reportId, { summary: "First edit" }),
        service.update(request(), reportId, { summary: "Second edit" })
      ]);

      const events = vi.mocked(writeAudit).mock.calls.map((call) => call[1]);
      expect(events).toHaveLength(2);
      expect(events[0].before).toEqual(initial);
      expect(events[0].after).toEqual(results[0]);
      expect(events[1].before).toEqual(results[0]);
      expect(events[1].after).toEqual(results[1]);
      expect(harness.current()).toEqual(results[1]);
      expect(harness.spies.findForUpdate).toHaveBeenCalledTimes(2);
      expect(harness.spies.findById).not.toHaveBeenCalled();
    }
  );

  it("keeps the unlocked two-read barrier as a stale-preimage counterexample", async () => {
    const harness = repositoryHarness("DRAFT", true);
    const initial = harness.current();
    const snapshots = await Promise.all([
      harness.repository.findById(reportId, companyId),
      harness.repository.findById(reportId, companyId)
    ]);
    await harness.repository.updateWhenStatus(transaction, reportId, companyId, ["DRAFT"], {
      summary: "First edit"
    });
    expect(snapshots).toEqual([initial, initial]);
    expect(snapshots[1]).not.toEqual(harness.current());
  });

  it("revalidates the locked snapshot before an edit after submission", async () => {
    const harness = repositoryHarness("DRAFT");
    const service = new ReportsService(harness.repository);
    const submission = service.submit(request(), reportId);
    const edit = service.update(request(), reportId, { summary: "Too late" });
    const results = await Promise.allSettled([submission, edit]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "BAD_REQUEST" } });
    expect(harness.spies.updateWhenStatus).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledOnce();
  });

  it("returns not found without mutation or audit when the locked row is absent", async () => {
    const harness = repositoryHarness("DRAFT");
    harness.spies.findForUpdate.mockResolvedValueOnce(null as unknown as ReportState);
    await expect(
      new ReportsService(harness.repository).submit(request(), reportId)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(harness.spies.updateWhenStatus).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("retains the compare-and-swap failure without an audit", async () => {
    const harness = repositoryHarness("DRAFT");
    harness.spies.updateWhenStatus.mockResolvedValueOnce(null);
    await expect(
      new ReportsService(harness.repository).submit(request(), reportId)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Report state changed before the command could be applied"
    });
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("propagates an audit failure and releases the transaction lock in finally", async () => {
    const harness = repositoryHarness("DRAFT");
    const service = new ReportsService(harness.repository);
    vi.mocked(writeAudit).mockRejectedValueOnce(new Error("Audit unavailable"));
    await expect(service.update(request(), reportId, { summary: "First edit" })).rejects.toThrow(
      "Audit unavailable"
    );
    await expect(
      service.update(request(), reportId, { summary: "Next edit" })
    ).resolves.toMatchObject({ summary: "Next edit" });
    // This harness models lock lifetime, not database rollback; the PostgreSQL regression proves rollback.
    expect(harness.spies.findForUpdate).toHaveBeenCalledTimes(2);
  });
});
