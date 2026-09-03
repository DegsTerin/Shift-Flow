// en-GB: Verifies that User identity, membership, permanent profile, sessions and audit share one transaction.
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  lockCompany: vi.fn(),
  lockAuthorityUser: vi.fn(),
  lockUser: vi.fn(),
  lockMemberships: vi.fn(),
  lockRole: vi.fn(),
  lockPermissionGraph: vi.fn(),
  lockAuthorityAssignments: vi.fn(),
  lockAssignments: vi.fn(),
  userCreate: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  userCompanyCreate: vi.fn(),
  assignmentCreate: vi.fn(),
  assignmentFindMany: vi.fn(),
  assignmentUpdateMany: vi.fn(),
  refreshUpdateMany: vi.fn(),
  auditCreate: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getPrisma: vi.fn().mockResolvedValue({ $transaction: persistence.transaction })
}));

import { UsersRepository } from "./users.repository.js";

function transactionClient() {
  return {
    $queryRawUnsafe: persistence.queryRaw,
    user: {
      create: persistence.userCreate,
      findFirst: persistence.userFindFirst,
      update: persistence.userUpdate
    },
    userCompany: { create: persistence.userCompanyCreate },
    userRoleAssignment: {
      create: persistence.assignmentCreate,
      findMany: persistence.assignmentFindMany,
      updateMany: persistence.assignmentUpdateMany
    },
    refreshToken: { updateMany: persistence.refreshUpdateMany },
    auditLog: { create: persistence.auditCreate }
  };
}

const auditData = (before: unknown, after: unknown) => ({
  entityType: "User",
  action: "UPDATE",
  before,
  after
});

const delegation = { actorId: "actor-a" };
const delegatedRole = (roleId: string) => ({ roleId, roleDelegation: delegation });

