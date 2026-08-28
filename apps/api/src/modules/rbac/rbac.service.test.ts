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

  it("lists roles with tenant search, matching count scope and stable ordering", async () => {
    const service = RbacService.roles as unknown as {
      repository: {
        list(args: Record<string, unknown>): Promise<unknown[]>;
        count(where: Record<string, unknown>): Promise<number>;
      };
      list(req: ApiRequest): Promise<unknown>;
    };
    const originalRepository = service.repository;
    const list = vi.fn().mockResolvedValue([{ id: "role-26" }]);
    const count = vi.fn().mockResolvedValue(26);
    service.repository = { list, count };
    const where = {
      companyId: "company-a",
      deletedAt: null,
      OR: ["name", "description"].map((field) => ({
        [field]: { contains: "operator", mode: "insensitive" }
      }))
    };

    try {
      await expect(
        service.list({
          query: { page: 3, pageSize: 12, search: " operator " },
          auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
          tenant: { companyId: "company-a" }
        } as unknown as ApiRequest)
      ).resolves.toMatchObject({
        items: [{ id: "role-26" }],
        total: 26,
        page: 3,
        pageSize: 12
      });
    } finally {
      service.repository = originalRepository;
    }

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 24,
        take: 12,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: expect.objectContaining({
          permissions: expect.any(Object),
          _count: expect.any(Object)
        })
      })
    );
    expect(count).toHaveBeenCalledWith(where);
  });

  it("lists the permission catalogue with tenant scope and resource/action/id ordering", async () => {
    const service = RbacService.permissions as unknown as {
      repository: {
        list(args: Record<string, unknown>): Promise<unknown[]>;
        count(where: Record<string, unknown>): Promise<number>;
      };
      list(req: ApiRequest): Promise<unknown>;
    };
    const originalRepository = service.repository;
    const list = vi.fn().mockResolvedValue([{ id: "permission-101" }]);
    const count = vi.fn().mockResolvedValue(101);
    service.repository = { list, count };
    const where = { companyId: "company-a", deletedAt: null };

    try {
      await expect(
        service.list({
          query: { page: 2, pageSize: 100 },
          auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
          tenant: { companyId: "company-a" }
        } as unknown as ApiRequest)
      ).resolves.toMatchObject({
        items: [{ id: "permission-101" }],
        total: 101,
        page: 2,
        pageSize: 100
      });
    } finally {
      service.repository = originalRepository;
    }

    expect(list).toHaveBeenCalledWith({
      where,
      skip: 100,
      take: 100,
      orderBy: [{ resource: "asc" }, { action: "asc" }, { id: "asc" }]
    });
    expect(count).toHaveBeenCalledWith(where);
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

  it("delegates scope changes to the locked aggregate mutation", async () => {
    const service = RbacService.roles as unknown as {
      rbacRepository: {
        mutateRole(...args: unknown[]): Promise<unknown>;
      };
      update(req: ApiRequest, id: string, data: Record<string, unknown>): Promise<unknown>;
    };
    const originalRepository = service.rbacRepository;
    const rejection = Object.assign(new Error("active assignments"), { code: "BAD_REQUEST" });
    const mutateRole = vi.fn().mockRejectedValue(rejection);
    service.rbacRepository = {
      mutateRole
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

    expect(mutateRole).toHaveBeenCalledWith(
      "role-a",
      "company-a",
      { scope: "CLIENT" },
      "UPDATE",
      expect.any(Function)
    );
  });

  it("blocks every ordinary profile mutation for system profiles", async () => {
    const service = RbacService.roles as unknown as {
      rbacRepository: Record<string, ReturnType<typeof vi.fn>>;
      update(req: ApiRequest, id: string, data: Record<string, unknown>): Promise<unknown>;
      remove(req: ApiRequest, id: string): Promise<unknown>;
      duplicate(req: ApiRequest, id: string): Promise<unknown>;
    };
    const originalRepository = service.rbacRepository;
    const rejection = Object.assign(new Error("system profile"), { code: "BAD_REQUEST" });
    const repository = {
      findRole: vi.fn().mockResolvedValue({
        id: "system-role",
        scope: "COMPANY",
        isSystem: true
      }),
      mutateRole: vi.fn().mockRejectedValue(rejection),
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

    expect(repository.mutateRole).toHaveBeenCalledTimes(2);
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
