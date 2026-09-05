// en-GB: Proves bounded RBAC delegation, serialisation and rollback against authorised PostgreSQL.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RbacRepository } from "../apps/api/src/modules/rbac/rbac.repository.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required to run the dedicated PostgreSQL regression."
  );
}

describe("RBAC delegation PostgreSQL integration", () => {
  const scope = `rbac-delegation-${randomUUID()}`;
  const state = {};
  let prisma;

  function context(overrides = {}) {
    return {
      companyId: state.company.id,
      actorId: state.actor.id,
      requiredControlPermission: "rbac:write",
      auditData: (event) => ({
        companyId: state.company.id,
        actorUserId: state.actor.id,
        ...event
      }),
      ...overrides
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

  function repositoryWithTransaction(wrap = (transaction) => transaction) {
    return new RbacRepository(async () => ({
      $transaction: (operation) =>
        prisma.$transaction(async (transaction) => operation(wrap(transaction)))
    }));
  }

  function competingRepositories(roleId, afterSecondWasBlocked = async () => {}) {
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
    const first = repositoryWithTransaction(
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
            return async (query, ...values) => {
              const result = await target.$queryRawUnsafe(query, ...values);
              if (query.includes('FROM "roles"') && values[0] === roleId) {
                firstLockHeld = true;
                announceFirstLock();
                await secondAttempt;
                secondWasBlocked = await backendWasBlocked(
                  secondBackendPid,
                  () => secondLockCompleted
                );
                await afterSecondWasBlocked();
              }
              return result;
            };
          }
        })
    );
    const second = repositoryWithTransaction(
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
            return async (query, ...values) => {
              if (query.includes('FROM "roles"') && values[0] === roleId) {
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

  function simultaneousRoleLockRepositories() {
    let arrivals = 0;
    let releaseRoleLocks;
    const roleLocksReady = new Promise((resolve) => {
      releaseRoleLocks = resolve;
    });
    const watchdog = setTimeout(releaseRoleLocks, 2_000);
    const createRepository = () => {
      let reachedFirstRoleLock = false;
      return repositoryWithTransaction(
        (transaction) =>
          new Proxy(transaction, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
              return async (query, ...values) => {
                if (!reachedFirstRoleLock && query.includes('FROM "roles"')) {
                  reachedFirstRoleLock = true;
                  arrivals += 1;
                  if (arrivals === 2) releaseRoleLocks();
                  await roleLocksReady;
                }
                return target.$queryRawUnsafe(query, ...values);
              };
            }
          })
      );
    };
    return {
      first: createRepository(),
      second: createRepository(),
      arrivals: () => arrivals,
      dispose: () => {
        clearTimeout(watchdog);
        releaseRoleLocks();
      }
    };
  }

  function repositoryPausedBeforeRoleLocks() {
    let announcePaused;
    let releaseRoleLocks;
    const paused = new Promise((resolve) => {
      announcePaused = resolve;
    });
    const released = new Promise((resolve) => {
      releaseRoleLocks = resolve;
    });
    const watchdog = setTimeout(() => {
      announcePaused();
      releaseRoleLocks();
    }, 2_000);
    let reachedRoleLocks = false;
    const repository = repositoryWithTransaction(
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
            return async (query, ...values) => {
              if (!reachedRoleLocks && query.includes('FROM "roles"')) {
                reachedRoleLocks = true;
                announcePaused();
                await released;
              }
              return target.$queryRawUnsafe(query, ...values);
            };
          }
        })
    );
    return {
      repository,
      paused,
      release: releaseRoleLocks,
      reachedRoleLocks: () => reachedRoleLocks,
      dispose: () => {
        clearTimeout(watchdog);
        announcePaused();
        releaseRoleLocks();
      }
    };
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
        displayName: "RBAC Test Actor",
        status: "ACTIVE"
      }
    });
    state.target = await prisma.user.create({
      data: {
        email: `${scope}-target@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "RBAC Test Target",
        status: "ACTIVE"
      }
    });
    state.crossActorA = await prisma.user.create({
      data: {
        email: `${scope}-cross-a@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "RBAC Cross Actor A",
        status: "ACTIVE"
      }
    });
    state.crossActorB = await prisma.user.create({
      data: {
        email: `${scope}-cross-b@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "RBAC Cross Actor B",
        status: "ACTIVE"
      }
    });
    await prisma.userCompany.createMany({
      data: [state.actor, state.target, state.crossActorA, state.crossActorB].map(
        (user, index) => ({
          companyId: state.company.id,
          userId: user.id,
          isDefault: index === 0
        })
      )
    });
    state.actorRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-actor-role`, scope: "COMPANY" }
    });
    state.ceilingRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-ceiling-role`, scope: "COMPANY" }
    });
    state.boundedRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-bounded-role`, scope: "COMPANY" }
    });
    state.concurrencyRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-concurrency-role`, scope: "COMPANY" }
    });
    state.secretRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-secret-role`, scope: "COMPANY" }
    });
    state.rollbackRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-rollback-role`, scope: "COMPANY" }
    });
    state.assignmentRollbackRole = await prisma.role.create({
      data: {
        companyId: state.company.id,
        name: `${scope}-assignment-rollback-role`,
        scope: "COMPANY"
      }
    });
    state.expiringAssignmentRole = await prisma.role.create({
      data: {
        companyId: state.company.id,
        name: `${scope}-expiring-assignment-role`,
        scope: "COMPANY"
      }
    });
    state.revocationRole = await prisma.role.create({
      data: { companyId: state.company.id, name: `${scope}-revocation-role`, scope: "COMPANY" }
    });
    state.crossRoleA = await prisma.role.create({
      data: {
        id: `a${randomUUID().slice(1)}`,
        companyId: state.company.id,
        name: `${scope}-cross-role-a`,
        scope: "COMPANY"
      }
    });
    state.crossRoleB = await prisma.role.create({
      data: {
        id: `b${randomUUID().slice(1)}`,
        companyId: state.company.id,
        name: `${scope}-cross-role-b`,
        scope: "COMPANY"
      }
    });
    state.rbacWrite = await prisma.permission.create({
      data: { companyId: state.company.id, resource: "rbac", action: "write" }
    });
    state.usersRead = await prisma.permission.create({
      data: { companyId: state.company.id, resource: "users", action: "read" }
    });
    state.secretsWrite = await prisma.permission.create({
      data: { companyId: state.company.id, resource: "secrets", action: "write" }
    });
    await prisma.rolePermission.createMany({
      data: [
        {
          companyId: state.company.id,
          roleId: state.actorRole.id,
          permissionId: state.rbacWrite.id
        },
        {
          companyId: state.company.id,
          roleId: state.actorRole.id,
          permissionId: state.usersRead.id
        },
        {
          companyId: state.company.id,
          roleId: state.secretRole.id,
          permissionId: state.secretsWrite.id
        },
        {
          companyId: state.company.id,
          roleId: state.boundedRole.id,
          permissionId: state.usersRead.id
        },
        {
          companyId: state.company.id,
          roleId: state.crossRoleA.id,
          permissionId: state.rbacWrite.id
        },
        {
          companyId: state.company.id,
          roleId: state.crossRoleB.id,
          permissionId: state.rbacWrite.id
        }
      ]
    });
    state.actorAssignment = await prisma.userRoleAssignment.create({
      data: {
        companyId: state.company.id,
        userId: state.actor.id,
        roleId: state.actorRole.id
      }
    });
    await prisma.userRoleAssignment.createMany({
      data: [
        {
          companyId: state.company.id,
          userId: state.crossActorA.id,
          roleId: state.crossRoleA.id
        },
        {
          companyId: state.company.id,
          userId: state.crossActorB.id,
          roleId: state.crossRoleB.id
        }
      ]
    });
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (state.company?.id) {
        await prisma.auditLog.deleteMany({ where: { companyId: state.company.id } });
        await prisma.userRoleAssignment.deleteMany({ where: { companyId: state.company.id } });
        await prisma.rolePermission.deleteMany({ where: { companyId: state.company.id } });
        await prisma.role.deleteMany({ where: { companyId: state.company.id } });
        await prisma.permission.deleteMany({ where: { companyId: state.company.id } });
        await prisma.userCompany.deleteMany({ where: { companyId: state.company.id } });
        const userIds = [
          state.actor?.id,
          state.target?.id,
          state.crossActorA?.id,
          state.crossActorB?.id
        ].filter(Boolean);
        if (userIds.length > 0) {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
        await prisma.company.delete({ where: { id: state.company.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it("rejects role delegation outside live authority and the portfolio ceiling", async () => {
    const repository = repositoryWithTransaction();
    await expect(
      repository.assignRole(context(), {
        userId: state.target.id,
        roleId: state.secretRole.id
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    await expect(
      repository.assignRole(context({ portfolioCeiling: ["rbac:write"] }), {
        userId: state.target.id,
        roleId: state.ceilingRole.id
      })
    ).resolves.toMatchObject({ roleId: state.ceilingRole.id });

    const auditCountBefore = await prisma.auditLog.count({
      where: { companyId: state.company.id, entityType: "UserRoleAssignment" }
    });
    await expect(
      repository.assignRole(context({ portfolioCeiling: ["rbac:write"] }), {
        userId: state.target.id,
        roleId: state.boundedRole.id
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: state.boundedRole.id
        }
      })
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { companyId: state.company.id, entityType: "UserRoleAssignment" }
      })
    ).resolves.toBe(auditCountBefore);
  });

  it("enforces exact active role-assignment uniqueness at the database boundary", async () => {
    const exactInterval = {
      companyId: state.company.id,
      userId: state.target.id,
      roleId: state.secretRole.id,
      clientId: null,
      teamId: null,
      startsAt: new Date("2030-01-01T00:00:00.000Z"),
      endsAt: new Date("2030-01-02T00:00:00.000Z")
    };
    const first = await prisma.userRoleAssignment.create({ data: exactInterval });

    await expect(prisma.userRoleAssignment.create({ data: exactInterval })).rejects.toMatchObject({
      code: "P2002"
    });
    await expect(
      prisma.userRoleAssignment.create({
        data: { ...exactInterval, endsAt: new Date("2030-01-03T00:00:00.000Z") }
      })
    ).resolves.toMatchObject({ id: expect.any(String) });
    await prisma.userRoleAssignment.update({
      where: { id: first.id },
      data: { deletedAt: new Date() }
    });
    await expect(prisma.userRoleAssignment.create({ data: exactInterval })).resolves.toMatchObject({
      id: expect.not.stringContaining(first.id)
    });
  });

  it("keeps explicit windows idempotent while allowing a distinct immediate assignment", async () => {
    const repository = repositoryWithTransaction();
    const scheduledData = {
      userId: state.target.id,
      roleId: state.revocationRole.id,
      startsAt: new Date("2031-01-01T00:00:00.000Z"),
      endsAt: new Date("2031-01-02T00:00:00.000Z")
    };

    const scheduled = await repository.assignRole(context(), scheduledData);
    await expect(repository.assignRole(context(), scheduledData)).resolves.toMatchObject({
      id: scheduled.id
    });
    const immediate = await repository.assignRole(context(), {
      userId: state.target.id,
      roleId: state.revocationRole.id
    });

    expect(immediate.id).not.toBe(scheduled.id);
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: state.revocationRole.id,
          deletedAt: null
        }
      })
    ).resolves.toBe(2);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          entityType: "UserRoleAssignment",
          entityId: { in: [scheduled.id, immediate.id] },
          action: "CREATE"
        }
      })
    ).resolves.toBe(2);
  });

  it("rolls a role assignment back when audit persistence fails", async () => {
    const repository = repositoryWithTransaction(
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "auditLog") return Reflect.get(target, property, receiver);
            return {
              create: async () => {
                throw new Error("forced assignment audit failure");
              }
            };
          }
        })
    );

    await expect(
      repository.assignRole(context(), {
        userId: state.target.id,
        roleId: state.assignmentRollbackRole.id
      })
    ).rejects.toThrow("forced assignment audit failure");
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: state.assignmentRollbackRole.id
        }
      })
    ).resolves.toBe(0);
  });

  it("serialises identical permission grants to one mapping and one audit", async () => {
    const overlap = competingRepositories(state.concurrencyRole.id);
    const first = observe(
      overlap.first.assignPermission(context(), state.concurrencyRole.id, state.usersRead.id)
    );
    await overlap.firstLock;
    const second = observe(
      overlap.second.assignPermission(context(), state.concurrencyRole.id, state.usersRead.id)
    );

    const outcomes = await Promise.all([first, second]).finally(overlap.dispose);
    const [firstResult, secondResult] = outcomes.map(unwrap);
    expect(overlap.firstLockHeld()).toBe(true);
    expect(overlap.secondLockAttempted()).toBe(true);
    expect(overlap.secondWasBlocked()).toBe(true);
    expect(firstResult.id).toBe(secondResult.id);
    await expect(
      prisma.rolePermission.count({
        where: { roleId: state.concurrencyRole.id, permissionId: state.usersRead.id }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entityType: "RolePermission", entityId: firstResult.id, action: "CREATE" }
      })
    ).resolves.toBe(1);
  });

  it("serialises equivalent role assignments to one row and one audit", async () => {
    const overlap = competingRepositories(state.concurrencyRole.id);
    const first = observe(
      overlap.first.assignRole(context(), {
        userId: state.target.id,
        roleId: state.concurrencyRole.id
      })
    );
    await overlap.firstLock;
    const second = observe(
      overlap.second.assignRole(context(), {
        userId: state.target.id.toUpperCase(),
        roleId: state.concurrencyRole.id.toUpperCase()
      })
    );

    const outcomes = await Promise.all([first, second]).finally(overlap.dispose);
    const [firstResult, secondResult] = outcomes.map(unwrap);
    expect(overlap.firstLockHeld()).toBe(true);
    expect(overlap.secondLockAttempted()).toBe(true);
    expect(overlap.secondWasBlocked()).toBe(true);
    expect(firstResult.id).toBe(secondResult.id);
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: state.concurrencyRole.id,
          clientId: null,
          teamId: null,
          deletedAt: null
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          entityType: "UserRoleAssignment",
          entityId: firstResult.id,
          action: "CREATE"
        }
      })
    ).resolves.toBe(1);
  });

  it("rejects an assignment that expires while waiting for its role lock", async () => {
    const endsAt = new Date(Date.now() + 300);
    const overlap = competingRepositories(state.expiringAssignmentRole.id, async () => {
      const remaining = endsAt.getTime() - Date.now();
      if (remaining >= 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining + 100));
      }
    });
    const first = observe(
      overlap.first.assignPermission(context(), state.expiringAssignmentRole.id, state.usersRead.id)
    );
    await overlap.firstLock;
    const second = observe(
      overlap.second.assignRole(context(), {
        userId: state.target.id,
        roleId: state.expiringAssignmentRole.id,
        endsAt
      })
    );

    const outcomes = await Promise.all([first, second]).finally(overlap.dispose);
    expect(unwrap(outcomes[0])).toMatchObject({ id: expect.any(String) });
    expect(outcomes[1].error).toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    expect(overlap.firstLockHeld()).toBe(true);
    expect(overlap.secondLockAttempted()).toBe(true);
    expect(overlap.secondWasBlocked()).toBe(true);
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: state.expiringAssignmentRole.id,
          deletedAt: null
        }
      })
    ).resolves.toBe(0);
  });

  it("recognises a winner created after the replay transaction began", async () => {
    const replay = repositoryPausedBeforeRoleLocks();
    const replayed = observe(
      replay.repository.assignRole(context(), {
        userId: state.target.id,
        roleId: state.rollbackRole.id
      })
    );
    await replay.paused;

    const winnerOutcome = await observe(
      repositoryWithTransaction().assignRole(context(), {
        userId: state.target.id,
        roleId: state.rollbackRole.id
      })
    ).finally(replay.release);
    const replayedOutcome = await replayed.finally(replay.dispose);
    const winner = unwrap(winnerOutcome);
    const replayedResult = unwrap(replayedOutcome);

    expect(replay.reachedRoleLocks()).toBe(true);
    expect(replayedResult.id).toBe(winner.id);
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: state.rollbackRole.id,
          deletedAt: null
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          entityType: "UserRoleAssignment",
          entityId: winner.id,
          action: "CREATE"
        }
      })
    ).resolves.toBe(1);
  });

  it("uses one canonical lock order for crossed role assignments with uppercase targets", async () => {
    const overlap = simultaneousRoleLockRepositories();
    const first = observe(
      overlap.first.assignRole(context({ actorId: state.crossActorA.id.toUpperCase() }), {
        userId: state.target.id,
        roleId: state.crossRoleB.id.toUpperCase()
      })
    );
    const second = observe(
      overlap.second.assignRole(context({ actorId: state.crossActorB.id.toUpperCase() }), {
        userId: state.target.id,
        roleId: state.crossRoleA.id.toUpperCase()
      })
    );

    const outcomes = await Promise.all([first, second]).finally(overlap.dispose);
    const results = outcomes.map(unwrap);
    expect(overlap.arrivals()).toBe(2);
    expect(results.map((assignment) => assignment.roleId).sort()).toEqual(
      [state.crossRoleA.id, state.crossRoleB.id].sort()
    );
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          companyId: state.company.id,
          userId: state.target.id,
          roleId: { in: [state.crossRoleA.id, state.crossRoleB.id] },
          deletedAt: null
        }
      })
    ).resolves.toBe(2);
    await expect(
      prisma.auditLog.count({
        where: {
          companyId: state.company.id,
          entityType: "UserRoleAssignment",
          entityId: { in: results.map((assignment) => assignment.id) },
          action: "CREATE"
        }
      })
    ).resolves.toBe(2);
  });

  it("rolls a permission grant back when audit persistence fails", async () => {
    const repository = repositoryWithTransaction(
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

    await expect(
      repository.assignPermission(context(), state.rollbackRole.id, state.usersRead.id)
    ).rejects.toThrow("forced audit failure");
    await expect(
      prisma.rolePermission.count({
        where: { roleId: state.rollbackRole.id, permissionId: state.usersRead.id }
      })
    ).resolves.toBe(0);
  });

  it("rechecks authority after a concurrent assignment revocation commits", async () => {
    let revocationPrepared = false;
    let grantQueryAttempted = false;
    let grantQueryCompleted = false;
    let grantWasBlocked = false;
    let grantBackendPid;
    let announceRevocationReady;
    let announceGrantAttempt;
    const revocationReady = new Promise((resolve) => {
      announceRevocationReady = resolve;
    });
    const grantAttempt = new Promise((resolve) => {
      announceGrantAttempt = resolve;
    });
    const watchdog = setTimeout(() => {
      announceRevocationReady();
      announceGrantAttempt();
    }, 2_000);
    const revocation = observe(
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRawUnsafe(
          'SELECT "id" FROM "user_role_assignments" WHERE "id" = $1::uuid FOR UPDATE',
          state.actorAssignment.id
        );
        await transaction.userRoleAssignment.update({
          where: { id: state.actorAssignment.id },
          data: { deletedAt: new Date() }
        });
        revocationPrepared = true;
        announceRevocationReady();
        await grantAttempt;
        grantWasBlocked = await backendWasBlocked(grantBackendPid, () => grantQueryCompleted);
      })
    );
    await revocationReady;

    const repository = repositoryWithTransaction(
      (transaction) =>
        new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== "$queryRawUnsafe") return Reflect.get(target, property, receiver);
            return async (query, ...values) => {
              if (query.includes('FROM "user_role_assignments"')) {
                const backend = await target.$queryRawUnsafe(
                  'SELECT pg_backend_pid()::int AS "pid"'
                );
                grantBackendPid = backend[0].pid;
                grantQueryAttempted = true;
                const pending = target.$queryRawUnsafe(query, ...values);
                announceGrantAttempt();
                const result = await pending;
                grantQueryCompleted = true;
                return result;
              }
              return target.$queryRawUnsafe(query, ...values);
            };
          }
        })
    );
    const grant = observe(
      repository.assignPermission(context(), state.revocationRole.id, state.usersRead.id)
    );

    let outcomes;
    try {
      outcomes = await Promise.all([revocation, grant]);
    } finally {
      clearTimeout(watchdog);
      announceRevocationReady();
      announceGrantAttempt();
    }
    unwrap(outcomes[0]);
    expect(outcomes[1].error).toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(revocationPrepared).toBe(true);
    expect(grantQueryAttempted).toBe(true);
    expect(grantWasBlocked).toBe(true);
    await expect(
      prisma.rolePermission.count({
        where: { roleId: state.revocationRole.id, permissionId: state.usersRead.id }
      })
    ).resolves.toBe(0);
    state.actorAssignment = await prisma.userRoleAssignment.update({
      where: { id: state.actorAssignment.id },
      data: { deletedAt: null }
    });
  });
});
