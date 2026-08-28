// en-GB: Verifies User aggregate isolation and transaction semantics against an explicitly authorised PostgreSQL runtime.
import { randomUUID } from "node:crypto";
import process from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    return {
      arrivals: () => arrivals,
      heldUserLocks: () => heldUserLocks,
      blockedUserLockAttempts: () => blockedUserLockAttempts,
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
                  const userLock = query.includes('FROM "users"');
                  if (!userLock) return target.$queryRawUnsafe(query, ...values);
                  if (transactionNumber === 1) {
                    const result = await target.$queryRawUnsafe(query, ...values);
                    heldUserLocks += 1;
                    announceFirstUserLock();
                    await secondUserLockAttempt;
                    return result;
                  }
                  await firstUserLock;
                  blockedUserLockAttempts += 1;
                  announceSecondUserLockAttempt();
                  return target.$queryRawUnsafe(query, ...values);
                };
              }
            });
            return callback(lockingTx);
          })
      }))
    };
  }

  function roleMutationRepository(announceLockAttempt) {
    return new RbacRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") {
                return Reflect.get(target, property, receiver);
              }
              return async (query, ...values) => {
                if (query.includes('FROM "roles"')) announceLockAttempt();
                return target.$queryRawUnsafe(query, ...values);
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function pausedRoleAssignmentRepository(announceShareLock, releaseAfterShareLock) {
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
                if (query.includes('FROM "roles"')) {
                  announceShareLock();
                  await releaseAfterShareLock;
                }
                return result;
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function assignmentAttemptRepository(announceLockAttempt) {
    return new RbacRepository(async () => ({
      $transaction: (callback) =>
        prisma.$transaction(async (tx) => {
          const lockingTx = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== "$queryRawUnsafe") {
                return Reflect.get(target, property, receiver);
              }
              return async (query, ...values) => {
                if (query.includes('FROM "roles"')) announceLockAttempt();
                return target.$queryRawUnsafe(query, ...values);
              };
            }
          });
          return callback(lockingTx);
        })
    }));
  }

  function pausedRoleMutationRepository(announceReadyToCommit, releaseCommit) {
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
                  announceReadyToCommit();
                  await releaseCommit;
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

    await prisma.userCompany.createMany({
      data: [
        { companyId: state.companyA.id, userId: state.sharedUser.id, isDefault: true },
        { companyId: state.companyB.id, userId: state.sharedUser.id },
        { companyId: state.companyA.id, userId: state.soleUser.id, isDefault: true }
      ]
    });
    await prisma.userRoleAssignment.create({
      data: {
        companyId: state.companyA.id,
        userId: state.soleUser.id,
        roleId: state.roleInitial.id
      }
    });
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;

    const companyIds = [state.companyA?.id, state.companyB?.id].filter(Boolean);
    const userIds = [state.sharedUser?.id, state.soleUser?.id].filter(Boolean);
    try {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.userRoleAssignment.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.userCompany.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.role.deleteMany({ where: { companyId: { in: companyIds } } });
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
        { roleId: state.roleA.id },
        auditData(state.soleUser.id)
      ),
      overlap.repository.updateAggregate(
        state.soleUser.id,
        state.companyA.id,
        { roleId: state.roleB.id },
        auditData(state.soleUser.id)
      )
    ]);

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

  it("rechecks assignments after waiting for the protected Role mutation lock", async () => {
    const role = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-role-race`, scope: "COMPANY" }
    });
    let announceShareLock;
    let announceMutationAttempt;
    const shareLockAcquired = new Promise((resolve) => {
      announceShareLock = resolve;
    });
    const mutationAttempted = new Promise((resolve) => {
      announceMutationAttempt = resolve;
    });
    const assignmentRepository = pausedRoleAssignmentRepository(
      announceShareLock,
      mutationAttempted
    );
    const assignment = assignmentRepository.assignRole({
      companyId: state.companyA.id,
      userId: state.soleUser.id,
      roleId: role.id
    });
    await shareLockAcquired;

    const roleRepository = roleMutationRepository(announceMutationAttempt);
    const mutation = roleRepository.mutateRole(
      role.id,
      state.companyA.id,
      { scope: "CLIENT" },
      "UPDATE",
      (before, after) => ({
        companyId: state.companyA.id,
        entityType: "Role",
        entityId: role.id,
        action: "UPDATE",
        before,
        after
      })
    );

    await assignment;
    await expect(mutation).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    await expect(prisma.role.findUniqueOrThrow({ where: { id: role.id } })).resolves.toMatchObject({
      scope: "COMPANY",
      deletedAt: null
    });
    await expect(
      prisma.userRoleAssignment.count({ where: { roleId: role.id, deletedAt: null } })
    ).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityId: role.id } })).resolves.toBe(0);
  });

  it("rejects an assignment that waited for a protected Role deletion to commit", async () => {
    const role = await prisma.role.create({
      data: { companyId: state.companyA.id, name: `${scope}-role-delete-race`, scope: "COMPANY" }
    });
    let announceReadyToCommit;
    let announceAssignmentAttempt;
    const readyToCommit = new Promise((resolve) => {
      announceReadyToCommit = resolve;
    });
    const assignmentAttempted = new Promise((resolve) => {
      announceAssignmentAttempt = resolve;
    });
    const mutationRepository = pausedRoleMutationRepository(
      announceReadyToCommit,
      assignmentAttempted
    );
    const mutation = mutationRepository.mutateRole(
      role.id,
      state.companyA.id,
      { deletedAt: new Date() },
      "SOFT_DELETE",
      (before, after) => ({
        companyId: state.companyA.id,
        entityType: "Role",
        entityId: role.id,
        action: "SOFT_DELETE",
        before,
        after
      })
    );
    await readyToCommit;

    const assignmentRepository = assignmentAttemptRepository(announceAssignmentAttempt);
    const assignment = assignmentRepository.assignRole({
      companyId: state.companyA.id,
      userId: state.soleUser.id,
      roleId: role.id
    });

    await expect(mutation).resolves.toMatchObject({ id: role.id, deletedAt: expect.any(Date) });
    await expect(assignment).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    await expect(
      prisma.userRoleAssignment.count({ where: { roleId: role.id, deletedAt: null } })
    ).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { entityId: role.id } })).resolves.toBe(1);
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
        { data: { displayName: "Must Roll Back" }, roleId: replacementRoleId },
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
          roleId: state.roleA.id
        },
        {
          companyId: state.companyA.id,
          userId: state.soleUser.id,
          roleId: state.roleA.id
        }
      ]
    });

    await repository.updateAggregate(
      state.soleUser.id,
      state.companyA.id,
      { roleId: state.roleA.id },
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
