// en-GB: Exercises fail-closed RBAC scope evaluation so omitted tenant context cannot widen access.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { assignmentGrantsPermission, RbacService } from "./rbac.service.js";

vi.mock("../../shared/services/audit-writer.js", () => ({
  buildAuditData: vi.fn((_req: unknown, input: unknown) => input),
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

  it("rejects portfolio permissions outside the signed ceiling before persistence", async () => {
    const serviceClass = RbacService as unknown as {
      repository: { findAssignmentsForUser: ReturnType<typeof vi.fn> };
    };
    const originalRepository = serviceClass.repository;
    const findAssignmentsForUser = vi.fn();
    serviceClass.repository = { findAssignmentsForUser };

    try {
      await expect(
        RbacService.hasPermission(
          {
            id: "user-a",
            email: "portfolio@example.com",
            companyId: "company-a",
            sessionKind: "portfolio",
            permissions: ["dashboard:read"]
          },
          rule
        )
      ).resolves.toBe(false);
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(findAssignmentsForUser).not.toHaveBeenCalled();
  });

  it("requires both the portfolio ceiling and live RBAC authority", async () => {
    const serviceClass = RbacService as unknown as {
      repository: { findAssignmentsForUser: ReturnType<typeof vi.fn> };
    };
    const originalRepository = serviceClass.repository;
    const findAssignmentsForUser = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignment()]);
    serviceClass.repository = { findAssignmentsForUser };
    const user = {
      id: "user-a",
      email: "portfolio@example.com",
      companyId: "company-a",
      sessionKind: "portfolio" as const,
      permissions: ["activities:read"]
    };

    try {
      await expect(RbacService.hasPermission(user, rule)).resolves.toBe(false);
      await expect(RbacService.hasPermission(user, rule)).resolves.toBe(true);
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(findAssignmentsForUser).toHaveBeenCalledTimes(2);
  });

  it("treats a signed portfolio wildcard as a ceiling, not a live authority grant", async () => {
    const serviceClass = RbacService as unknown as {
      repository: { findAssignmentsForUser: ReturnType<typeof vi.fn> };
    };
    const originalRepository = serviceClass.repository;
    const findAssignmentsForUser = vi
      .fn()
      .mockResolvedValueOnce([assignment()])
      .mockResolvedValueOnce([]);
    serviceClass.repository = { findAssignmentsForUser };
    const user = {
      id: "user-a",
      email: "portfolio@example.com",
      companyId: "company-a",
      sessionKind: "portfolio" as const,
      permissions: ["*:*"]
    };

    try {
      await expect(RbacService.hasPermission(user, rule)).resolves.toBe(true);
      await expect(RbacService.hasPermission(user, rule)).resolves.toBe(false);
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(findAssignmentsForUser).toHaveBeenCalledTimes(2);
  });

  it("preserves live RBAC for conventional sessions and forwards the active transaction", async () => {
    const serviceClass = RbacService as unknown as {
      repository: { findAssignmentsForUser: ReturnType<typeof vi.fn> };
    };
    const originalRepository = serviceClass.repository;
    const findAssignmentsForUser = vi.fn().mockResolvedValue([assignment()]);
    const transaction = { marker: "permission-transaction" } as unknown as PrismaTransactionClient;
    serviceClass.repository = { findAssignmentsForUser };

    try {
      await expect(
        RbacService.hasPermission(
          {
            id: "user-a",
            email: "user@example.com",
            companyId: "company-a",
            permissions: []
          },
          rule,
          transaction
        )
      ).resolves.toBe(true);
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(findAssignmentsForUser).toHaveBeenCalledWith("user-a", "company-a", transaction);
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

  it("blocks generic permission updates and removals", async () => {
    const service = RbacService.permissions;
    const req = {
      auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
      tenant: { companyId: "company-a" },
      query: {}
    } as unknown as ApiRequest;

    await expect(service.update(req, "permission-a", { action: "write" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403
    });
    await expect(service.remove(req, "permission-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403
    });
  });

  it("discards protected fields even when the service is called without HTTP validation", async () => {
    const service = RbacService.roles as unknown as {
      rbacRepository: { createRole(...args: unknown[]): Promise<unknown> };
      create(req: ApiRequest, data: Record<string, unknown>): Promise<unknown>;
    };
    const originalRepository = service.rbacRepository;
    const createRole = vi.fn().mockResolvedValue({ id: "role-a" });
    service.rbacRepository = { createRole };

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
      service.rbacRepository = originalRepository;
    }

    expect(createRole).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-a",
        actorId: "user-a",
        requiredControlPermission: "rbac:write",
        auditData: expect.any(Function)
      }),
      { name: "Operator" }
    );
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
      expect.objectContaining({
        companyId: "company-a",
        actorId: "user-a",
        requiredControlPermission: "rbac:write",
        auditData: expect.any(Function)
      }),
      "role-a",
      { scope: "CLIENT" },
      "UPDATE"
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
      mutateRole: vi.fn().mockRejectedValue(rejection),
      duplicateRole: vi.fn().mockRejectedValue(rejection)
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
    expect(repository.duplicateRole).toHaveBeenCalledOnce();
  });

  it("delegates permission mutation checks to the transactional repository", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const rejection = Object.assign(new Error("system profile"), { code: "BAD_REQUEST" });
    const repository = {
      assignPermission: vi.fn().mockRejectedValue(rejection),
      removePermission: vi.fn().mockRejectedValue(rejection)
    };
    serviceClass.repository = repository;
    const req = {
      auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
      tenant: { companyId: "company-a" }
    } as unknown as ApiRequest;

    try {
      await expect(
        RbacService.assignPermission(req, "system-role", "permission-a")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        RbacService.removePermission(req, "system-role", "permission-a")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.assignPermission).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-a", actorId: "user-a" }),
      "system-role",
      "permission-a"
    );
    expect(repository.removePermission).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-a", actorId: "user-a" }),
      "system-role",
      "permission-a"
    );
  });

  it("normalises assignments and passes the complete command context", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const startsAt = new Date("2026-09-02T08:00:00.000Z");
    const endsAt = new Date("2026-09-02T16:00:00.000Z");
    const repository = {
      assignRole: vi.fn().mockResolvedValue({ id: "assignment-a" })
    };
    serviceClass.repository = repository;
    const req = {
      auth: {
        id: "user-a",
        email: "user@example.com",
        companyId: "company-a",
        sessionKind: "portfolio",
        permissions: ["rbac:write", "users:read"]
      },
      tenant: { companyId: "company-a" }
    } as unknown as ApiRequest;

    try {
      await expect(
        RbacService.assignRole(req, {
          userId: "target-user",
          roleId: "role-a",
          clientId: "client-a",
          startsAt,
          endsAt
        })
      ).resolves.toMatchObject({ id: "assignment-a" });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.assignRole).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-a",
        actorId: "user-a",
        portfolioCeiling: ["rbac:write", "users:read"],
        requiredControlPermission: "rbac:write",
        auditData: expect.any(Function)
      }),
      {
        userId: "target-user",
        roleId: "role-a",
        clientId: "client-a",
        startsAt,
        endsAt
      }
    );
  });

  it("rejects an invalid assignment period before opening a repository transaction", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const repository = { assignRole: vi.fn() };
    serviceClass.repository = repository;
    const req = {
      auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
      tenant: { companyId: "company-a" }
    } as unknown as ApiRequest;

    try {
      await expect(
        RbacService.assignRole(req, {
          userId: "target-user",
          roleId: "role-a",
          startsAt: new Date("2026-09-02T16:00:00.000Z"),
          endsAt: new Date("2026-09-02T08:00:00.000Z")
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.assignRole).not.toHaveBeenCalled();
  });

  it("rejects conflicting company context before delegating a mutation", async () => {
    const serviceClass = RbacService as unknown as {
      repository: Record<string, ReturnType<typeof vi.fn>>;
    };
    const originalRepository = serviceClass.repository;
    const repository = { assignRole: vi.fn() };
    serviceClass.repository = repository;

    try {
      await expect(
        RbacService.assignRole(
          {
            auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
            tenant: { companyId: "company-b" }
          } as unknown as ApiRequest,
          { userId: "target-user", roleId: "role-a" }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    } finally {
      serviceClass.repository = originalRepository;
    }

    expect(repository.assignRole).not.toHaveBeenCalled();
  });
});
