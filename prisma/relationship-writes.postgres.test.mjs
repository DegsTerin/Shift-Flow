// en-GB: Proves relationship-write serialisation and audit rollback against authorised PostgreSQL.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ShiftsRepository } from "../apps/api/src/modules/shifts/shifts.repository.ts";
import { ShiftsService } from "../apps/api/src/modules/shifts/shifts.service.ts";
import { TeamsRepository } from "../apps/api/src/modules/teams/teams.repository.ts";
import { TeamsService } from "../apps/api/src/modules/teams/teams.service.ts";
import * as prismaAccess from "../apps/api/src/shared/lib/prisma.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required to run the dedicated PostgreSQL regression."
  );
}

describe("Historical team membership removal PostgreSQL integration", () => {
  const scope = `team-removal-${randomUUID()}`;
  const actorId = randomUUID();
  const absentActorId = randomUUID();
  const companyIds = [];
  const teamIds = [];
  const userIds = [actorId];
  const deletedAt = new Date("2026-09-03T10:00:00.123Z");
  let prisma;
  let transactionConnection;

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
              timer = setTimeout(() => reject(new Error("Team removal barrier timed out")), 2_000);
            })
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
    };
  }

  const json = (value) => JSON.parse(JSON.stringify(value));
  const observe = (operation) =>
    operation.then(
      (value) => ({ value }),
      (error) => ({ error })
    );

  function request(fixture, label, companyId = fixture.company.id) {
    return {
      auth: { id: actorId, email: `${scope}@shiftflow.local`, companyId },
      tenant: { companyId },
      context: {
        requestId: `${scope}-${fixture.team.id}-${label}`,
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      },
      query: {}
    };
  }

  async function fixture(options = {}) {
    const companyId = randomUUID();
    const teamId = randomUUID();
    const userId = randomUUID();
    companyIds.push(companyId);
    teamIds.push(teamId);
    userIds.push(userId);
    const company = await prisma.company.create({
      data: {
        id: companyId,
        name: `${scope}-${companyId}`,
        status: options.companyStatus ?? "ACTIVE",
        deletedAt: options.companyDeleted ? deletedAt : null
      }
    });
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: `${scope}-${userId}@shiftflow.local`,
        displayName: "Historical Team Member",
        passwordHash: "not-used-by-this-integration-test",
        status: options.userStatus ?? "ACTIVE",
        deletedAt: options.userDeleted ? deletedAt : null
      }
    });
    await prisma.userCompany.create({ data: { companyId, userId: actorId } });
    const membership = await prisma.userCompany.create({
      data: { companyId, userId, deletedAt: options.membershipEnded ? deletedAt : null }
    });
    const team = await prisma.team.create({
      data: {
        id: teamId,
        companyId,
        name: scope,
        deletedAt: options.teamDeleted ? deletedAt : null
      }
    });
    const members = [];
    for (const role of ["MEMBER", "LEADER"].slice(0, options.memberCount ?? 2)) {
      members.push(
        await prisma.teamMember.create({
          data: {
            companyId,
            teamId,
            userId,
            role,
            startsAt: new Date("2026-08-01T09:00:00.123Z"),
            endsAt: new Date("2026-08-31T17:00:00.123Z")
          }
        })
      );
    }
    members.sort((left, right) => left.id.localeCompare(right.id));
    return { company, team, user, membership, members };
  }

  function members(fixture, client = prisma) {
    return client.teamMember.findMany({
      where: { companyId: fixture.company.id, teamId: fixture.team.id, userId: fixture.user.id },
      orderBy: { id: "asc" }
    });
  }

  function audits(fixture, client = prisma) {
    return client.auditLog.findMany({
      where: { companyId: fixture.company.id, teamId: fixture.team.id, entityType: "TeamMember" }
    });
  }

  // Retain the original BaseRepository transaction and ALS; only explicit audit
  // calls are held or made to encounter a real foreign-key violation.
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
    expect(Number.isInteger(firstPid)).toBe(true);
    expect(Number.isInteger(secondPid)).toBe(true);
    expect(secondPid).not.toBe(firstPid);
    const deadline = performance.now() + 1_500;
    do {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT pg_blocking_pids($1::int) AS "blockers"',
        secondPid
      );
      if (rows[0].blockers.includes(firstPid)) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (performance.now() < deadline);
    throw new Error("The second membership backend was not blocked by the first transaction");
  }

  beforeAll(async () => {
    assertSafePostgresIntegrationTarget(
      process.env.DATABASE_URL,
      process.env.NODE_ENV,
      process.env.CI
    );
    const { PrismaClient } = await import("../generated/prisma/client.js");
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
    });
    transactionConnection = vi
      .spyOn(prismaAccess, "withPrismaTransaction")
      .mockImplementation((operation) => prisma.$transaction(operation));
    await prisma.user.create({
      data: {
        id: actorId,
        email: `${scope}@shiftflow.local`,
        displayName: "Team Removal Actor",
        passwordHash: "not-used-by-this-integration-test",
        status: "ACTIVE"
      }
    });
    expect(await prisma.user.findUnique({ where: { id: absentActorId } })).toBeNull();
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.auditLog.deleteMany({
        where: { companyId: { in: companyIds }, teamId: { in: teamIds }, entityType: "TeamMember" }
      });
      await prisma.teamMember.deleteMany({
        where: { companyId: { in: companyIds }, teamId: { in: teamIds }, userId: { in: userIds } }
      });
      await prisma.team.deleteMany({
        where: { companyId: { in: companyIds }, id: { in: teamIds } }
      });
      await prisma.userCompany.deleteMany({
        where: { companyId: { in: companyIds }, userId: { in: userIds } }
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    } finally {
      transactionConnection?.mockRestore();
      await prisma.$disconnect();
    }
  }, 30_000);

  for (const [label, options] of [
    ["invited user", { userStatus: "INVITED" }],
    ["inactive user", { userStatus: "INACTIVE" }],
    ["locked user", { userStatus: "LOCKED" }],
    ["deleted user", { userDeleted: true }],
    ["ended company membership", { membershipEnded: true }]
  ]) {
    it(`removes all historical rows for an ${label} while addition remains forbidden`, async () => {
      const value = await fixture(options);
      const service = new TeamsService(new TeamsRepository(), () => deletedAt);
      await expect(
        service.addMember(request(value, "add"), value.team.id, { userId: value.user.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
      expect(await members(value)).toEqual(value.members);
      expect(await audits(value)).toEqual([]);

      await expect(
        service.removeMember(
          request(value, "remove", value.company.id.toUpperCase()),
          value.team.id.toUpperCase(),
          value.user.id.toUpperCase()
        )
      ).resolves.toEqual({ count: 2 });
      expect(await members(value)).toEqual(
        value.members.map((before) => ({ ...before, deletedAt }))
      );
      const events = await audits(value);
      expect(events).toHaveLength(2);
      for (const before of value.members) {
        const matching = events.filter((event) => event.entityId === before.id);
        expect(matching).toHaveLength(1);
        expect(matching[0]).toMatchObject({
          companyId: value.company.id,
          teamId: value.team.id,
          actorUserId: actorId,
          action: "SOFT_DELETE",
          before: json(before),
          after: json({ ...before, deletedAt })
        });
      }
      await expect(
        service.removeMember(request(value, "again"), value.team.id, value.user.id)
      ).resolves.toEqual({ count: 0 });
      expect(await audits(value)).toHaveLength(2);
      expect(await prisma.user.findUnique({ where: { id: value.user.id } })).toEqual(value.user);
      expect(await prisma.userCompany.findUnique({ where: { id: value.membership.id } })).toEqual(
        value.membership
      );
    }, 15_000);
  }

  for (const kind of [
    "inactive-company",
    "suspended-company",
    "deleted-company",
    "missing-company",
    "deleted-team",
    "missing-team",
    "foreign-company/team"
  ]) {
    it(`rejects removal for ${kind} without changing memberships or audits`, async () => {
      const value = await fixture({
        companyStatus:
          kind === "inactive-company"
            ? "INACTIVE"
            : kind === "suspended-company"
              ? "SUSPENDED"
              : "ACTIVE",
        companyDeleted: kind === "deleted-company",
        teamDeleted: kind === "deleted-team"
      });
      const foreign = kind === "foreign-company/team" ? await fixture() : null;
      const companyId =
        foreign?.company.id ?? (kind === "missing-company" ? randomUUID() : value.company.id);
      const teamId = kind === "missing-team" ? randomUUID() : value.team.id;
      if (kind === "missing-company")
        expect(await prisma.company.findUnique({ where: { id: companyId } })).toBeNull();
      if (kind === "missing-team")
        expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
      await expect(
        new TeamsService(new TeamsRepository(), () => deletedAt).removeMember(
          request(value, "denied", companyId),
          teamId,
          value.user.id
        )
      ).rejects.toMatchObject({
        code: [
          "inactive-company",
          "suspended-company",
          "deleted-company",
          "missing-company"
        ].includes(kind)
          ? "FORBIDDEN"
          : "NOT_FOUND"
      });
      expect(await members(value)).toEqual(value.members);
      expect(await audits(value)).toEqual([]);
      if (foreign) {
        expect(await members(foreign)).toEqual(foreign.members);
        expect(await audits(foreign)).toEqual([]);
      }
    }, 15_000);
  }

  it("returns an audit-free no-op for a user whose memberships belong to another team and tenant", async () => {
    const value = await fixture();
    const foreign = await fixture();
    await expect(
      new TeamsService(new TeamsRepository()).removeMember(
        request(value, "unrelated"),
        value.team.id,
        foreign.user.id
      )
    ).resolves.toEqual({ count: 0 });
    expect(await members(value)).toEqual(value.members);
    expect(await members(foreign)).toEqual(foreign.members);
    expect(await audits(value)).toEqual([]);
    expect(await audits(foreign)).toEqual([]);
  }, 15_000);

  for (const firstKind of ["add", "remove"]) {
    it(`serialises ${firstKind} before the competing membership command on distinct backends`, async () => {
      const value = await fixture({ memberCount: firstKind === "add" ? 0 : 1 });
      const ready = [barrier(), barrier()];
      const mutated = barrier();
      const releaseAudit = barrier();
      const operations = [];
      const pids = [];
      const mutations = [];
      const kinds = firstKind === "add" ? ["add", "remove"] : ["remove", "add"];
      const repositories = [0, 1].map((index) =>
        instrument(
          new TeamsRepository(),
          async (bound, transaction) => {
            pids[index] = (
              await transaction.$queryRawUnsafe('SELECT pg_backend_pid()::int AS "pid"')
            )[0].pid;
            // A generic read proves that the original ALS context remains on this transaction.
            expect(await bound.findById(value.team.id, value.company.id)).toEqual(value.team);
            ready[index].release();
            await ready[1 - index].wait();
            if (index === 1) await mutated.wait();
          },
          async (transaction, args) => {
            mutations[index] = await members(value, transaction);
            if (index === 0) {
              mutated.release();
              await releaseAudit.wait();
            }
            return transaction.auditLog.create(args);
          }
        )
      );
      try {
        for (const index of [0, 1]) {
          const service = new TeamsService(repositories[index], () => deletedAt);
          operations.push(
            observe(
              kinds[index] === "add"
                ? service.addMember(request(value, `add-${index}`), value.team.id, {
                    userId: value.user.id
                  })
                : service.removeMember(
                    request(value, `remove-${index}`),
                    value.team.id,
                    value.user.id
                  )
            )
          );
        }
        await mutated.wait();
        await assertBlocked(pids[0], pids[1]);
        expect(mutations[0]).toHaveLength(1);
        expect(mutations[1]).toBeUndefined();
        releaseAudit.release();
        const results = await Promise.all(operations);
        expect(results.map((result) => result.error)).toEqual([undefined, undefined]);
        const added = results[kinds.indexOf("add")].value;
        expect(results[kinds.indexOf("remove")].value).toEqual({ count: 1 });
        const persisted = await members(value);
        expect(persisted).toEqual(mutations[1]);
        const events = await audits(value);
        expect(events).toHaveLength(2);
        const creation = events.find((event) => event.action === "CREATE");
        const removal = events.find((event) => event.action === "SOFT_DELETE");
        expect(creation).toMatchObject({
          entityId: added.id,
          actorUserId: actorId,
          after: json(added)
        });
        if (firstKind === "add") {
          expect(persisted).toEqual([{ ...added, deletedAt }]);
          expect(removal).toMatchObject({
            entityId: added.id,
            before: creation.after,
            after: json({ ...added, deletedAt })
          });
        } else {
          expect(added.id).not.toBe(value.members[0].id);
          expect(persisted.filter((member) => member.deletedAt === null)).toEqual([added]);
          expect(removal).toMatchObject({
            entityId: value.members[0].id,
            before: json(value.members[0]),
            after: json({ ...value.members[0], deletedAt })
          });
        }
      } finally {
        [...ready, mutated, releaseAudit].forEach((item) => item.release());
        await Promise.all(operations);
      }
    }, 15_000);
  }

  it("rolls back every removed row and the first audit when the second audit has a real actor FK failure", async () => {
    const value = await fixture({ userStatus: "INACTIVE" });
    let auditCalls = 0;
    let observedMutation;
    let observedFirstAudit;
    const repository = instrument(new TeamsRepository(), undefined, async (transaction, args) => {
      auditCalls += 1;
      observedMutation = await members(value, transaction);
      expect(observedMutation).toEqual(value.members.map((before) => ({ ...before, deletedAt })));
      if (auditCalls === 1) return transaction.auditLog.create(args);
      observedFirstAudit = await audits(value, transaction);
      expect(observedFirstAudit).toHaveLength(1);
      expect(await transaction.user.findUnique({ where: { id: absentActorId } })).toBeNull();
      return transaction.auditLog.create({
        ...args,
        data: { ...args.data, actorUserId: absentActorId }
      });
    });
    const outcome = await observe(
      new TeamsService(repository, () => deletedAt).removeMember(
        request(value, "rollback"),
        value.team.id,
        value.user.id
      )
    );
    expect(auditCalls).toBe(2);
    expect(observedMutation).toHaveLength(2);
    expect(observedFirstAudit).toHaveLength(1);
    expect(outcome.error).toMatchObject({ code: "P2003" });
    expect(await members(value)).toEqual(value.members);
    expect(await audits(value)).toEqual([]);
  }, 15_000);
});

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
