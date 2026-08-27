// en-GB: Exercises fail-closed RBAC scope evaluation so omitted tenant context cannot widen access.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { assignmentGrantsPermission, RbacService } from "./rbac.service.js";

vi.mock("../../shared/services/audit-writer.js", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined)
}));

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    companyId: "company-a",
    clientId: null,
    teamId: null,
    role: {
      companyId: "company-a",
      scope: "COMPANY",
      isActive: true,
      permissions: [
        {
          permission: {
            companyId: "company-a",
            resource: "activities",
            action: "read"
          }
        }
      ]
    },
    ...overrides
  };
}

const rule = { resource: "activities", action: "read" };

describe("RBAC scope evaluation", () => {
  it("allows an unscoped company assignment without sub-scope context", () => {
    expect(assignmentGrantsPermission(assignment(), rule, "company-a")).toBe(true);
  });

  it("denies a client-limited assignment when client context is omitted or differs", () => {
    const clientAssignment = assignment({ clientId: "client-a" });

    expect(assignmentGrantsPermission(clientAssignment, rule, "company-a")).toBe(false);
    expect(
      assignmentGrantsPermission(
        clientAssignment,
        { ...rule, tenant: { clientId: "client-b" } },
        "company-a"
      )
    ).toBe(false);
    expect(
      assignmentGrantsPermission(
        clientAssignment,
        { ...rule, tenant: { clientId: "client-a" } },
        "company-a"
      )
    ).toBe(true);
  });

  it("denies a team-limited assignment when team context is omitted or differs", () => {
    const teamAssignment = assignment({ teamId: "team-a" });

    expect(assignmentGrantsPermission(teamAssignment, rule, "company-a")).toBe(false);
    expect(
      assignmentGrantsPermission(
        teamAssignment,
        { ...rule, tenant: { teamId: "team-b" } },
        "company-a"
      )
    ).toBe(false);
    expect(
      assignmentGrantsPermission(
        teamAssignment,
        { ...rule, tenant: { teamId: "team-a" } },
        "company-a"
      )
    ).toBe(true);
  });

  it("denies malformed scoped roles and cross-company permissions", () => {
    const clientRoleWithoutClient = assignment({
      role: { ...assignment().role, scope: "CLIENT" }
    });
    const crossCompanyPermission = assignment({
      role: {
        ...assignment().role,
        permissions: [
          {
            permission: {
              companyId: "company-b",
              resource: "activities",
              action: "read"
            }
          }
        ]
      }
    });

    expect(assignmentGrantsPermission(clientRoleWithoutClient, rule, "company-a")).toBe(false);
    expect(assignmentGrantsPermission(crossCompanyPermission, rule, "company-a")).toBe(false);
  });

  it("fails closed before persistence when the authenticated user has no company", async () => {
    await expect(
      RbacService.hasPermission(
        { id: "user-a", email: "user@example.com" },
        { resource: "activities", action: "read" }
      )
    ).resolves.toBe(false);
  });

  it("discards protected fields even when the service is called without HTTP validation", async () => {
    const service = RbacService.roles as unknown as {
      repository: { create(data: Record<string, unknown>): Promise<unknown> };
      create(req: ApiRequest, data: Record<string, unknown>): Promise<unknown>;
    };
    const originalRepository = service.repository;
    const create = vi.fn().mockResolvedValue({ id: "role-a" });
    service.repository = { create };

    try {
      await service.create(
        {
          auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
          tenant: { companyId: "company-a" }
        } as unknown as ApiRequest,
        {
          name: "Operator",
          companyId: "company-b",
          isSystem: true
        }
      );
    } finally {
      service.repository = originalRepository;
    }

    expect(create).toHaveBeenCalledWith({
      name: "Operator",
      companyId: "company-a"
    });
  });

  it("blocks scope changes while a profile has active assignments", async () => {
    const service = RbacService.roles as unknown as {
      rbacRepository: {
        findRole(id: string, companyId: string): Promise<unknown>;
        countActiveAssignments(id: string, companyId: string): Promise<number>;
      };
      update(req: ApiRequest, id: string, data: Record<string, unknown>): Promise<unknown>;
    };
    const originalRepository = service.rbacRepository;
    service.rbacRepository = {
      findRole: vi.fn().mockResolvedValue({
        id: "role-a",
        scope: "COMPANY",
        isSystem: false
      }),
      countActiveAssignments: vi.fn().mockResolvedValue(1)
    };

    try {
      await expect(
        service.update(
          {
            auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
            tenant: { companyId: "company-a" }
          } as unknown as ApiRequest,
          "role-a",
          { scope: "CLIENT" }
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      service.rbacRepository = originalRepository;
    }
  });

  it("blocks every ordinary profile mutation for system profiles", async () => {
    const service = RbacService.roles as unknown as {
      rbacRepository: Record<string, ReturnType<typeof vi.fn>>;
      update(req: ApiRequest, id: string, data: Record<string, unknown>): Promise<unknown>;
      remove(req: ApiRequest, id: string): Promise<unknown>;
      duplicate(req: ApiRequest, id: string): Promise<unknown>;
    };
    const originalRepository = service.rbacRepository;
    const repository = {
      findRole: vi.fn().mockResolvedValue({
        id: "system-role",
        scope: "COMPANY",
        isSystem: true
      }),
      countActiveAssignments: vi.fn(),
      duplicateRole: vi.fn()
    };
    service.rbacRepository = repository;
    const req = {
      auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
      tenant: { companyId: "company-a" }
    } as unknown as ApiRequest;

    try {
      await expect(service.update(req, "system-role", { name: "Changed" })).rejects.toMatchObject({
        code: "BAD_REQUEST"
      });
      await expect(service.remove(req, "system-role")).rejects.toMatchObject({
        code: "BAD_REQUEST"
      });
      await expect(service.duplicate(req, "system-role")).rejects.toMatchObject({
        code: "BAD_REQUEST"
      });
    } finally {
      service.rbacRepository = originalRepository;
    }

    expect(repository.countActiveAssignments).not.toHaveBeenCalled();
    expect(repository.duplicateRole).not.toHaveBeenCalled();
  });

  it("blocks permission changes for system profiles", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const repository = {
      findRole: vi.fn().mockResolvedValue({ id: "system-role", isSystem: true }),
      findPermission: vi.fn().mockResolvedValue({ id: "permission-a" }),
      assignPermission: vi.fn(),
      removePermission: vi.fn()
    };
    serviceClass.repository = repository;
    const actor = { id: "user-a", email: "user@example.com", companyId: "company-a" };
    const tenant = { companyId: "company-a" };

    try {
      await expect(
        RbacService.assignPermission(actor, tenant, "system-role", "permission-a")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        RbacService.removePermission(actor, tenant, "system-role", "permission-a")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.assignPermission).not.toHaveBeenCalled();
    expect(repository.removePermission).not.toHaveBeenCalled();
  });

  it("rejects incomplete or cross-company scoped assignments before creation", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const repository = {
      findRole: vi.fn().mockResolvedValue({ id: "role-a", scope: "CLIENT", isActive: true }),
      findUserCompany: vi.fn().mockResolvedValue({ id: "membership-a" }),
      findClient: vi.fn().mockResolvedValue(null),
      findTeam: vi.fn().mockResolvedValue(null),
      assignRole: vi.fn()
    };
    serviceClass.repository = repository;
    const actor = { id: "user-a", email: "user@example.com", companyId: "company-a" };
    const tenant = { companyId: "company-a" };

    try {
      await expect(
        RbacService.assignRole(actor, tenant, {
          userId: "target-user",
          roleId: "role-a"
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      repository.findRole.mockResolvedValue({ id: "role-a", scope: "COMPANY", isActive: true });
      await expect(
        RbacService.assignRole(actor, tenant, {
          userId: "target-user",
          roleId: "role-a",
          clientId: "foreign-client"
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      repository.findUserCompany.mockResolvedValue(null);
      await expect(
        RbacService.assignRole(actor, tenant, {
          userId: "foreign-user",
          roleId: "role-a"
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.assignRole).not.toHaveBeenCalled();
  });

  it("rejects inactive roles before creating an assignment", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const repository = {
      findRole: vi.fn().mockResolvedValue({
        id: "inactive-role",
        scope: "COMPANY",
        isActive: false
      }),
      findUserCompany: vi.fn(),
      assignRole: vi.fn()
    };
    serviceClass.repository = repository;

    try {
      await expect(
        RbacService.assignRole(
          { id: "user-a", email: "user@example.com", companyId: "company-a" },
          { companyId: "company-a" },
          { userId: "target-user", roleId: "inactive-role" }
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.findUserCompany).not.toHaveBeenCalled();
    expect(repository.assignRole).not.toHaveBeenCalled();
  });
});