describe("UsersRepository aggregate mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.lockCompany.mockResolvedValue([{ id: "company-a" }]);
    persistence.lockAuthorityUser.mockResolvedValue([{ id: "actor-a" }]);
    persistence.lockUser.mockResolvedValue([{ id: "user-1", passwordChangedAt: null }]);
    persistence.lockMemberships.mockResolvedValue([{ companyId: "company-a", deletedAt: null }]);
    persistence.lockRole.mockImplementation((_query: string, roleId: string) => [
      {
        id: roleId,
        companyId: "company-a",
        scope: "COMPANY",
        isActive: true
      }
    ]);
    persistence.lockPermissionGraph.mockImplementation((_query: string, roleId: string) =>
      roleId === "actor-role" ? [{ roleId: "actor-role", resource: "*", action: "*" }] : []
    );
    persistence.lockAuthorityAssignments.mockResolvedValue([
      { id: "actor-assignment", roleId: "actor-role" }
    ]);
    persistence.lockAssignments.mockResolvedValue([]);
    persistence.queryRaw.mockImplementation((query: string, ...values: unknown[]) => {
      if (query.includes('FROM "companies"')) {
        return persistence.lockCompany(query, ...values);
      }
      if (query.includes('INNER JOIN "user_companies"')) {
        return persistence.lockAuthorityUser(query, ...values);
      }
      if (query.includes('FROM "user_companies"')) {
        return persistence.lockMemberships(query, ...values);
      }
      if (query.includes('FROM "role_permissions"')) {
        return persistence.lockPermissionGraph(query, ...values);
      }
      if (query.includes('FROM "user_role_assignments"')) {
        if (query.includes('"roleId"') && query.includes("FOR SHARE")) {
          return persistence.lockAuthorityAssignments(query, ...values);
        }
        return persistence.lockAssignments(query, ...values);
      }
      if (query.includes('FROM "roles"')) return persistence.lockRole(query, ...values);
      return persistence.lockUser(query, ...values);
    });
    persistence.userCreate.mockResolvedValue({ id: "user-1", displayName: "Created" });
    persistence.userFindFirst.mockResolvedValue({
      id: "user-1",
      displayName: "Current",
      passwordChangedAt: null,
      roleAssignments: []
    });
    persistence.userUpdate.mockResolvedValue({ id: "user-1", displayName: "Updated" });
    persistence.assignmentFindMany.mockResolvedValue([]);
    persistence.transaction.mockImplementation(
      async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
        callback(transactionClient())
    );
  });

  it("creates the identity, membership, permanent profile and audit in one transaction", async () => {
    const repository = new UsersRepository();
    const createAudit = vi.fn((_before: unknown, after: unknown) => ({
      entityType: "User",
      entityId: (after as { id: string }).id,
      action: "CREATE"
    }));

    await expect(
      repository.createAggregate(
        { email: "new@example.com", passwordHash: "hash", displayName: "New" },
        "company-a",
        "role-a",
        delegation,
        createAudit
      )
    ).resolves.toMatchObject({ id: "user-1" });

    expect(persistence.lockRole).toHaveBeenCalledWith(
      expect.stringContaining('FROM "roles"'),
      "role-a",
      "company-a"
    );
    expect(persistence.userCompanyCreate).toHaveBeenCalledWith({
      data: { companyId: "company-a", userId: "user-1", isDefault: true }
    });
    expect(persistence.assignmentCreate).toHaveBeenCalledWith({
      data: { companyId: "company-a", userId: "user-1", roleId: "role-a" }
    });
    expect(createAudit).toHaveBeenCalledWith(undefined, {
      id: "user-1",
      displayName: "Created",
      companies: [{ companyId: "company-a", userId: "user-1", isDefault: true }],
      roleAssignments: [{ companyId: "company-a", userId: "user-1", roleId: "role-a" }]
    });
    expect(persistence.auditCreate).toHaveBeenCalledWith({
      data: { entityType: "User", entityId: "user-1", action: "CREATE" }
    });
    expect(persistence.transaction).toHaveBeenCalledOnce();
  });

  it("stops the aggregate before profile and audit when membership creation fails", async () => {
    persistence.userCompanyCreate.mockRejectedValueOnce(new Error("membership failed"));
    const repository = new UsersRepository();

    await expect(
      repository.createAggregate({}, "company-a", "role-a", delegation, auditData)
    ).rejects.toThrow("membership failed");

    expect(persistence.assignmentCreate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
    expect(persistence.transaction).toHaveBeenCalledOnce();
  });

  it("updates a password, revokes sessions and audits after one active User lock", async () => {
    const repository = new UsersRepository();

    await repository.updateAggregate(
      "user-1",
      "company-a",
      {
        data: { passwordHash: "new-password-hash" },
        credentialChange: true,
        revokeSessions: true
      },
      auditData
    );

    expect(persistence.lockUser).toHaveBeenCalledWith(
      'SELECT "id", "passwordChangedAt" FROM "users" WHERE "id" = $1::uuid AND "deletedAt" IS NULL FOR UPDATE',
      "user-1"
    );
    expect(persistence.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1", deletedAt: null },
      data: { passwordHash: "new-password-hash", passwordChangedAt: expect.any(Date) }
    });
    expect(persistence.refreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(persistence.auditCreate.mock.invocationCallOrder[0]).toBeGreaterThan(
      persistence.refreshUpdateMany.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("returns not found before memberships or writes when the active User lock is empty", async () => {
    persistence.lockUser.mockResolvedValueOnce([]);
    const repository = new UsersRepository();

    await expect(
      repository.updateAggregate(
        "user-1",
        "company-a",
        { data: { displayName: "Changed" } },
        auditData
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(persistence.lockMemberships).not.toHaveBeenCalled();
    expect(persistence.userUpdate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
  });

  it("maps a defensive P2025 after the lock to not found", async () => {
    persistence.userUpdate.mockRejectedValueOnce({ code: "P2025" });
    const repository = new UsersRepository();

    await expect(
      repository.updateAggregate(
        "user-1",
        "company-a",
        { data: { displayName: "Changed" } },
        auditData
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(persistence.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a shared User global mutation but permits a tenant-local profile change", async () => {
    persistence.lockMemberships.mockResolvedValue([
      { companyId: "company-a", deletedAt: null },
      { companyId: "company-b", deletedAt: null }
    ]);
    const repository = new UsersRepository();

    await expect(
      repository.updateAggregate(
        "user-1",
        "company-a",
        { data: { displayName: "Changed" } },
        auditData
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData)
    ).resolves.toMatchObject({ id: "user-1" });

    expect(persistence.assignmentUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: "company-a",
        userId: "user-1",
        clientId: null,
        teamId: null,
        endsAt: null,
        NOT: { roleId: "role-a" }
      }),
      data: { deletedAt: expect.any(Date) }
    });
    expect(persistence.assignmentCreate).toHaveBeenCalledWith({
      data: {
        companyId: "company-a",
        userId: "user-1",
        roleId: "role-a",
        startsAt: expect.any(Date)
      }
    });
  });

  it("serialises competing permanent profile changes and leaves one final profile", async () => {
    let transactionTail = Promise.resolve();
    let permanentRole: string | undefined = "role-old";
    persistence.transaction.mockImplementation(
      async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) => {
        const previous = transactionTail;
        let release: () => void = () => undefined;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        const tx = transactionClient();
        tx.userRoleAssignment.updateMany = vi.fn(async (args: unknown) => {
          const requestedRole = (args as { where: { NOT: { roleId: string } } }).where.NOT.roleId;
          if (permanentRole !== requestedRole) permanentRole = undefined;
          return { count: 1 };
        });
        tx.userRoleAssignment.findMany = vi.fn(async (args: unknown) => {
          const requestedRole = (args as { where: { roleId: string } }).where.roleId;
          return permanentRole === requestedRole ? [{ id: "assignment" }] : [];
        });
        tx.userRoleAssignment.create = vi.fn(async (args: unknown) => {
          permanentRole = (args as { data: { roleId: string } }).data.roleId;
          return { id: "assignment" };
        });
        try {
          return await callback(tx);
        } finally {
          release();
        }
      }
    );
    const repository = new UsersRepository();

    await Promise.all([
      repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData),
      repository.updateAggregate("user-1", "company-a", delegatedRole("role-b"), auditData)
    ]);

    expect(permanentRole).toBe("role-b");
    expect(persistence.lockUser).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate an already active permanent profile", async () => {
    persistence.assignmentFindMany.mockResolvedValueOnce([{ id: "assignment-a" }]);
    const repository = new UsersRepository();

    await repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData);

    expect(persistence.assignmentCreate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).toHaveBeenCalledOnce();
  });

  it("revokes duplicate active occurrences of the selected permanent profile", async () => {
    persistence.assignmentFindMany.mockResolvedValueOnce([
      { id: "assignment-a" },
      { id: "assignment-b" },
      { id: "assignment-c" }
    ]);
    const repository = new UsersRepository();

    await repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData);

    expect(persistence.assignmentCreate).not.toHaveBeenCalled();
    expect(persistence.assignmentUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["assignment-b", "assignment-c"] } },
      data: { deletedAt: expect.any(Date) }
    });
    expect(persistence.auditCreate).toHaveBeenCalledOnce();
  });

  it("does not write audit evidence when profile creation fails", async () => {
    persistence.assignmentCreate.mockRejectedValueOnce(new Error("assignment failed"));
    const repository = new UsersRepository();

    await expect(
      repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData)
    ).rejects.toThrow("assignment failed");

    expect(persistence.auditCreate).not.toHaveBeenCalled();
    expect(persistence.transaction).toHaveBeenCalledOnce();
  });

  it("rejects profile delegation after current actor authority is revoked", async () => {
    persistence.lockAuthorityAssignments.mockResolvedValueOnce([]);
    const repository = new UsersRepository();

    await expect(
      repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(persistence.assignmentUpdateMany).not.toHaveBeenCalled();
    expect(persistence.assignmentCreate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a target profile expanded beyond the transactionally locked authority", async () => {
    persistence.lockPermissionGraph.mockImplementation((_query: string, roleId: string) => {
      if (roleId === "actor-role") {
        return [{ roleId, resource: "users", action: "write" }];
      }
      return [{ roleId, resource: "rbac", action: "write" }];
    });
    const repository = new UsersRepository();

    await expect(
      repository.updateAggregate("user-1", "company-a", delegatedRole("role-a"), auditData)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(persistence.assignmentUpdateMany).not.toHaveBeenCalled();
    expect(persistence.assignmentCreate).not.toHaveBeenCalled();
    expect(persistence.auditCreate).not.toHaveBeenCalled();
  });
});
