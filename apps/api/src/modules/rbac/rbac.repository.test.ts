// en-GB: Verifies that RBAC mutations revalidate delegated authority and audit atomically.
import { describe, expect, it, vi } from "vitest";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { RbacRepository, type RbacCommandContext, type RbacAuditEvent } from "./rbac.repository.js";

type HarnessOptions = {
  actorPermissions?: string[];
  targetPermissions?: string[];
  existingMapping?: Record<string, unknown> & { id: string };
  existingAssignments?: Array<Record<string, unknown> & { id: string }>;
  targetRole?: Partial<Record<string, unknown>>;
  targetRoleAvailable?: boolean;
  assignmentCount?: number;
  auditFailure?: Error;
  companyAvailable?: boolean;
  missingUserIds?: string[];
  statementTimestamp?: Date;
};

const DEFAULT_STATEMENT_TIMESTAMP = new Date("2026-09-03T00:00:00.000Z");

function permissionRow(roleId: string, permission: string, index: number) {
  const [resource, action] = permission.split(":");
  return {
    id: permission === "users:read" ? "permission-a" : `permission-${resource}-${action}`,
    companyId: "company-a",
    resource,
    action,
    roleId,
    rolePermissionId: `${roleId}-mapping-${index}`
  };
}

function context(overrides: Partial<RbacCommandContext> = {}): RbacCommandContext {
  return {
    companyId: "company-a",
    actorId: "actor-a",
    requiredControlPermission: "rbac:write",
    auditData: (event: RbacAuditEvent) => ({
      companyId: "company-a",
      actorUserId: "actor-a",
      ...event
    }),
    ...overrides
  };
}

function harness(options: HarnessOptions = {}) {
  const actorPermissions = options.actorPermissions ?? ["rbac:write", "rbac:delete", "users:read"];
  const targetPermissions = options.targetPermissions ?? ["users:read"];
  const actorRole = {
    id: "actor-role",
    companyId: "company-a",
    name: "Actor role",
    scope: "COMPANY",
    isSystem: false,
    isActive: true
  };
  const targetRole = {
    id: "target-role",
    companyId: "company-a",
    name: "Target role",
    scope: "COMPANY",
    isSystem: false,
    isActive: true,
    ...options.targetRole
  };
  const roles = new Map([
    [actorRole.id, actorRole],
    [targetRole.id, targetRole]
  ]);
  if (options.targetRoleAvailable === false) roles.delete(targetRole.id);
  const permissionsByRole = new Map([
    [
      actorRole.id,
      actorPermissions.map((permission, index) => permissionRow(actorRole.id, permission, index))
    ],
    [
      targetRole.id,
      targetPermissions.map((permission, index) => permissionRow(targetRole.id, permission, index))
    ]
  ]);
  const explicitPermission = permissionRow("explicit", "users:read", 0);

  const query = vi.fn(async (statement: string, ...values: unknown[]) => {
    if (statement.includes("SELECT statement_timestamp()")) {
      return [{ startsAt: options.statementTimestamp ?? DEFAULT_STATEMENT_TIMESTAMP }];
    }
    if (statement.includes('FROM "companies"')) {
      return options.companyAvailable === false ? [] : [{ id: "company-a" }];
    }
    if (statement.includes('FROM "users"')) {
      return options.missingUserIds?.includes(String(values[0])) ? [] : [{ id: String(values[0]) }];
    }
    if (statement.includes('FROM "user_role_assignments" AS ura')) {
      return options.existingAssignments ?? [];
    }
    if (statement.includes('FROM "user_role_assignments"')) {
      return [{ id: "actor-assignment", roleId: actorRole.id }];
    }
    if (statement.includes('FROM "roles"')) {
      const role = roles.get(String(values[0]));
      return role ? [role] : [];
    }
    if (statement.includes('FROM "role_permissions" AS rp')) {
      return permissionsByRole.get(String(values[0])) ?? [];
    }
    if (statement.includes('FROM "permissions"')) return [explicitPermission];
    if (statement.includes('FROM "role_permissions" WHERE')) {
      return options.existingMapping ? [options.existingMapping] : [];
    }
    if (statement.includes('FROM "clients"') || statement.includes('FROM "teams"')) {
      return [{ id: String(values[0]) }];
    }
    throw new Error(`Unexpected SQL in RBAC test: ${statement}`);
  });
  const createRole = vi.fn().mockResolvedValue({ ...targetRole, id: "created-role" });
  const updateRole = vi.fn().mockResolvedValue({ ...targetRole, scope: "CLIENT" });
  const createPermission = vi
    .fn()
    .mockResolvedValue({ ...explicitPermission, id: "created-permission" });
  const createMapping = vi.fn().mockResolvedValue({ id: "created-mapping" });
  const deleteMapping = vi.fn().mockResolvedValue({ count: 1 });
  const countAssignments = vi.fn().mockResolvedValue(options.assignmentCount ?? 0);
  const createAssignment = vi.fn().mockResolvedValue({ id: "created-assignment" });
  const createAudit = options.auditFailure
    ? vi.fn().mockRejectedValue(options.auditFailure)
    : vi.fn().mockResolvedValue({ id: "audit-a" });
  const transaction = {
    $queryRawUnsafe: query,
    role: { create: createRole, update: updateRole },
    permission: { create: createPermission },
    rolePermission: {
      findFirst: vi.fn(),
      create: createMapping,
      deleteMany: deleteMapping
    },
    userRoleAssignment: {
      count: countAssignments,
      create: createAssignment
    },
    auditLog: { create: createAudit }
  };
  const runTransaction = vi.fn(
    async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction)
  );
  const repository = new RbacRepository(async () => ({ $transaction: runTransaction }) as never);

  return {
    repository,
    query,
    createRole,
    updateRole,
    createPermission,
    createMapping,
    deleteMapping,
    countAssignments,
    createAssignment,
    createAudit,
    runTransaction
  };
}

