// en-GB: Verifies that protected Role mutations lock, revalidate and audit within one transaction.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RbacRepository } from "./rbac.repository.js";

const persistence = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockRole: vi.fn(),
  countAssignments: vi.fn(),
  createAssignment: vi.fn(),
  updateRole: vi.fn(),
  createAudit: vi.fn()
}));

function transactionClient() {
  return {
    $queryRawUnsafe: persistence.lockRole,
    role: { update: persistence.updateRole },
    userRoleAssignment: {
      count: persistence.countAssignments,
      create: persistence.createAssignment
    },
    auditLog: { create: persistence.createAudit }
  };
}

describe("RbacRepository protected Role mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.lockRole.mockResolvedValue([
      { id: "role-a", companyId: "company-a", scope: "COMPANY", isSystem: false }
    ]);
    persistence.countAssignments.mockResolvedValue(0);
    persistence.createAssignment.mockResolvedValue({ id: "assignment-a" });
    persistence.updateRole.mockResolvedValue({
      id: "role-a",
      companyId: "company-a",
      scope: "CLIENT",
      isSystem: false
    });
    persistence.transaction.mockImplementation(
      async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
        callback(transactionClient())
    );
  });

  it("locks the profile before counting assignments and commits mutation plus audit", async () => {
    const repository = new RbacRepository(async () => ({
      $transaction: persistence.transaction
    }));
    const auditData = vi.fn((before: unknown, after: unknown) => ({
      entityType: "Role",
      entityId: "role-a",
      action: "UPDATE",
      before,
      after
    }));

    await expect(
      repository.mutateRole("role-a", "company-a", { scope: "CLIENT" }, "UPDATE", auditData)
    ).resolves.toMatchObject({ id: "role-a", scope: "CLIENT" });

    expect(persistence.lockRole).toHaveBeenCalledWith(
      expect.stringContaining('FROM "roles"'),
      "role-a",
      "company-a"
    );
    expect(persistence.lockRole.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.countAssignments.mock.invocationCallOrder[0]
    );
    expect(persistence.countAssignments.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.updateRole.mock.invocationCallOrder[0]
    );
    expect(persistence.updateRole.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.createAudit.mock.invocationCallOrder[0]
    );
    expect(auditData).toHaveBeenCalledWith(
      expect.objectContaining({ id: "role-a", scope: "COMPANY" }),
      expect.objectContaining({ id: "role-a", scope: "CLIENT" })
    );
    expect(persistence.transaction).toHaveBeenCalledOnce();
  });

  it("rejects deletion after the locked active-assignment recheck", async () => {
    persistence.countAssignments.mockResolvedValueOnce(1);
    const repository = new RbacRepository(async () => ({
      $transaction: persistence.transaction
    }));

    await expect(
      repository.mutateRole(
        "role-a",
        "company-a",
        { deletedAt: new Date() },
        "SOFT_DELETE",
        () => ({})
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(persistence.updateRole).not.toHaveBeenCalled();
    expect(persistence.createAudit).not.toHaveBeenCalled();
  });

  it("rejects a system profile while holding its mutation lock", async () => {
    persistence.lockRole.mockResolvedValueOnce([
      { id: "role-a", companyId: "company-a", scope: "COMPANY", isSystem: true }
    ]);
    const repository = new RbacRepository(async () => ({
      $transaction: persistence.transaction
    }));

    await expect(
      repository.mutateRole("role-a", "company-a", { name: "Changed" }, "UPDATE", () => ({}))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(persistence.countAssignments).not.toHaveBeenCalled();
    expect(persistence.updateRole).not.toHaveBeenCalled();
    expect(persistence.createAudit).not.toHaveBeenCalled();
  });

  it("locks and revalidates the selected profile before creating an assignment", async () => {
    const repository = new RbacRepository(async () => ({
      $transaction: persistence.transaction
    }));
    const data = {
      companyId: "company-a",
      userId: "user-a",
      roleId: "role-a"
    };

    await expect(repository.assignRole(data)).resolves.toMatchObject({ id: "assignment-a" });

    expect(persistence.lockRole).toHaveBeenCalledWith(
      expect.stringContaining('"isActive" = TRUE'),
      "role-a",
      "company-a"
    );
    expect(persistence.lockRole.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.createAssignment.mock.invocationCallOrder[0]
    );
    expect(persistence.createAssignment).toHaveBeenCalledWith({ data });
  });

  it("rechecks scope requirements after acquiring the assignment lock", async () => {
    persistence.lockRole.mockResolvedValueOnce([
      { id: "role-a", companyId: "company-a", scope: "CLIENT", isSystem: false }
    ]);
    const repository = new RbacRepository(async () => ({
      $transaction: persistence.transaction
    }));

    await expect(
      repository.assignRole({ companyId: "company-a", userId: "user-a", roleId: "role-a" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(persistence.createAssignment).not.toHaveBeenCalled();
  });
});
