// en-GB: Proves serial report audit preimages and real audit-FK rollback on disposable PostgreSQL.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ReportsRepository } from "../apps/api/src/modules/reports/reports.repository.ts";
import { ReportsService } from "../apps/api/src/modules/reports/reports.service.ts";
import * as prismaAccess from "../apps/api/src/shared/lib/prisma.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required for the report integrity regression."
  );
}
// No client acquisition or fixture write may precede the canonical target guard.
assertSafePostgresIntegrationTarget(process.env.DATABASE_URL, process.env.NODE_ENV, process.env.CI);

function barrier() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return {
    release,
    async wait() {
      let timer;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Report integrity barrier timed out")),
              2_000
            );
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

function observe(operation) {
  return operation.then(
    (value) => ({ value }),
    (error) => ({ error })
  );
}

const json = (value) => JSON.parse(JSON.stringify(value));

describe("Report integrity PostgreSQL integration", () => {
  const scope = `report-integrity-${randomUUID()}`;
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const actorId = randomUUID();
  const absentActorId = randomUUID();
  const teamId = randomUUID();
  const shiftIds = [];
  const reportIds = [];
  let prisma;
  let transactionConnection;

  function request(id, company = companyId) {
    return {
      auth: { id: actorId, email: `${scope}@shiftflow.local`, companyId: company },
      tenant: { companyId: company },
      context: { requestId: `${scope}-${id}`, ipAddress: "127.0.0.1", userAgent: "vitest" },
      query: {}
    };
  }

  async function fixture(status = "DRAFT", deletedAt = null) {
    const shiftId = randomUUID();
    const id = randomUUID();
    shiftIds.push(shiftId);
    reportIds.push(id);
    await prisma.shift.create({
      data: {
        id: shiftId,
        companyId,
        name: `${scope}-${shiftId}`,
        timezone: "UTC",
        startsAt: new Date("2026-07-04T09:00:30.123Z"),
        endsAt: new Date("2026-07-04T17:00:40.987Z")
      }
    });
    return prisma.shiftReport.create({
      data: {
        id,
        companyId,
        shiftId,
        teamId,
        authorId: actorId,
        status,
        deletedAt,
        summary: "Initial summary",
        pendingNotes: "Initial notes",
        metrics: { total: 1 },
        submittedAt: status === "REJECTED" ? new Date("2026-07-04T19:00:00.678Z") : null
      }
    });
  }

  function audits(id) {
    return prisma.auditLog.findMany({ where: { entityType: "ShiftReport", entityId: id } });
  }

  // Preserve BaseRepository's original transaction and AsyncLocalStorage context. Only
  // the explicit audit delegate is wrapped to hold a real mutation or cause a real FK error.
  function instrument(repository, enter, audit) {
    const original = repository.withTransaction.bind(repository);
    repository.withTransaction = (operation) =>
      original(async (bound, transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'");
        if (enter) await enter(bound, transaction);
        const wrapped = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "auditLog") return Reflect.get(target, property, receiver);
            return { create: (args) => audit(target, args) };
          }
        });
        return operation(bound, wrapped);
      });
    return repository;
  }

  async function assertBlocked(firstPid, secondPid) {
    const deadline = performance.now() + 1_500;
    do {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT pg_blocking_pids($1::int) AS "blockers"',
        secondPid
      );
      if (rows[0].blockers.includes(firstPid)) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (performance.now() < deadline);
    throw new Error("The second report backend was not blocked by the first transaction");
  }

  async function race(before, firstOperation, secondOperation, secondSucceeds = true) {
    const ready = [barrier(), barrier()];
    const mutated = barrier();
    const releaseAudit = barrier();
    const pids = [];
    const initial = [];
    const locked = [];
    const mutations = [];
    const operations = [];
    const requests = [request(`first-${before.id}`), request(`second-${before.id}`)];
    const repositories = [0, 1].map((index) => {
      const repository = instrument(
        new ReportsRepository(),
        async (bound, transaction) => {
          pids[index] = (
            await transaction.$queryRawUnsafe('SELECT pg_backend_pid()::int AS "pid"')
          )[0].pid;
          // This generic read deliberately exercises the unmodified native ALS binding.
          initial[index] = await bound.findById(before.id, companyId);
          ready[index].release();
          await ready[1 - index].wait();
          if (index === 1) await mutated.wait();
        },
        async (transaction, args) => {
          mutations[index] = await transaction.shiftReport.findUnique({ where: { id: before.id } });
          if (index === 0) {
            mutated.release();
            await releaseAudit.wait();
          }
          return transaction.auditLog.create(args);
        }
      );
      const originalRead = repository.findForUpdate.bind(repository);
      repository.findForUpdate = async (...args) => {
        const value = await originalRead(...args);
        locked[index] = value;
        return value;
      };
      return repository;
    });

    try {
      operations.push(
        observe(firstOperation(new ReportsService(repositories[0]), requests[0], before.id))
      );
      operations.push(
        observe(secondOperation(new ReportsService(repositories[1]), requests[1], before.id))
      );
      await mutated.wait();
      expect(initial).toEqual([before, before]);
      expect(pids[0]).not.toBe(pids[1]);
      await assertBlocked(pids[0], pids[1]);
      expect(locked[0]).toEqual(before);
      expect(locked[1]).toBeUndefined();
      releaseAudit.release();

      const results = await Promise.all(operations);
      expect(results[0].error).toBeUndefined();
      const first = results[0].value;
      expect(mutations[0]).toEqual(first);
      expect(locked[1]).toEqual(first);
      const events = await audits(before.id);
      expect(events).toHaveLength(secondSucceeds ? 2 : 1);
      const firstAudit = events.find((event) => event.requestId === requests[0].context.requestId);
      expect(firstAudit).toMatchObject({ actorUserId: actorId, companyId, action: "UPDATE" });
      expect(firstAudit.before).toEqual(json(before));
      expect(firstAudit.after).toEqual(json(first));
      if (secondSucceeds) {
        expect(results[1].error).toBeUndefined();
        expect(mutations[1]).toEqual(results[1].value);
        const secondAudit = events.find(
          (event) => event.requestId === requests[1].context.requestId
        );
        expect(secondAudit).toMatchObject({ actorUserId: actorId, companyId, action: "UPDATE" });
        expect(secondAudit.before).toEqual(firstAudit.after);
        expect(secondAudit.after).toEqual(json(results[1].value));
      } else {
        expect(results[1].error).toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
        expect(mutations[1]).toBeUndefined();
      }
      const persisted = await prisma.shiftReport.findUnique({ where: { id: before.id } });
      expect(persisted).toEqual(results[secondSucceeds ? 1 : 0].value);
      return persisted;
    } finally {
      // Drain every held branch before fixture cleanup, including assertion and query failures.
      [...ready, mutated, releaseAudit].forEach((item) => item.release());
      await Promise.all(operations);
    }
  }

  beforeAll(async () => {
    const { PrismaClient } = await import("../generated/prisma/client.js");
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
    });
    // Substitute only the connection seam; transactions, delegates and ALS remain native.
    transactionConnection = vi
      .spyOn(prismaAccess, "withPrismaTransaction")
      .mockImplementation((operation) => prisma.$transaction(operation));
    await prisma.company.create({ data: { id: companyId, name: scope, timezone: "UTC" } });
    await prisma.company.create({
      data: { id: otherCompanyId, name: `${scope}-other`, timezone: "UTC" }
    });
    await prisma.user.create({
      data: {
        id: actorId,
        email: `${scope}@shiftflow.local`,
        displayName: "Report Integrity Actor",
        passwordHash: "not-used-by-this-integration-test",
        status: "ACTIVE"
      }
    });
    await prisma.userCompany.create({ data: { companyId, userId: actorId, isDefault: true } });
    await prisma.team.create({ data: { id: teamId, companyId, name: scope } });
    expect(await prisma.user.findUnique({ where: { id: absentActorId } })).toBeNull();
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.auditLog.deleteMany({
        where: {
          companyId: { in: [companyId, otherCompanyId] },
          entityType: "ShiftReport",
          entityId: { in: reportIds }
        }
      });
      await prisma.shiftReport.deleteMany({ where: { companyId, id: { in: reportIds } } });
      await prisma.shift.deleteMany({ where: { companyId, id: { in: shiftIds } } });
      await prisma.team.deleteMany({ where: { companyId, id: teamId } });
      await prisma.userCompany.deleteMany({ where: { companyId, userId: actorId } });
      await prisma.user.deleteMany({ where: { id: actorId } });
      await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    } finally {
      transactionConnection?.mockRestore();
      await prisma.$disconnect();
    }
  }, 30_000);

  for (const status of ["DRAFT", "REJECTED"]) {
    it(`serialises two ${status} edits into the complete S0 to S1 to S2 audit chain`, async () => {
      const before = await fixture(status);
      const persisted = await race(
        before,
        (service, req, id) => service.update(req, id, { summary: "First edit" }),
        (service, req, id) =>
          service.update(req, id, { pendingNotes: "Second edit", metrics: { total: 2 } })
      );
      expect(persisted).toMatchObject({
        status,
        summary: "First edit",
        pendingNotes: "Second edit",
        metrics: { total: 2 }
      });
    }, 15_000);
  }

  it("submits the updated preimage after a concurrent edit and commits both audits", async () => {
    const before = await fixture();
    const persisted = await race(
      before,
      (service, req, id) => service.update(req, id, { summary: "Ready to submit" }),
      (service, req, id) => service.submit(req, id)
    );
    expect(persisted).toMatchObject({
      status: "SUBMITTED",
      summary: "Ready to submit",
      approvedAt: null,
      approvedById: null
    });
    expect(persisted.submittedAt).toBeInstanceOf(Date);
  }, 15_000);

  it("rejects an edit after a concurrent submission without a second mutation or audit", async () => {
    const before = await fixture();
    const persisted = await race(
      before,
      (service, req, id) => service.submit(req, id),
      (service, req, id) => service.update(req, id, { summary: "Too late" }),
      false
    );
    expect(persisted).toMatchObject({ status: "SUBMITTED", summary: before.summary });
  }, 15_000);

  for (const command of ["update", "submit"]) {
    it(`rolls back the complete report after ${command} encounters a real audit FK failure`, async () => {
      const before = await fixture("REJECTED");
      let observedMutation;
      const repository = instrument(
        new ReportsRepository(),
        undefined,
        async (transaction, args) => {
          observedMutation = await transaction.shiftReport.findUnique({ where: { id: before.id } });
          expect(observedMutation).toMatchObject(
            command === "update"
              ? {
                  status: "REJECTED",
                  summary: "Changed summary",
                  pendingNotes: "Changed notes",
                  metrics: { total: 3 }
                }
              : { status: "SUBMITTED", approvedAt: null, approvedById: null }
          );
          expect(observedMutation).not.toEqual(before);
          expect(await transaction.user.findUnique({ where: { id: absentActorId } })).toBeNull();
          return transaction.auditLog.create({
            ...args,
            data: { ...args.data, actorUserId: absentActorId }
          });
        }
      );
      const service = new ReportsService(repository);
      const result = await observe(
        command === "update"
          ? service.update(request(before.id), before.id, {
              summary: "Changed summary",
              pendingNotes: "Changed notes",
              metrics: { total: 3 }
            })
          : service.submit(request(before.id), before.id)
      );
      expect(observedMutation).toBeDefined();
      expect(result.error).toMatchObject({ code: "P2003" });
      expect(await prisma.shiftReport.findUnique({ where: { id: before.id } })).toEqual(before);
      expect(await audits(before.id)).toEqual([]);
    }, 15_000);
  }

  for (const kind of ["missing", "foreign", "deleted"]) {
    it(`does not return, mutate or audit a ${kind} report in the requested company`, async () => {
      const before = await fixture(
        "DRAFT",
        kind === "deleted" ? new Date("2026-07-06T10:00:00.123Z") : null
      );
      const id = kind === "missing" ? randomUUID() : before.id;
      const company = kind === "foreign" ? otherCompanyId : companyId;
      const repository = new ReportsRepository();
      if (kind === "missing") {
        expect(await prisma.shiftReport.findUnique({ where: { id } })).toBeNull();
        reportIds.push(id);
      }
      await repository.withTransaction(async (bound, transaction) => {
        expect(await bound.findForUpdate(transaction, id, company)).toBeNull();
      });
      await expect(
        new ReportsService(repository).update(request(id, company), id, {
          summary: "Forbidden edit"
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
      expect(await prisma.shiftReport.findUnique({ where: { id: before.id } })).toEqual(before);
      expect(await audits(id)).toEqual([]);
      expect(await audits(before.id)).toEqual([]);
    }, 15_000);
  }
});