describe("RbacRepository delegated authority", () => {
  it("uses the supplied transaction delegate for live assignment reads", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const transaction = {
      userRoleAssignment: { findMany }
    } as unknown as PrismaTransactionClient;
    const repository = new RbacRepository();

    await expect(
      repository.findAssignmentsForUser("user-a", "company-a", transaction)
    ).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-a", companyId: "company-a" })
      })
    );
  });

  it("locks live company-wide authority before mutating and auditing a role", async () => {
    const state = harness();

    await expect(
      state.repository.mutateRole(context(), "target-role", { scope: "CLIENT" }, "UPDATE")
    ).resolves.toMatchObject({ id: "target-role", scope: "CLIENT" });

    const statements = state.query.mock.calls.map((call) => String(call[0]));
    expect(statements[0]).toContain('FROM "companies"');
    expect(statements[0]).toContain("\"status\" = 'ACTIVE'");
    expect(statements[0]).toContain('"deletedAt" IS NULL');
    expect(statements[0]).toContain("FOR SHARE");
    expect(statements[1]).toContain('FROM "users"');
    expect(statements[1]).toContain('INNER JOIN "user_companies"');
    expect(statements[1]).toContain("FOR SHARE OF u, uc");
    expect(statements[2]).toContain('"clientId" IS NULL');
    expect(statements[2]).toContain('"teamId" IS NULL');
    const roleCalls = state.query.mock.calls.filter((call) =>
      String(call[0]).includes('FROM "roles"')
    );
    expect(roleCalls).toHaveLength(2);
    expect(String(roleCalls.find((call) => call[1] === "actor-role")?.[0])).toContain("FOR SHARE");
    expect(String(roleCalls.find((call) => call[1] === "target-role")?.[0])).toContain(
      "FOR UPDATE"
    );
    expect(state.countAssignments.mock.invocationCallOrder[0]).toBeLessThan(
      state.updateRole.mock.invocationCallOrder[0]
    );
    expect(state.updateRole.mock.invocationCallOrder[0]).toBeLessThan(
      state.createAudit.mock.invocationCallOrder[0]
    );
    expect(state.runTransaction).toHaveBeenCalledOnce();
    expect(state.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "Role",
        entityId: "target-role",
        action: "UPDATE"
      })
    });
  });

  it("rejects a role whose permissions exceed the actor's live authority", async () => {
    const state = harness({ targetPermissions: ["secrets:write"] });

    await expect(
      state.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(state.createAssignment).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
  });

  it("rejects an inactive company, actor or target before any mutation", async () => {
    const company = harness({ companyAvailable: false });
    await expect(
      company.repository.createRole(context(), { name: "Operator" })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(company.createRole).not.toHaveBeenCalled();

    const actor = harness({ missingUserIds: ["actor-a"] });
    await expect(
      actor.repository.createRole(context(), { name: "Operator" })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(actor.createRole).not.toHaveBeenCalled();

    const target = harness({ missingUserIds: ["target-user"] });
    await expect(
      target.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    expect(target.createAssignment).not.toHaveBeenCalled();
  });

  it("requires live control authority and rejects global or cross-company target roles", async () => {
    const noControl = harness({ actorPermissions: ["users:read"] });
    await expect(
      noControl.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });

    for (const targetRole of [
      { companyId: null, scope: "GLOBAL" },
      { companyId: "company-b", scope: "COMPANY" }
    ]) {
      const state = harness({ targetRole });
      await expect(
        state.repository.assignRole(context(), {
          userId: "target-user",
          roleId: "target-role"
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
      expect(state.createAssignment).not.toHaveBeenCalled();
    }
  });

  it("allows wildcard delegation but intersects it with a portfolio ceiling", async () => {
    const allowed = harness({ actorPermissions: ["*:*"], targetPermissions: ["secrets:write"] });
    await expect(
      allowed.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).resolves.toMatchObject({ id: "created-assignment" });
    expect(allowed.createAudit).toHaveBeenCalledOnce();

    const bounded = harness({ actorPermissions: ["*:*"], targetPermissions: ["secrets:write"] });
    await expect(
      bounded.repository.assignRole(context({ portfolioCeiling: ["rbac:write"] }), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(bounded.createAssignment).not.toHaveBeenCalled();
  });

  it("keeps an equivalent active role assignment idempotent and audit-free", async () => {
    const existing = {
      id: "existing-assignment",
      companyId: "company-a",
      userId: "target-user",
      roleId: "target-role",
      clientId: null,
      teamId: null,
      startsAt: new Date("2026-09-02T08:00:00.000Z"),
      endsAt: null
    };
    const state = harness({ existingAssignments: [existing] });

    await expect(
      state.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).resolves.toBe(existing);

    expect(state.createAssignment).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
    const lookup = state.query.mock.calls.find((call) =>
      String(call[0]).includes('FROM "user_role_assignments" AS ura')
    );
    expect(lookup?.slice(1)).toEqual([
      "company-a",
      "target-user",
      "target-role",
      null,
      null,
      null,
      null
    ]);
    expect(
      state.query.mock.calls.some(
        (call) =>
          String(call[0]).includes('FROM "user_role_assignments" AS ura') &&
          String(call[0]).includes("statement_timestamp()") &&
          String(call[0]).includes("LIMIT 2") &&
          String(call[0]).includes("FOR UPDATE")
      )
    ).toBe(true);
  });

  it("rejects ambiguous equivalent active role assignments", async () => {
    const state = harness({
      existingAssignments: [{ id: "assignment-a" }, { id: "assignment-b" }]
    });

    await expect(
      state.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role"
      })
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
    expect(state.createAssignment).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
  });

  it("canonicalises UUID text before deduplicating, ordering and selecting role locks", async () => {
    const state = harness();

    await state.repository.assignRole(context({ companyId: "COMPANY-A", actorId: "ACTOR-A" }), {
      userId: "TARGET-USER",
      roleId: "TARGET-ROLE"
    });

    const userCalls = state.query.mock.calls.filter((call) =>
      String(call[0]).includes('FROM "users"')
    );
    expect(userCalls.map((call) => call[1])).toEqual(["actor-a", "target-user"]);
    const roleCalls = state.query.mock.calls.filter((call) =>
      String(call[0]).includes('FROM "roles"')
    );
    expect(roleCalls.map((call) => call[1])).toEqual(["actor-role", "target-role"]);
    expect(String(roleCalls[0]?.[0])).toContain("FOR SHARE");
    expect(String(roleCalls[1]?.[0])).toContain("FOR UPDATE");
    expect(state.createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-a",
        userId: "target-user",
        roleId: "target-role"
      })
    });
  });

  it("writes scoped role-assignment dimensions into structured audit columns", async () => {
    const state = harness({ targetRole: { scope: "CLIENT" } });
    const startsAt = new Date("2026-09-03T08:00:00.000Z");
    const endsAt = new Date("2026-09-03T16:00:00.000Z");

    await state.repository.assignRole(context(), {
      userId: "target-user",
      roleId: "target-role",
      clientId: "CLIENT-A",
      startsAt,
      endsAt
    });

    expect(state.createAssignment).toHaveBeenCalledWith({
      data: {
        companyId: "company-a",
        userId: "target-user",
        roleId: "target-role",
        clientId: "client-a",
        startsAt,
        endsAt
      }
    });
    expect(state.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "UserRoleAssignment",
        action: "CREATE",
        clientId: "client-a"
      })
    });
  });

  it("allowlists role-assignment fields when the repository is called directly", async () => {
    const state = harness();

    await state.repository.assignRole(context(), {
      id: "attacker-controlled-id",
      companyId: "company-b",
      userId: "target-user",
      roleId: "target-role",
      deletedAt: new Date("2026-09-02T08:00:00.000Z")
    });

    expect(state.createAssignment).toHaveBeenCalledWith({
      data: {
        companyId: "company-a",
        userId: "target-user",
        roleId: "target-role",
        startsAt: DEFAULT_STATEMENT_TIMESTAMP
      }
    });
  });

  it("rejects an omitted start when its end has expired while locks were acquired", async () => {
    const statementTimestamp = new Date("2026-09-03T12:00:00.000Z");
    const state = harness({ statementTimestamp });

    await expect(
      state.repository.assignRole(context(), {
        userId: "target-user",
        roleId: "target-role",
        endsAt: statementTimestamp
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });

    expect(state.createAssignment).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
    expect(
      state.query.mock.calls.some((call) =>
        String(call[0]).includes("SELECT statement_timestamp()")
      )
    ).toBe(true);
  });

  it("keeps an existing permission mapping idempotent and audit-free", async () => {
    const existing = {
      id: "existing-mapping",
      roleId: "target-role",
      permissionId: "permission-a"
    };
    const state = harness({ existingMapping: existing });

    await expect(
      state.repository.assignPermission(context(), "target-role", "permission-a")
    ).resolves.toBe(existing);

    expect(state.createMapping).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
    expect(
      state.query.mock.calls.some(
        (call) =>
          String(call[0]).includes('FROM "role_permissions" WHERE') &&
          String(call[0]).includes("FOR UPDATE")
      )
    ).toBe(true);
  });

  it("preserves the not-found contract for a missing role mutation", async () => {
    const state = harness({ targetRoleAvailable: false });

    await expect(
      state.repository.mutateRole(context(), "target-role", { name: "Changed" }, "UPDATE")
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
    expect(state.updateRole).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
  });

  it("rejects system-role mutation while holding the aggregate lock", async () => {
    const state = harness({ targetRole: { isSystem: true } });

    await expect(
      state.repository.mutateRole(context(), "target-role", { name: "Changed" }, "UPDATE")
    ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    expect(state.updateRole).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
  });

  it("rejects permission changes and duplication for a system role", async () => {
    const state = harness({ targetRole: { isSystem: true } });

    await expect(
      state.repository.assignPermission(context(), "target-role", "permission-a")
    ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    await expect(
      state.repository.removePermission(context(), "target-role", "permission-a")
    ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    await expect(state.repository.duplicateRole(context(), "target-role")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400
    });
    expect(state.createMapping).not.toHaveBeenCalled();
    expect(state.deleteMapping).not.toHaveBeenCalled();
    expect(state.createRole).not.toHaveBeenCalled();
    expect(state.createAudit).not.toHaveBeenCalled();
  });

  it("rejects scope changes when active assignments remain", async () => {
    const state = harness({ assignmentCount: 1 });

    await expect(
      state.repository.mutateRole(context(), "target-role", { scope: "TEAM" }, "UPDATE")
    ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
    expect(state.updateRole).not.toHaveBeenCalled();
  });

  it.each([
    { action: "UPDATE" as const, direction: "behind", hostYear: 2020 },
    { action: "SOFT_DELETE" as const, direction: "behind", hostYear: 2020 },
    { action: "UPDATE" as const, direction: "ahead", hostYear: 2040 },
    { action: "SOFT_DELETE" as const, direction: "ahead", hostYear: 2040 }
  ])(
    "protects active assignments during $action when the host clock is $direction",
    async ({ action, hostYear }) => {
      const statementTimestamp = new Date("2030-01-01T12:00:00.000Z");
      const startsAt = new Date("2030-01-01T11:00:00.000Z");
      const endsAt = new Date("2030-01-01T13:00:00.000Z");
      const state = harness({ statementTimestamp });
      state.countAssignments.mockImplementation(async ({ where }) =>
        Number(startsAt <= where.startsAt.lte && endsAt > where.OR[1].endsAt.gt)
      );
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(`${hostYear}-01-01T00:00:00.000Z`));
      try {
        await expect(
          state.repository.mutateRole(
            context(),
            "target-role",
            action === "UPDATE" ? { scope: "TEAM" } : { deletedAt: new Date() },
            action
          )
        ).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
        expect(state.countAssignments).toHaveBeenCalledWith({
          where: {
            roleId: "target-role",
            companyId: "company-a",
            deletedAt: null,
            startsAt: { lte: statementTimestamp },
            OR: [{ endsAt: null }, { endsAt: { gt: statementTimestamp } }]
          }
        });
        const timestampIndex = state.query.mock.calls.findIndex(([query]) =>
          query.includes("SELECT statement_timestamp()")
        );
        const roleLockIndexes = state.query.mock.calls.flatMap(([query], index) =>
          query.includes('FROM "roles"') ? [index] : []
        );
        expect(timestampIndex).toBeGreaterThan(Math.max(...roleLockIndexes));
        expect(state.query.mock.invocationCallOrder[timestampIndex]).toBeLessThan(
          state.countAssignments.mock.invocationCallOrder[0]
        );
        expect(state.updateRole).not.toHaveBeenCalled();
        expect(state.createAudit).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("propagates audit failure from the same transaction", async () => {
    const auditFailure = new Error("audit unavailable");
    const state = harness({ auditFailure, targetPermissions: [] });

    await expect(
      state.repository.assignPermission(context(), "target-role", "permission-a")
    ).rejects.toBe(auditFailure);
    expect(state.createMapping).toHaveBeenCalledOnce();
    expect(state.runTransaction).toHaveBeenCalledOnce();
  });

  it("duplicates a delegable role and all of its permissions in one transaction", async () => {
    const state = harness({ targetPermissions: ["users:read", "rbac:write"] });

    await expect(state.repository.duplicateRole(context(), "target-role")).resolves.toMatchObject({
      id: "created-role"
    });

    expect(state.createRole).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: "company-a", name: "Target role - copia" })
    });
    expect(state.createMapping).toHaveBeenCalledTimes(2);
    expect(state.createAudit).toHaveBeenCalledOnce();
    expect(state.runTransaction).toHaveBeenCalledOnce();
  });
});
