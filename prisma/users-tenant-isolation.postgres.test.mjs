// en-GB: Verifies User aggregate isolation and transaction semantics against an explicitly authorised PostgreSQL runtime.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RbacRepository } from "../apps/api/src/modules/rbac/rbac.repository.ts";
import { UsersRepository } from "../apps/api/src/modules/users/users.repository.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required to run the dedicated PostgreSQL regression."
  );
}

describe("User and Role aggregate PostgreSQL integration", () => {
  const scope = `users-aggregate-${randomUUID()}`;
  const state = {};
  let prisma;
  const repository = new UsersRepository(async () => prisma);

  function evidenceSnapshot(value) {
    if (!value || typeof value !== "object") return value;
    return {
      id: value.id,
      displayName: value.displayName,
      deletedAt: value.deletedAt instanceof Date ? value.deletedAt.toISOString() : null,
      roleIds: (value.roleAssignments ?? [])
        .map((assignment) => assignment.roleId ?? assignment.role?.id)
        .filter(Boolean)
        .sort()
    };
  }

  function auditData(entityId, action = "UPDATE") {
    return (before, after) => ({
      companyId: state.companyA.id,
      entityType: "User",
      entityId,
      action,
      before: evidenceSnapshot(before),
      after: evidenceSnapshot(after)
    });
  }

  function rbacContext(requiredControlPermission) {
    return {
      companyId: state.companyA.id,
      actorId: state.rbacActor.id,
      requiredControlPermission,
      auditData: (event) => ({ companyId: state.companyA.id, ...event })
    };
  }

  function delegatedRole(roleId) {
    return {
      roleId,
      roleDelegation: { actorId: state.rbacActor.id }
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

  function lockingRepository(expectedTransactions) {
    let arrivals = 0;
    let releaseTransactions;
    let announceFirstUserLock;
    let announceSecondUserLockAttempt;
    const rendezvous = new Promise((resolve) => {
      releaseTransactions = resolve;
    });
    const firstUserLock = new Promise((resolve) => {
      announceFirstUserLock = resolve;
    });
    const secondUserLockAttempt = new Promise((resolve) => {
      announceSecondUserLockAttempt = resolve;
    });
    let heldUserLocks = 0;
    let blockedUserLockAttempts = 0;
    let secondUserLockCompleted = false;
    let secondBackendPid;
    const watchdog = setTimeout(() => {
      releaseTransactions();
      announceFirstUserLock();
      announceSecondUserLockAttempt();
    }, 2_000);
    return {
      arrivals: () => arrivals,
      heldUserLocks: () => heldUserLocks,
      blockedUserLockAttempts: () => blockedUserLockAttempts,
      dispose: () => {
        clearTimeout(watchdog);
        releaseTransactions();
        announceFirstUserLock();
        announceSecondUserLockAttempt();
      },
      repository: new UsersRepository(async () => ({
        $transaction: (callback) =>
          prisma.$transaction(async (tx) => {
            const transactionNumber = (arrivals += 1);
            if (arrivals === expectedTransactions) releaseTransactions();
            await rendezvous;
            const lockingTx = new Proxy(tx, {
              get(target, property, receiver) {
                if (property !== "$queryRawUnsafe") {
                  return Reflect.get(target, property, receiver);
                }
                return async (query, ...values) => {
                  const userLock =
                    query.includes('FROM "users" AS u') && query.includes("FOR UPDATE OF u, uc");
                  if (!userLock) return target.$queryRawUnsafe(query, ...values);
                  if (transactionNumber === 1) {
                    const result = await target.$queryRawUnsafe(query, ...values);
                    heldUserLocks += 1;
                    announceFirstUserLock();
                    await secondUserLockAttempt;
                    blockedUserLockAttempts = Number(
                      await backendWasBlocked(secondBackendPid, () => secondUserLockCompleted)
                    );
                    return result;
                  }
                  await firstUserLock;
                  const backend = await target.$queryRawUnsafe(
                    'SELECT pg_backend_pid()::int AS "pid"'
                  );
                  secondBackendPid = backend[0].pid;
                  const pending = target.$queryRawUnsafe(query, ...values);
                  announceSecondUserLockAttempt();
                  const result = await pending;
                  secondUserLockCompleted = true;
                  return result;
                };
              }
            });
            return callback(lockingTx);
          })
      }))
    };
  }

  function roleLockRace() {
    let holderReached = false;
    let waitingLockAttempted = false;
    let waitingLockCompleted = false;
    let waitingWasBlocked = false;
    let waitingBackendPid;
    let announceHolder;
    let announceWaitingAttempt;
    const holderReady = new Promise((resolve) => {
      announceHolder = resolve;
    });
    const waitingAttempt = new Promise((resolve) => {
      announceWaitingAttempt = resolve;
    });
    const watchdog = setTimeout(() => {
      announceHolder();
      announceWaitingAttempt();
    }, 2_000);

    return {
      holderReady,
      holderReached: () => holderReached,
      waitingLockAttempted: () => waitingLockAttempted,
      waitingWasBlocked: () => waitingWasBlocked,
      holdUntilWaitingLockIsObserved: async () => {
        holderReached = true;
        announceHolder();
        await waitingAttempt;
        waitingWasBlocked = await backendWasBlocked(waitingBackendPid, () => waitingLockCompleted);
      },
      runWaitingQuery: async (target, query, values) => {
        await holderReady;
        const backend = await target.$queryRawUnsafe('SELECT pg_backend_pid()::int AS "pid"');
        waitingBackendPid = backend[0].pid;
        waitingLockAttempted = true;
        const pending = target.$queryRawUnsafe(query, ...values);
        announceWaitingAttempt();
        try {
          return await pending;
        } finally {
          waitingLockCompleted = true;
        }
      },
      dispose: () => {
        clearTimeout(watchdog);
        announceHolder();
        announceWaitingAttempt();
      }
    };
  }

  function roleMutationRepository(roleId, race) {
    return new RbacRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") {
                return Reflect.get(target, property, receiver);
              }
              return async (query, ...values) => {
                if (query.includes('FROM "roles"') && values[0] === roleId) {
                  return race.runWaitingQuery(target, query, values);
                }
                return target.$queryRawUnsafe(query, ...values);
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function pausedRoleAssignmentRepository(roleId, race) {
    return new RbacRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") {
                return Reflect.get(target, property, receiver);
              }
              return async (query, ...values) => {
                const result = await target.$queryRawUnsafe(query, ...values);
                if (query.includes('FROM "roles"') && values[0] === roleId) {
                  await race.holdUntilWaitingLockIsObserved();
                }
                return result;
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function assignmentAttemptRepository(roleId, race) {
    return new RbacRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") {
                return Reflect.get(target, property, receiver);
              }
              return async (query, ...values) => {
                if (query.includes('FROM "roles"') && values[0] === roleId) {
                  return race.runWaitingQuery(target, query, values);
                }
                return target.$queryRawUnsafe(query, ...values);
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function userDelegationAttemptRepository(roleId, race) {
    return new UsersRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") {
                return Reflect.get(target, property, receiver);
              }
              return async (query, ...values) => {
                if (query.includes('FROM "roles"') && values[0] === roleId) {
                  return race.runWaitingQuery(target, query, values);
                }
                return target.$queryRawUnsafe(query, ...values);
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function pausedRoleMutationRepository(race) {
    return new RbacRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "auditLog") {
                return Reflect.get(target, property, receiver);
              }
              return {
                create: async (args) => {
                  await race.holdUntilWaitingLockIsObserved();
                  return target.auditLog.create(args);
                }
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when SHIFTFLOW_POSTGRES_INTEGRATION=1.");
    }
    assertSafePostgresIntegrationTarget(connectionString, process.env.NODE_ENV, process.env.CI);

    const { PrismaClient } = await import("../generated/prisma/client.js");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    state.companyA = await prisma.company.create({
      data: { name: `${scope}-company-a` }
    });
    state.companyB = await prisma.company.create({
      data: { name: `${scope}-company-b` }
    });
    state.roleInitial = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-role-initial`, scope: "COMPANY" }
    });
    state.roleA = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-role-a`, scope: "COMPANY" }
    });
    state.roleB = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-role-b`, scope: "COMPANY" }
    });
    state.controlRole = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-control-role`, scope: "COMPANY" }
    });
    state.rbacWrite = await prisma.permission.create({
      data: {
        companyId: state.companyA.id,
        resource: "rbac",
        action: "write",
        description: `${scope}-rbac-write`
      }
    });
    state.rbacDelete = await prisma.permission.create({
      data: {
        companyId: state.companyA.id,
        resource: "rbac",
        action: "delete",
        description: `${scope}-rbac-delete`
      }
    });
    state.usersWrite = await prisma.permission.create({
      data: {
        companyId: state.companyA.id,
        resource: "users",
        action: "write",
        description: `${scope}-users-write`
      }
    });
    await prisma.rolePermission.createMany({
      data: [
        {
          companyId: state.companyA.id,
          roleId: state.controlRole.id,
          permissionId: state.rbacWrite.id
        },
        {
          companyId: state.companyA.id,
          roleId: state.controlRole.id,
          permissionId: state.rbacDelete.id
        },
        {
          companyId: state.companyA.id,
          roleId: state.controlRole.id,
          permissionId: state.usersWrite.id
        }
      ]
    });
    state.sharedUser = await prisma.user.create({
      data: {
        email: `${scope}-shared@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "Shared User",
        status: "ACTIVE"
      }
    });
    state.soleUser = await prisma.user.create({
      data: {
        email: `${scope}-sole@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "Sole User",
        status: "ACTIVE"
      }
    });
    state.rbacActor = await prisma.user.create({
      data: {
        email: `${scope}-rbac-actor@shiftflow.local`,
        passwordHash: "not-used-by-this-integration-test",
        displayName: "RBAC Actor",
        status: "ACTIVE"
      }
    });

    await prisma.userCompany.createMany({
      data: [
        { companyId: state.companyA.id, userId: state.sharedUser.id, isDefault: true },
        { companyId: state.companyB.id, userId: state.sharedUser.id },
        { companyId: state.companyA.id, userId: state.soleUser.id, isDefault: true },
        { companyId: state.companyA.id, userId: state.rbacActor.id, isDefault: true }
      ]
    });
    await prisma.userRoleAssignment.create({
      data: {
        companyId: state.companyA.id,
        userId: state.soleUser.id,
        roleId: state.roleInitial.id
      }
    });
    await prisma.userRoleAssignment.create({
      data: {
        companyId: state.companyA.id,
        userId: state.rbacActor.id,
        roleId: state.controlRole.id,
        startsAt: new Date("2000-01-01T00:00:00.000Z")
      }
    });
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;

    const companyIds = [state.companyA?.id, state.companyB?.id].filter(Boolean);
    const userIds = [state.sharedUser?.id, state.soleUser?.id, state.rbacActor?.id].filter(Boolean);
    try {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.userRoleAssignment.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.userCompany.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.role.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.permission.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it("rejects shared identity changes and deletion before any aggregate evidence is written", async () => {
    await expect(
      repository.updateAggregate(
        state.sharedUser.id,
        state.companyA.id,
        { data: { displayName: "Tenant A overwrite" } },
        auditData(state.sharedUser.id)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    await expect(
      repository.updateAggregate(
        state.sharedUser.id,
        state.companyA.id,
        { data: { deletedAt: new Date() }, revokeSessions: true },
        auditData(state.sharedUser.id, "SOFT_DELETE")
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    const [user, auditCount] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: state.sharedUser.id } }),
      prisma.auditLog.count({ where: { entityId: state.sharedUser.id } })
    ]);
    expect(user).toMatchObject({ displayName: "Shared User", deletedAt: null });
    expect(auditCount).toBe(0);
  });

  it("updates and audits a global identity owned by only the current company", async () => {
    await repository.updateAggregate(
      state.soleUser.id,
      state.companyA.id,
      { data: { displayName: "Sole User Updated" } },
      auditData(state.soleUser.id)
    );

    const [user, audits] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: state.soleUser.id } }),
      prisma.auditLog.findMany({
        where: { companyId: state.companyA.id, entityId: state.soleUser.id, action: "UPDATE" },
        orderBy: { createdAt: "asc" }
      })
    ]);
    expect(user.displayName).toBe("Sole User Updated");
    expect(audits).toHaveLength(1);
    const [audit] = audits;
    expect(audit.before).toMatchObject({ id: state.soleUser.id, displayName: "Sole User" });
    expect(audit.after).toMatchObject({
      id: state.soleUser.id,
      displayName: "Sole User Updated"
    });
  });

  it("serialises concurrent permanent company-role replacements", async () => {
    const overlap = lockingRepository(2);
    const auditCountBefore = await prisma.auditLog.count({
      where: { entityId: state.soleUser.id }
    });
    await Promise.all([
      overlap.repository.updateAggregate(
        state.soleUser.id,
        state.companyA.id,
        delegatedRole(state.roleA.id),
        auditData(state.soleUser.id)
      ),
      overlap.repository.updateAggregate(
        state.soleUser.id,
        state.companyA.id,
        delegatedRole(state.roleB.id),
        auditData(state.soleUser.id)
      )
    ]).finally(overlap.dispose);

    const [activeAssignments, auditCountAfter] = await Promise.all([
      prisma.userRoleAssignment.findMany({
        where: {
          companyId: state.companyA.id,
          userId: state.soleUser.id,
          clientId: null,
          teamId: null,
          endsAt: null,
          deletedAt: null,
          startsAt: { lte: new Date() },
          role: { scope: "COMPANY" }
        }
      }),
      prisma.auditLog.count({ where: { entityId: state.soleUser.id } })
    ]);
    expect(overlap.arrivals()).toBe(2);
    expect(overlap.heldUserLocks()).toBe(1);
    expect(overlap.blockedUserLockAttempts()).toBe(1);
    expect(activeAssignments).toHaveLength(1);
    expect([state.roleA.id, state.roleB.id]).toContain(activeAssignments[0].roleId);
    expect(auditCountAfter - auditCountBefore).toBe(2);
  });

  it.each(["UPDATE", "SOFT_DELETE"])(
    "rechecks assignments after waiting for the protected Role mutation lock during %s despite host clock skew",
    async (action) => {
      const role = await prisma.role.create({
        data: {
          companyId: state.companyA.id,
          name: `${scope}-role-race-${action}`,
          scope: "COMPANY"
        }
      });
      const overlap = roleLockRace();
      let assignmentOutcome;
      let mutationOutcome;
      // Only the application clock is skewed; PostgreSQL and barrier timers remain real.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2001-01-01T00:00:00.000Z"));
      try {
        const assignmentRepository = pausedRoleAssignmentRepository(role.id, overlap);
        const assignment = observe(
          assignmentRepository.assignRole(rbacContext("rbac:write"), {
            userId: state.soleUser.id,
            roleId: role.id
          })
        );
        await overlap.holderReady;

        const roleRepository = roleMutationRepository(role.id, overlap);
        const mutation = observe(
          roleRepository.mutateRole(
            rbacContext(action === "UPDATE" ? "rbac:write" : "rbac:delete"),
            role.id,
            action === "UPDATE" ? { scope: "CLIENT" } : { deletedAt: new Date() },
            action
          )
        );
        [assignmentOutcome, mutationOutcome] = await Promise.all([assignment, mutation]);
        expect(Date.now()).toBe(Date.parse("2001-01-01T00:00:00.000Z"));
        expect(assignmentOutcome.value?.startsAt?.getTime()).toBeGreaterThan(Date.now());
      } finally {
        overlap.dispose();
        vi.useRealTimers();
      }
      expect(overlap.holderReached()).toBe(true);
      expect(overlap.waitingLockAttempted()).toBe(true);
      expect(overlap.waitingWasBlocked()).toBe(true);
      expect(() => unwrap(assignmentOutcome)).not.toThrow();
      expect(mutationOutcome.error).toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
      await expect(
        prisma.role.findUniqueOrThrow({ where: { id: role.id } })
      ).resolves.toMatchObject({
        scope: "COMPANY",
        deletedAt: null
      });
      await expect(
        prisma.userRoleAssignment.count({ where: { roleId: role.id, deletedAt: null } })
      ).resolves.toBe(1);
      await expect(prisma.auditLog.count({ where: { entityId: role.id } })).resolves.toBe(0);
    }
  );

  it("rejects an assignment that waited for a protected Role deletion to commit", async () => {
    const role = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-role-delete-race`, scope: "COMPANY" }
    });
    const overlap = roleLockRace();
    const mutationRepository = pausedRoleMutationRepository(overlap);
    const mutation = observe(
      mutationRepository.mutateRole(
        rbacContext("rbac:delete"),
        role.id,
        { deletedAt: new Date() },
        "SOFT_DELETE"
      )
    );
    await overlap.holderReady;

    const assignmentRepository = assignmentAttemptRepository(role.id, overlap);
    const assignment = observe(
      assignmentRepository.assignRole(rbacContext("rbac:write"), {
        userId: state.soleUser.id,
        roleId: role.id
      })
    );

    const [mutationOutcome, assignmentOutcome] = await Promise.all([mutation, assignment]).finally(
      overlap.dispose
    );
    expect(overlap.holderReached()).toBe(true);
    expect(overlap.waitingLockAttempted()).toBe(true);
    expect(overlap.waitingWasBlocked()).toBe(true);
    expect(unwrap(mutationOutcome)).toMatchObject({ id: role.id, deletedAt: expect.any(Date) });
    expect(assignmentOutcome.error).toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    await expect(
      prisma.userRoleAssignment.count({ where: { roleId: role.id, deletedAt: null } })
    ).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { entityId: role.id } })).resolves.toBe(1);
  });

  it("rejects user-profile delegation after a concurrent actor revocation commits", async () => {
    const overlap = roleLockRace();
    const mutationRepository = pausedRoleMutationRepository(overlap);
    let mutationOutcome;
    let delegationOutcome;
    try {
      const mutation = observe(
        mutationRepository.mutateRole(
          rbacContext("rbac:write"),
          state.controlRole.id,
          { isActive: false },
          "UPDATE"
        )
      );
      await overlap.holderReady;

      const delegationRepository = userDelegationAttemptRepository(state.controlRole.id, overlap);
      const delegationAttempt = observe(
        delegationRepository.updateAggregate(
          state.soleUser.id,
          state.companyA.id,
          delegatedRole(state.roleA.id),
          auditData(state.soleUser.id)
        )
      );
      [mutationOutcome, delegationOutcome] = await Promise.all([mutation, delegationAttempt]);
    } finally {
      overlap.dispose();
      await prisma.role.update({ where: { id: state.controlRole.id }, data: { isActive: true } });
    }

    expect(overlap.holderReached()).toBe(true);
    expect(overlap.waitingLockAttempted()).toBe(true);
    expect(overlap.waitingWasBlocked()).toBe(true);
    expect(unwrap(mutationOutcome)).toMatchObject({ id: state.controlRole.id, isActive: false });
    expect(delegationOutcome.error).toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("rejects user-profile delegation after a concurrent target profile change commits", async () => {
    const targetRole = await prisma.role.create({
      data: {
        companyId: state.companyA.id,
        name: `${scope}-target-role-race`,
        scope: "COMPANY"
      }
    });
    const overlap = roleLockRace();
    const mutationRepository = pausedRoleMutationRepository(overlap);
    let mutationOutcome;
    let delegationOutcome;
    try {
      const mutation = observe(
        mutationRepository.mutateRole(
          rbacContext("rbac:write"),
          targetRole.id,
          { scope: "CLIENT" },
          "UPDATE"
        )
      );
      await overlap.holderReady;

      const delegationRepository = userDelegationAttemptRepository(targetRole.id, overlap);
      const delegationAttempt = observe(
        delegationRepository.updateAggregate(
          state.soleUser.id,
          state.companyA.id,
          delegatedRole(targetRole.id),
          auditData(state.soleUser.id)
        )
      );
      [mutationOutcome, delegationOutcome] = await Promise.all([mutation, delegationAttempt]);
    } finally {
      overlap.dispose();
      await prisma.role.update({ where: { id: targetRole.id }, data: { scope: "COMPANY" } });
    }

    expect(overlap.holderReached()).toBe(true);
    expect(overlap.waitingLockAttempted()).toBe(true);
    expect(overlap.waitingWasBlocked()).toBe(true);
    expect(unwrap(mutationOutcome)).toMatchObject({ id: targetRole.id, scope: "CLIENT" });
    expect(delegationOutcome.error).toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
  });

  it("rolls the identity update back when aggregate evidence cannot be persisted", async () => {
    const [userBefore, assignmentsBefore, auditCountBefore] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: state.soleUser.id } }),
      prisma.userRoleAssignment.findMany({
        where: {
          companyId: state.companyA.id,
          userId: state.soleUser.id,
          clientId: null,
          teamId: null,
          endsAt: null,
          deletedAt: null,
          startsAt: { lte: new Date() },
          role: { scope: "COMPANY" }
        },
        orderBy: { id: "asc" }
      }),
      prisma.auditLog.count({ where: { entityId: state.soleUser.id } })
    ]);
    const replacementRoleId =
      assignmentsBefore[0].roleId === state.roleA.id ? state.roleB.id : state.roleA.id;
    let plannedEvidence;

    await expect(
      repository.updateAggregate(
        state.soleUser.id,
        state.companyA.id,
        {
          data: { displayName: "Must Roll Back" },
          ...delegatedRole(replacementRoleId)
        },
        (before, after) => {
          plannedEvidence = {
            before: evidenceSnapshot(before),
            after: evidenceSnapshot(after)
          };
          return {
            companyId: state.companyA.id,
            entityType: "User",
            entityId: state.soleUser.id,
            action: "x".repeat(121),
            ...plannedEvidence
          };
        }
      )
    ).rejects.toBeDefined();

    expect(plannedEvidence.after).toMatchObject({
      id: state.soleUser.id,
      displayName: "Must Roll Back",
      roleIds: [replacementRoleId]
    });

    const [userAfter, assignmentsAfter, auditCountAfter] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: state.soleUser.id } }),
      prisma.userRoleAssignment.findMany({
        where: {
          companyId: state.companyA.id,
          userId: state.soleUser.id,
          clientId: null,
          teamId: null,
          endsAt: null,
          deletedAt: null,
          startsAt: { lte: new Date() },
          role: { scope: "COMPANY" }
        },
        orderBy: { id: "asc" }
      }),
      prisma.auditLog.count({ where: { entityId: state.soleUser.id } })
    ]);
    expect(userAfter.displayName).toBe(userBefore.displayName);
    expect(assignmentsAfter.map(({ id, roleId }) => ({ id, roleId }))).toEqual(
      assignmentsBefore.map(({ id, roleId }) => ({ id, roleId }))
    );
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it("normalises duplicate occurrences of the selected permanent company profile", async () => {
    await prisma.userRoleAssignment.createMany({
      data: [
        {
          companyId: state.companyA.id,
          userId: state.soleUser.id,
          roleId: state.roleA.id,
          startsAt: new Date("2026-09-01T00:00:00.000Z")
        },
        {
          companyId: state.companyA.id,
          userId: state.soleUser.id,
          roleId: state.roleA.id,
          startsAt: new Date("2026-09-01T00:00:01.000Z")
        }
      ]
    });

    await repository.updateAggregate(
      state.soleUser.id,
      state.companyA.id,
      delegatedRole(state.roleA.id),
      auditData(state.soleUser.id)
    );

    const activeAssignments = await prisma.userRoleAssignment.findMany({
      where: {
        companyId: state.companyA.id,
        userId: state.soleUser.id,
        clientId: null,
        teamId: null,
        endsAt: null,
        deletedAt: null,
        startsAt: { lte: new Date() },
        role: { scope: "COMPANY" }
      }
    });
    expect(activeAssignments).toHaveLength(1);
    expect(activeAssignments[0].roleId).toBe(state.roleA.id);
  });
});
