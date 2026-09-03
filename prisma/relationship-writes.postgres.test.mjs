// en-GB: Proves relationship-write serialisation and audit rollback against authorised PostgreSQL.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ShiftsRepository } from "../apps/api/src/modules/shifts/shifts.repository.ts";
import { ShiftsService } from "../apps/api/src/modules/shifts/shifts.service.ts";
import { TeamsRepository } from "../apps/api/src/modules/teams/teams.repository.ts";
import { TeamsService } from "../apps/api/src/modules/teams/teams.service.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required to run the dedicated PostgreSQL regression."
  );
}

describe("Relationship-write PostgreSQL integration", () => {
  const scope = `relationship-writes-${randomUUID()}`;
  const state = {};
  let prisma;

  function request() {
    return {
      auth: {
        id: state.actor.id,
        email: state.actor.email,
        companyId: state.company.id
      },
      context: { requestId: `${scope}-request`, ipAddress: "127.0.0.1", userAgent: "vitest" },
      tenant: { companyId: state.company.id },
      query: {}
    };
  }

  function observe(promise) {
    return promise.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
  }

  function unwrap(outcome) {
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }

  async function backendWasBlocked(backendPid, completed) {
    if (!Number.isInteger(backendPid)) return false;
    const deadline = performance.now() + 1_500;
    do {
      const blockers = await prisma.$queryRawUnsafe(
        'SELECT cardinality(pg_blocking_pids($1::int))::int AS "blockerCount"',
        backendPid
      );
      if (blockers[0]?.blockerCount > 0 && !completed()) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (performance.now() < deadline);
    return false;
  }

  function transactionBacked(repository, wrap = (transaction) => transaction) {
    repository.withTransaction = (operation) =>
      prisma.$transaction(async (transaction) => operation(repository, wrap(transaction)));
    return repository;
  }

  function competingRepositories(createRepository, parentTable) {
    let firstLockHeld = false;
    let secondLockAttempted = false;
    let secondLockCompleted = false;
    let secondWasBlocked = false;
    let secondBackendPid;
    let announceFirstLock;
    let announceSecondAttempt;
    const firstLock = new Promise((resolve) => {
      announceFirstLock = resolve;
    });
    const secondAttempt = new Promise((resolve) => {
      announceSecondAttempt = resolve;
    });
    const watchdog = setTimeout(() => {
      announceFirstLock();
      announceSecondAttempt();
    }, 2_000);

    const first = transactionBacked(
      createRepository(),
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
            return async (query, ...values) => {
              const result = await target.$queryRawUnsafe(query, ...values);
              if (query.includes(`FROM "${parentTable}"`)) {
                firstLockHeld = true;
                announceFirstLock();
                await secondAttempt;
                secondWasBlocked = await backendWasBlocked(
                  secondBackendPid,
                  () => secondLockCompleted
                );
              }
              return result;
            };
          }
        })
    );
    const second = transactionBacked(
      createRepository(),
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
            return async (query, ...values) => {
              if (query.includes(`FROM "${parentTable}"`)) {
                await firstLock;
                const backend = await target.$queryRawUnsafe(
                  'SELECT pg_backend_pid()::int AS "pid"'
                );
                secondBackendPid = backend[0].pid;
                secondLockAttempted = true;
                const pending = target.$queryRawUnsafe(query, ...values);
                announceSecondAttempt();
                const result = await pending;
                secondLockCompleted = true;
                return result;
              }
              return target.$queryRawUnsafe(query, ...values);
            };
          }
        })
    );
    return {
      first,
      second,
      firstLock,
      firstLockHeld: () => firstLockHeld,
      secondLockAttempted: () => secondLockAttempted,
      secondWasBlocked: () => secondWasBlocked,
      dispose: () => {
        clearTimeout(watchdog);
        announceFirstLock();
        announceSecondAttempt();
      }
    };
  }

  function auditFailing(repository) {
    return transactionBacked(
      repository,
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "auditLog") return Reflect.get(target, property, receiver);
            return {
              create: async () => {
                throw new Error("forced audit failure");
              }
            };
          }
        })
    );
  }

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when SHIFTFLOW_POSTGRES_INTEGRATION=1.");
    }
    assertSafePostgresIntegrationTarget(connectionString, process.env.NODE_ENV, process.env.CI);

    const { PrismaClient } = await import("../generated/prisma/client.js");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    state.company = await prisma.company.create({ data: { name: `${scope}-company` } });
    state.actor = await prisma.user.create({
      data: {
        email: `${scope}-actor@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "Relationship Test Actor",
        status: "ACTIVE"
      }
    });
    state.user = await prisma.user.create({
      data: {
        email: `${scope}-user@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "Relationship Test User",
        status: "ACTIVE"
      }
    });
    await prisma.userCompany.createMany({
      data: [state.actor, state.user].map((user, index) => ({
        companyId: state.company.id,
        userId: user.id,
        isDefault: index === 0
      }))
    });
    state.team = await prisma.team.create({
      data: { companyId: state.company.id, name: `${scope}-team` }
    });
    state.rollbackTeam = await prisma.team.create({
      data: { companyId: state.company.id, name: `${scope}-rollback-team` }
    });
    const startsAt = new Date("2026-09-02T08:00:00.000Z");
    const endsAt = new Date("2026-09-02T16:00:00.000Z");
    state.shift = await prisma.shift.create({
      data: { companyId: state.company.id, name: `${scope}-shift`, startsAt, endsAt }
    });
    state.rollbackShift = await prisma.shift.create({
      data: { companyId: state.company.id, name: `${scope}-rollback-shift`, startsAt, endsAt }
    });
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (state.company?.id) {
        await prisma.auditLog.deleteMany({ where: { companyId: state.company.id } });
        await prisma.shiftCoverage.deleteMany({ where: { companyId: state.company.id } });
        await prisma.teamMember.deleteMany({ where: { companyId: state.company.id } });
        await prisma.shift.deleteMany({ where: { companyId: state.company.id } });
        await prisma.team.deleteMany({ where: { companyId: state.company.id } });
        await prisma.userCompany.deleteMany({ where: { companyId: state.company.id } });
        const userIds = [state.actor?.id, state.user?.id].filter(Boolean);
        if (userIds.length > 0) {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
        await prisma.company.delete({ where: { id: state.company.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it("serialises identical team-member additions to one row and one audit", async () => {
    const overlap = competingRepositories(() => new TeamsRepository(), "teams");
    const first = observe(
      new TeamsService(overlap.first).addMember(request(), state.team.id, {
        userId: state.user.id,
        role: "MEMBER"
      })
    );
    await overlap.firstLock;
    const second = observe(
      new TeamsService(overlap.second).addMember(request(), state.team.id, {
        userId: state.user.id,
        role: "MEMBER"
      })
    );

    const outcomes = await Promise.all([first, second]).finally(overlap.dispose);
    const [firstResult, secondResult] = outcomes.map(unwrap);
    expect(overlap.firstLockHeld()).toBe(true);
    expect(overlap.secondLockAttempted()).toBe(true);
    expect(overlap.secondWasBlocked()).toBe(true);
    expect(firstResult.id).toBe(secondResult.id);
    await expect(
      prisma.teamMember.count({
        where: {
          companyId: state.company.id,
          teamId: state.team.id,
          userId: state.user.id,
          deletedAt: null
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          teamId: state.team.id,
          entityType: "TeamMember",
          entityId: firstResult.id,
          action: "CREATE"
        }
      })
    ).resolves.toBe(1);
  });

  it("rolls team-member creation back when audit persistence fails", async () => {
    const service = new TeamsService(auditFailing(new TeamsRepository()));
    await expect(
      service.addMember(request(), state.rollbackTeam.id, { userId: state.user.id })
    ).rejects.toThrow("forced audit failure");
    await expect(
      prisma.teamMember.count({ where: { teamId: state.rollbackTeam.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          teamId: state.rollbackTeam.id,
          entityType: "TeamMember",
          action: "CREATE"
        }
      })
    ).resolves.toBe(0);
  });

  it("removes every locked duplicate team membership with one timestamp and one audit each", async () => {
    const duplicates = await Promise.all(
      ["MEMBER", "LEADER"].map((role) =>
        prisma.teamMember.create({
          data: {
            companyId: state.company.id,
            teamId: state.rollbackTeam.id,
            userId: state.user.id,
            role
          }
        })
      )
    );
    const deletedAt = new Date("2026-09-03T00:00:00.000Z");
    const service = new TeamsService(transactionBacked(new TeamsRepository()), () => deletedAt);

    await expect(
      service.removeMember(request(), state.rollbackTeam.id, state.user.id)
    ).resolves.toEqual({ count: 2 });
    const removed = await prisma.teamMember.findMany({
      where: { id: { in: duplicates.map((member) => member.id) } },
      orderBy: { id: "asc" }
    });
    expect(removed).toHaveLength(2);
    expect(removed.every((member) => member.deletedAt?.getTime() === deletedAt.getTime())).toBe(
      true
    );
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          teamId: state.rollbackTeam.id,
          entityType: "TeamMember",
          entityId: { in: duplicates.map((member) => member.id) },
          action: "SOFT_DELETE"
        }
      })
    ).resolves.toBe(2);
  });

  it("serialises identical coverage additions to one row and one audit", async () => {
    const overlap = competingRepositories(() => new ShiftsRepository(), "shifts");
    const data = {
      userId: state.user.id,
      startsAt: new Date("2026-09-02T09:00:00.000Z"),
      endsAt: new Date("2026-09-02T15:00:00.000Z")
    };
    const first = observe(
      new ShiftsService(overlap.first).addCoverage(request(), state.shift.id, data)
    );
    await overlap.firstLock;
    const second = observe(
      new ShiftsService(overlap.second).addCoverage(request(), state.shift.id, data)
    );

    const outcomes = await Promise.all([first, second]).finally(overlap.dispose);
    const [firstResult, secondResult] = outcomes.map(unwrap);
    expect(overlap.firstLockHeld()).toBe(true);
    expect(overlap.secondLockAttempted()).toBe(true);
    expect(overlap.secondWasBlocked()).toBe(true);
    expect(firstResult.id).toBe(secondResult.id);
    await expect(
      prisma.shiftCoverage.count({
        where: {
          companyId: state.company.id,
          shiftId: state.shift.id,
          userId: state.user.id,
          deletedAt: null
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          shiftId: state.shift.id,
          entityType: "ShiftCoverage",
          entityId: firstResult.id,
          action: "CREATE"
        }
      })
    ).resolves.toBe(1);
  });

  it("rolls coverage creation back when audit persistence fails", async () => {
    const service = new ShiftsService(auditFailing(new ShiftsRepository()));
    await expect(
      service.addCoverage(request(), state.rollbackShift.id, {
        userId: state.user.id,
        startsAt: new Date("2026-09-02T10:00:00.000Z"),
        endsAt: new Date("2026-09-02T14:00:00.000Z")
      })
    ).rejects.toThrow("forced audit failure");
    await expect(
      prisma.shiftCoverage.count({ where: { shiftId: state.rollbackShift.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          shiftId: state.rollbackShift.id,
          entityType: "ShiftCoverage",
          action: "CREATE"
        }
      })
    ).resolves.toBe(0);
  });
});
