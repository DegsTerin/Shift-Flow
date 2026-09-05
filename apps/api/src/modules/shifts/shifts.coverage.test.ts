// en-GB: Verifies atomic, tenant-scoped and auditable shift coverage creation.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { ShiftsRepository } from "./shifts.repository.js";
import { ShiftsService } from "./shifts.service.js";

const startsAt = new Date("2026-09-02T08:00:00.000Z");
const endsAt = new Date("2026-09-02T16:00:00.000Z");

function coverageData(overrides: Record<string, unknown> = {}) {
  return {
    companyId: "company-a",
    shiftId: "shift-a",
    userId: "user-b",
    replacementForUserId: "user-a",
    type: "SUBSTITUTE",
    startsAt,
    endsAt,
    note: null,
    ...overrides
  };
}

function request(): ApiRequest {
  return {
    auth: { id: "actor-a", email: "actor@example.com", companyId: "company-a" },
    context: { requestId: "request-a", ipAddress: "127.0.0.1", userAgent: "vitest" },
    tenant: { companyId: "company-a" },
    query: {}
  } as unknown as ApiRequest;
}

type CoverageHarnessOptions = {
  company?: boolean;
  missingUser?: string;
  shift?: boolean;
  existing?: Array<Record<string, unknown> & { id: string }>;
};

function coverageHarness(options: CoverageHarnessOptions = {}) {
  const query = vi.fn(async (statement: string, ...values: unknown[]) => {
    if (statement.includes('FROM "companies"')) {
      return options.company === false ? [] : [{ id: "company-a" }];
    }
    if (statement.includes('FROM "users"')) {
      return options.missingUser === values[0] ? [] : [{ id: String(values[0]) }];
    }
    if (statement.includes('FROM "shifts"')) {
      return options.shift === false ? [] : [{ id: "shift-a" }];
    }
    throw new Error(`Unexpected SQL in shift coverage test: ${statement}`);
  });
  const findMany = vi.fn().mockResolvedValue(options.existing ?? []);
  const create = vi.fn().mockResolvedValue({ id: "coverage-a" });
  const transaction = {
    $queryRawUnsafe: query,
    shiftCoverage: { findMany, create }
  } as unknown as PrismaTransactionClient;
  return { query, findMany, create, transaction };
}

