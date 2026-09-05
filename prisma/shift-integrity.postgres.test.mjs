// en-GB: Proves Shift period serialisation, lifecycle CAS and real audit-FK rollback on disposable PostgreSQL.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ShiftsRepository } from "../apps/api/src/modules/shifts/shifts.repository.ts";
import { ShiftsService } from "../apps/api/src/modules/shifts/shifts.service.ts";
import * as prismaAccess from "../apps/api/src/shared/lib/prisma.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required for the Shift integrity regression."
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
            timer = setTimeout(() => reject(new Error("Shift integrity barrier timed out")), 2_000);
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

describe("Shift integrity PostgreSQL integration", () => {
  const scope = `shift-integrity-${randomUUID()}`;
  const companyId = randomUUID();
  const actorId = randomUUID();
  const absentActorId = randomUUID();
  const shiftIds = [];
  const startsAt = new Date("2026-07-04T09:00:30.123Z");
  const endsAt = new Date("2026-07-04T17:00:40.987Z");
  const commandTime = new Date("2026-07-05T10:11:12.345Z");
  let prisma;
  let transactionConnection;

  function request(id) {
    return {
      auth: { id: actorId, email: `${scope}@shiftflow.local`, companyId },
      tenant: { companyId },
      context: { requestId: `${scope}-${id}`, ipAddress: "127.0.0.1", userAgent: "vitest" },
      query: {}
    };
  }

  async function fixture(status = "PLANNED") {
    const id = randomUUID();
    shiftIds.push(id);
    return prisma.shift.create({
      data: {
        id,
        companyId,
        name: `${scope}-${id}`,
        timezone: "UTC",
        startsAt,
        endsAt,
        status,
        closedAt: status === "CLOSED" ? new Date("2026-07-04T19:00:00.678Z") : null,
        reopenedAt: status === "REOPENED" ? new Date("2026-07-05T08:09:10.321Z") : null,
        createdById: actorId,
        updatedById: actorId
      }
    });
  }

  function audits(id) {
    return prisma.auditLog.findMany({ where: { companyId, entityType: "Shift", entityId: id } });
  }

  // Only the explicit audit delegate is wrapped. Generic repository operations retain the
  // original bound withTransaction and its native AsyncLocalStorage transaction context.
  function instrument(repository, enter, audit) {
    const original = repository.withTransaction.bind(repository);
    repository.withTransaction = (operation) =>
      original(async (boundRepository, transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'");
        if (enter) await enter(transaction);
        const wrapped = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "auditLog") return Reflect.get(target, property, receiver);
            return { create: (args) => audit(target, args) };
          }
        });
        return operation(boundRepository, wrapped);
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
    throw new Error("The losing PostgreSQL backend was not blocked by the winning transaction");
  }

  async function race(before, firstOperation, secondOperation, lifecycle) {
    const ready = [barrier(), barrier()];
    const read = [barrier(), barrier()];
    const mutated = barrier();
    const releaseAudit = barrier();
    const pids = [];
    const initial = [];
    const mutations = [];
    const operations = [];
    const repositories = [0, 1].map((index) => {
      const repository = instrument(
        new ShiftsRepository(),
        async (transaction) => {
          pids[index] = (
            await transaction.$queryRawUnsafe('SELECT pg_backend_pid()::int AS "pid"')
          )[0].pid;
          initial[index] = await transaction.shift.findUnique({ where: { id: before.id } });
          ready[index].release();
          await ready[1 - index].wait();
          if (!lifecycle && index === 1) await mutated.wait();
        },
        async (transaction, args) => {
          mutations.push(await transaction.shift.findUnique({ where: { id: before.id } }));
          if (index === 0) {
            mutated.release();
            await releaseAudit.wait();
          }
          return transaction.auditLog.create(args);
        }
      );
      if (lifecycle) {
        const originalRead = repository.findById.bind(repository);
        repository.findById = async (...args) => {
          const value = await originalRead(...args);
          expect(value.status).toBe(before.status);
          read[index].release();
          await read[1 - index].wait();
          if (index === 1) await mutated.wait();
          return value;
        };
      }
      return repository;
    });
    try {
      operations.push(
        observe(firstOperation(new ShiftsService(repositories[0], () => commandTime)))
      );
      operations.push(
        observe(secondOperation(new ShiftsService(repositories[1], () => commandTime)))
      );
      await mutated.wait();
      expect(initial).toEqual([before, before]);
      expect(pids[0]).not.toBe(pids[1]);
      await assertBlocked(pids[0], pids[1]);
      releaseAudit.release();
      const results = await Promise.all(operations);
      expect(mutations).toHaveLength(1);
      expect(results[0].error).toBeUndefined();
      expect(results[1].error).toMatchObject({ code: lifecycle ? "CONFLICT" : "BAD_REQUEST" });
      const events = await audits(before.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorUserId: actorId, action: "UPDATE", companyId });
      expect(events[0].before).toEqual(JSON.parse(JSON.stringify(before)));
      const persisted = await prisma.shift.findUnique({ where: { id: before.id } });
      expect(persisted).toEqual(results[0].value);
      expect(events[0].after).toEqual(JSON.parse(JSON.stringify(persisted)));
      return persisted;
    } finally {
      // Release every held branch and settle all promises before fixture cleanup, even on failure.
      [...ready, ...read, mutated, releaseAudit].forEach((item) => item.release());
      await Promise.all(operations);
    }
  }

  beforeAll(async () => {
    const { PrismaClient } = await import("../generated/prisma/client.js");
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
    });
    // Vitest cannot supply the production native-import callback. Substitute only the
    // connection seam; BaseRepository retains its original transaction and async context.
    transactionConnection = vi
      .spyOn(prismaAccess, "withPrismaTransaction")
      .mockImplementation((operation) => prisma.$transaction(operation));
    await prisma.company.create({ data: { id: companyId, name: scope, timezone: "UTC" } });
    await prisma.user.create({
      data: {
        id: actorId,
        email: `${scope}@shiftflow.local`,
        displayName: "Shift Integrity Actor",
        passwordHash: "not-used-by-this-integration-test",
        status: "ACTIVE"
      }
    });
    await prisma.userCompany.create({ data: { companyId, userId: actorId, isDefault: true } });
    expect(await prisma.user.findUnique({ where: { id: absentActorId } })).toBeNull();
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.auditLog.deleteMany({
        where: { companyId, entityType: "Shift", entityId: { in: shiftIds } }
      });
      await prisma.shift.deleteMany({ where: { companyId, id: { in: shiftIds } } });
      await prisma.userCompany.deleteMany({ where: { companyId, userId: actorId } });
      await prisma.user.deleteMany({ where: { id: actorId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    } finally {
      transactionConnection?.mockRestore();
      await prisma.$disconnect();
    }
  }, 30_000);

  for (const firstBound of ["startsAt", "endsAt"]) {
    it(`serialises a partial ${firstBound} winner against an invalid merged period`, async () => {
      const before = await fixture();
      const updates = {
        startsAt: { startsAt: "2026-07-04T16:00:00.456Z" },
        endsAt: { endsAt: "2026-07-04T12:00:00.654Z" }
      };
      const secondBound = firstBound === "startsAt" ? "endsAt" : "startsAt";
      const persisted = await race(
        before,
        (service) => service.update(request(before.id), before.id, updates[firstBound]),
        (service) => service.update(request(before.id), before.id, updates[secondBound]),
        false
      );
      expect(persisted[firstBound]).toEqual(new Date(updates[firstBound][firstBound]));
      expect(persisted[secondBound]).toEqual(before[secondBound]);
      expect(persisted.startsAt.getTime()).toBeLessThan(persisted.endsAt.getTime());
    }, 15_000);
  }

  const commands = [
    { winner: "open", loser: "cancel", prior: "PLANNED", after: "OPEN" },
    { winner: "close", loser: "cancel", prior: "OPEN", after: "CLOSED" },
    { winner: "cancel", loser: "close", prior: "REOPENED", after: "CANCELLED" },
    { winner: "reopen", loser: "reopen", prior: "CLOSED", after: "REOPENED" }
  ];
  for (const command of commands) {
    it(`commits only ${command.winner} and its audit when same-state lifecycle commands compete`, async () => {
      const before = await fixture(command.prior);
      const persisted = await race(
        before,
        (service) => service[command.winner](request(before.id), before.id),
        (service) => service[command.loser](request(before.id), before.id),
        true
      );
      expect(persisted).toMatchObject({
        status: command.after,
        startsAt,
        endsAt,
        closedAt: command.winner === "close" ? commandTime : null,
        reopenedAt: command.winner === "reopen" ? commandTime : before.reopenedAt
      });
    }, 15_000);
  }

  for (const command of ["update", "open", "close", "cancel", "reopen"]) {
    it(`rolls back ${command} after a real audit actor foreign-key violation`, async () => {
      const before = await fixture(command === "reopen" ? "CLOSED" : "PLANNED");
      let observedMutation;
      const repository = instrument(
        new ShiftsRepository(),
        undefined,
        async (transaction, args) => {
          observedMutation = await transaction.shift.findUnique({ where: { id: before.id } });
          expect(observedMutation).toMatchObject({
            startsAt,
            endsAt: command === "update" ? new Date("2026-07-04T19:00:00.987Z") : endsAt,
            status:
              command === "update"
                ? before.status
                : commands.find((item) => item.winner === command).after,
            closedAt: command === "close" ? commandTime : null,
            reopenedAt: command === "reopen" ? commandTime : before.reopenedAt,
            updatedById: actorId
          });
          expect(await transaction.user.findUnique({ where: { id: absentActorId } })).toBeNull();
          // The real delegate causes PostgreSQL's FK failure only after the actual Shift write.
          return transaction.auditLog.create({
            ...args,
            data: { ...args.data, actorUserId: absentActorId }
          });
        }
      );
      const service = new ShiftsService(repository, () => commandTime);
      const operation =
        command === "update"
          ? service.update(request(before.id), before.id, { endsAt: "2026-07-04T19:00:00.987Z" })
          : service[command](request(before.id), before.id);
      const result = await observe(operation);
      expect(observedMutation).toBeDefined();
      expect(result.error).toMatchObject({ code: "P2003" });
      expect(await prisma.shift.findUnique({ where: { id: before.id } })).toEqual(before);
      expect(await audits(before.id)).toEqual([]);
    }, 15_000);
  }
});