describe("ShiftsRepository coverage mutation", () => {
  it("locks sorted active users and the shift before exact duplicate detection", async () => {
    const state = coverageHarness();

    await expect(
      new ShiftsRepository().addCoverageForUpdate(state.transaction, coverageData())
    ).resolves.toEqual({ coverage: { id: "coverage-a" }, created: true });

    const statements = state.query.mock.calls.map((call) => String(call[0]));
    expect(statements).toHaveLength(4);
    expect(statements[0]).toContain('FROM "companies"');
    expect(statements[0]).toContain("\"status\" = 'ACTIVE'");
    expect(statements[0]).toContain('"deletedAt" IS NULL');
    expect(statements[0]).toContain("FOR SHARE");
    expect(state.query.mock.calls[1]?.slice(1)).toEqual(["user-a", "company-a"]);
    expect(state.query.mock.calls[2]?.slice(1)).toEqual(["user-b", "company-a"]);
    expect(statements[1]).toContain('INNER JOIN "user_companies"');
    expect(statements[1]).toContain("u.\"status\" = 'ACTIVE'");
    expect(statements[1]).toContain('uc."deletedAt" IS NULL');
    expect(statements[1]).toContain('u."deletedAt" IS NULL');
    expect(statements[1]).toContain("FOR SHARE OF u, uc");
    expect(statements[3]).toContain('FROM "shifts"');
    expect(statements[3]).toContain('"companyId" = $2::uuid');
    expect(statements[3]).toContain('"deletedAt" IS NULL');
    expect(statements[3]).toContain("FOR UPDATE");
    expect(state.query.mock.invocationCallOrder[3]).toBeLessThan(
      state.findMany.mock.invocationCallOrder[0]
    );
    expect(state.findMany).toHaveBeenCalledWith({
      where: { ...coverageData(), deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2
    });
    expect(state.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      state.create.mock.invocationCallOrder[0]
    );
  });

  it("locks one user once when the covered and replaced identities match", async () => {
    const state = coverageHarness();
    await new ShiftsRepository().addCoverageForUpdate(
      state.transaction,
      coverageData({ userId: "user-a", replacementForUserId: "user-a" })
    );
    expect(state.query).toHaveBeenCalledTimes(3);
    expect(
      state.query.mock.calls.filter((call) => String(call[0]).includes('FROM "users"'))
    ).toHaveLength(1);
  });

  it.each([
    [{ company: false }, coverageData(), "FORBIDDEN", 403, "active company", 1],
    [{ missingUser: "user-a" }, coverageData(), "FORBIDDEN", 403, "User does not belong", 2],
    [{ shift: false }, coverageData(), "NOT_FOUND", 404, "Shift not found", 4]
  ] as const)(
    "fails closed when a coverage reference is unavailable",
    async (options, data, code, statusCode, message, queryCount) => {
      const state = coverageHarness(options);
      await expect(
        new ShiftsRepository().addCoverageForUpdate(state.transaction, data)
      ).rejects.toMatchObject({ code, statusCode, message: expect.stringContaining(message) });
      expect(state.query).toHaveBeenCalledTimes(queryCount);
      expect(state.findMany).not.toHaveBeenCalled();
      expect(state.create).not.toHaveBeenCalled();
    }
  );

  it("is idempotent for one exact active coverage and rejects ambiguous duplicates", async () => {
    const existing = { id: "coverage-a" };
    const one = coverageHarness({ existing: [existing] });
    const many = coverageHarness({ existing: [existing, { id: "coverage-b" }] });
    const repository = new ShiftsRepository();

    await expect(repository.addCoverageForUpdate(one.transaction, coverageData())).resolves.toEqual(
      {
        coverage: existing,
        created: false
      }
    );
    await expect(
      repository.addCoverageForUpdate(many.transaction, coverageData())
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
    expect(one.create).not.toHaveBeenCalled();
    expect(many.create).not.toHaveBeenCalled();
  });

  it.each([
    ["replacementForUserId", "user-c"],
    ["type", "ON_CALL"],
    ["startsAt", new Date("2026-09-02T09:00:00.000Z")],
    ["endsAt", new Date("2026-09-02T17:00:00.000Z")],
    ["note", "Changed note"]
  ])("includes %s in exact active-duplicate matching", async (field, value) => {
    const state = coverageHarness();
    const data = coverageData({ [field]: value });
    await new ShiftsRepository().addCoverageForUpdate(state.transaction, data);
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...data, deletedAt: null } })
    );
  });
});

describe("ShiftsService coverage audit", () => {
  function serviceHarness(result: {
    coverage: Record<string, unknown> & { id: string };
    created: boolean;
  }) {
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-a" });
    const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
    const repository = new ShiftsRepository();
    const addCoverageForUpdate = vi
      .spyOn(repository, "addCoverageForUpdate")
      .mockResolvedValue(result);
    const withTransaction = vi
      .spyOn(repository, "withTransaction")
      .mockImplementation(
        async <T>(
          operation: (
            value: ShiftsRepository,
            valueTransaction: PrismaTransactionClient
          ) => Promise<T>
        ) => operation(repository, transaction)
      );
    return {
      service: new ShiftsService(repository),
      addCoverageForUpdate,
      auditCreate,
      transaction,
      withTransaction
    };
  }

  it("normalises optional fields and audits a newly created coverage", async () => {
    const coverage = { id: "coverage-a", ...coverageData() };
    const state = serviceHarness({ coverage, created: true });

    await state.service.addCoverage(request(), "shift-a", {
      userId: "user-b",
      startsAt,
      endsAt
    });

    expect(state.withTransaction).toHaveBeenCalledOnce();
    expect(state.addCoverageForUpdate).toHaveBeenCalledWith(state.transaction, {
      companyId: "company-a",
      shiftId: "shift-a",
      userId: "user-b",
      replacementForUserId: null,
      type: "REGULAR",
      startsAt,
      endsAt,
      note: null
    });
    expect(state.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "ShiftCoverage",
        entityId: "coverage-a",
        action: "CREATE",
        actorUserId: "actor-a",
        companyId: "company-a",
        shiftId: "shift-a",
        after: coverage
      })
    });
  });

  it.each(["2026-09-02T05:00:00.123-03:00", "2026-09-02t08:00:00.123456789012z"])(
    "normalises %s to milliseconds before the original transaction",
    async (value) => {
      const state = serviceHarness({ coverage: { id: "coverage-a" }, created: true });
      await state.service.addCoverage(request(), "shift-a", {
        userId: "user-b",
        startsAt: value,
        endsAt: "2026-09-02T16:00:00Z"
      });
      expect(state.addCoverageForUpdate).toHaveBeenCalledWith(
        state.transaction,
        expect.objectContaining({ startsAt: new Date("2026-09-02T08:00:00.123Z"), endsAt })
      );
    }
  );

  it("clones finite internal Dates without changing caller objects", async () => {
    const state = serviceHarness({ coverage: { id: "coverage-a" }, created: false });
    await state.service.addCoverage(request(), "shift-a", { userId: "user-b", startsAt, endsAt });
    const data = state.addCoverageForUpdate.mock.calls[0][1];
    expect(data.startsAt).toEqual(startsAt);
    expect(data.startsAt).not.toBe(startsAt);
    expect(data.endsAt).toEqual(endsAt);
    expect(data.endsAt).not.toBe(endsAt);
  });

  it.each([
    undefined,
    null,
    false,
    0,
    {},
    [],
    new Date(NaN),
    "2026-09-02",
    "2026-09-02T08:00",
    "2026-02-30T08:00:00Z",
    "2026-09-02T08:00:60Z"
  ])("rejects untrusted service time %j before locks or audit", async (value) => {
    const state = serviceHarness({ coverage: { id: "coverage-a" }, created: true });
    for (const field of ["startsAt", "endsAt"])
      await expect(
        state.service.addCoverage(request(), "shift-a", {
          userId: "user-b",
          startsAt,
          endsAt,
          [field]: value
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.withTransaction).not.toHaveBeenCalled();
    expect(state.addCoverageForUpdate).not.toHaveBeenCalled();
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it.each(["2026-09-02T08:00:00Z", "2026-09-02T07:00:00Z"])(
    "rejects equal or inverted normalised end %s before its transaction",
    async (value) => {
      const state = serviceHarness({ coverage: { id: "coverage-a" }, created: true });
      await expect(
        state.service.addCoverage(request(), "shift-a", {
          userId: "user-b",
          startsAt: "2026-09-02T05:00:00-03:00",
          endsAt: value
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(state.withTransaction).not.toHaveBeenCalled();
    }
  );

  it("reads coverage with the active tenant and bounded query without a global parent pre-read", async () => {
    const repository = new ShiftsRepository();
    const list = vi
      .spyOn(repository, "listCoverages")
      .mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    const get = vi.spyOn(repository, "findById");
    const req = request();
    req.query = { page: "2", pageSize: "10" };
    await new ShiftsService(repository).listCoverages(req, "shift-a");
    expect(list).toHaveBeenCalledWith("company-a", "shift-a", { page: 2, pageSize: 10 });
    expect(get).not.toHaveBeenCalled();
  });

  it("leaves an exact duplicate audit-free", async () => {
    const state = serviceHarness({
      coverage: { id: "coverage-a", ...coverageData() },
      created: false
    });
    await state.service.addCoverage(request(), "shift-a", {
      userId: "user-b",
      startsAt,
      endsAt
    });
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it("propagates audit failure so the enclosing transaction can roll back", async () => {
    const auditFailure = new Error("audit unavailable");
    const state = serviceHarness({
      coverage: { id: "coverage-a", ...coverageData() },
      created: true
    });
    state.auditCreate.mockRejectedValueOnce(auditFailure);

    await expect(
      state.service.addCoverage(request(), "shift-a", {
        userId: "user-b",
        startsAt,
        endsAt
      })
    ).rejects.toBe(auditFailure);
  });
});
