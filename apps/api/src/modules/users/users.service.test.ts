// en-GB: Guards the simple user editor against invalid or destructive limited-role assignment changes.
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { UsersRepository } from "./users.repository.js";

const delegates = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  roleFindFirst: vi.fn(),
  assignmentFindMany: vi.fn().mockResolvedValue([])
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn(async (name: string) => {
    if (name === "user") return { findFirst: delegates.userFindFirst };
    if (name === "role") return { findFirst: delegates.roleFindFirst };
    if (name === "userRoleAssignment") {
      return { findMany: delegates.assignmentFindMany };
    }
    throw new Error(`Unexpected delegate: ${name}`);
  })
}));

vi.mock("../../shared/services/audit-writer.js", () => ({
  buildAuditData: vi.fn((_req: unknown, input: Record<string, unknown>) => input)
}));

import { UsersService } from "./users.service.js";

function request(): ApiRequest {
  return {
    auth: { id: "actor-a", email: "actor@example.com", companyId: "company-a" },
    tenant: { companyId: "company-a" },
    query: {}
  } as unknown as ApiRequest;
}

function serviceWithRepository() {
  const repository = {
    createAggregate: vi.fn().mockResolvedValue({ id: "user-a" }),
    updateAggregate: vi.fn().mockResolvedValue({ id: "user-a" })
  };
  const service = new UsersService(repository as unknown as UsersRepository);
  return { service, repository };
}

describe("UsersService product role assignment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delegates.userFindFirst.mockResolvedValue({ id: "user-a" });
    delegates.assignmentFindMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permission: { resource: "*", action: "*" } }]
        }
      }
    ]);
  });

  it("keeps company membership and deletion scopes when searching a paginated user list", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    };
    const service = new UsersService(repository as unknown as UsersRepository);
    const listRequest = {
      ...request(),
      query: { search: " operator ", page: "2", pageSize: "10" }
    } as unknown as ApiRequest;

    await service.list(listRequest);

    const where = {
      deletedAt: null,
      companies: { some: { companyId: "company-a", deletedAt: null } },
      OR: [
        { email: { contains: "operator", mode: "insensitive" } },
        { displayName: { contains: "operator", mode: "insensitive" } },
        { jobTitle: { contains: "operator", mode: "insensitive" } }
      ]
    };
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 10, take: 10 })
    );
    expect(repository.count).toHaveBeenCalledWith(where);
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }] })
    );
  });

  it("fails closed when a user list has no active company context", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    };
    const service = new UsersService(repository as unknown as UsersRepository);
    const companylessRequest = { ...request(), auth: undefined, tenant: undefined } as ApiRequest;

    await expect(service.list(companylessRequest)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects a limited profile before changing the user, membership or assignments", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "client-role",
      name: "Client operator",
      scope: "CLIENT",
      isActive: true
    });
    const { service, repository } = serviceWithRepository();

    await expect(
      service.update(request(), "user-a", {
        displayName: "Updated user",
        roleId: "client-role"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(delegates.roleFindFirst).toHaveBeenCalledWith({
      where: {
        id: "client-role",
        companyId: "company-a",
        scope: "COMPANY",
        isActive: true,
        deletedAt: null
      },
      include: {
        permissions: {
          where: {
            OR: [{ companyId: "company-a" }, { companyId: null }],
            permission: {
              deletedAt: null,
              OR: [{ companyId: "company-a" }, { companyId: null }]
            }
          },
          include: { permission: true }
        }
      }
    });
    expect(repository.updateAggregate).not.toHaveBeenCalled();
  });

  it("delegates the permanent company profile to the transactional aggregate", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "company-role",
      name: "Operador",
      scope: "COMPANY",
      isActive: true
    });
    const { service, repository } = serviceWithRepository();

    await service.update(request(), "user-a", { roleId: "company-role" });

    expect(repository.updateAggregate).toHaveBeenCalledWith(
      "user-a",
      "company-a",
      { roleId: "company-role", roleDelegation: { actorId: "actor-a" } },
      expect.any(Function)
    );
  });

  it("blocks permission amplification before changing user or membership state", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "custom-role",
      name: "Custom privileged profile",
      scope: "COMPANY",
      isActive: true,
      permissions: [{ permission: { resource: "rbac", action: "write" } }]
    });
    delegates.assignmentFindMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permission: { resource: "users", action: "write" } }]
        }
      }
    ]);
    const { service, repository } = serviceWithRepository();

    await expect(
      service.update(request(), "user-a", {
        displayName: "Must remain unchanged",
        roleId: "custom-role"
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(repository.updateAggregate).not.toHaveBeenCalled();
  });

  it("rejects user creation before persistence when delegation is not authorised", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "manager-role",
      name: "Supervisor de Turno",
      scope: "COMPANY",
      isActive: true,
      permissions: [{ permission: { resource: "rbac", action: "write" } }]
    });
    delegates.assignmentFindMany.mockResolvedValue([]);
    const { service, repository } = serviceWithRepository();

    await expect(
      service.create(request(), {
        email: "new-user@example.com",
        displayName: "New user",
        password: "CorrectHorseBattery1!",
        roleId: "manager-role"
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(repository.createAggregate).not.toHaveBeenCalled();
  });

  it("requires an explicit profile before creating a user", async () => {
    const { service, repository } = serviceWithRepository();

    await expect(
      service.create(request(), {
        email: "new-user@example.com",
        displayName: "New user",
        password: "CorrectHorseBattery1!"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(delegates.roleFindFirst).not.toHaveBeenCalled();
    expect(repository.createAggregate).not.toHaveBeenCalled();
  });

  it("rejects oversized UTF-8 passwords before hashing or persistence", async () => {
    const { service, repository } = serviceWithRepository();
    const hash = vi.spyOn(bcrypt, "hash");
    const password = `Aa1!${"é".repeat(35)}`;

    await expect(
      service.create(request(), {
        email: "new-user@example.com",
        displayName: "New user",
        password,
        roleId: "company-role"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      service.update(request(), "user-a", {
        password
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(hash).not.toHaveBeenCalled();
    expect(repository.createAggregate).not.toHaveBeenCalled();
    expect(repository.updateAggregate).not.toHaveBeenCalled();
  });

  it("changes the credential version and revokes refresh sessions through one repository operation", async () => {
    const { service, repository } = serviceWithRepository();
    vi.spyOn(bcrypt, "hash").mockImplementation(async () => "new-password-hash");

    await service.update(request(), "user-a", {
      displayName: "Updated user",
      password: "CorrectHorseBattery1!"
    });

    expect(repository.updateAggregate).toHaveBeenCalledWith(
      "user-a",
      "company-a",
      {
        data: { displayName: "Updated user", passwordHash: "new-password-hash" },
        credentialChange: true,
        revokeSessions: true
      },
      expect.any(Function)
    );
  });

  it("does not write the global user record for a profile-only change", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "company-role",
      name: "Company role",
      scope: "COMPANY",
      isActive: true,
      permissions: []
    });
    const { service, repository } = serviceWithRepository();

    await service.update(request(), "user-a", { roleId: "company-role" });

    expect(repository.updateAggregate).toHaveBeenCalledWith(
      "user-a",
      "company-a",
      { roleId: "company-role", roleDelegation: { actorId: "actor-a" } },
      expect.any(Function)
    );
  });

  it("scopes a scalar identity update to a sole active company membership", async () => {
    const { service, repository } = serviceWithRepository();

    await service.update(request(), "user-a", { displayName: "Updated user" });

    expect(repository.updateAggregate).toHaveBeenCalledWith(
      "user-a",
      "company-a",
      { data: { displayName: "Updated user" } },
      expect.any(Function)
    );
  });

  it("scopes deletion and session revocation to a sole active company membership", async () => {
    const { service, repository } = serviceWithRepository();

    await service.remove(request(), "user-a");

    expect(repository.updateAggregate).toHaveBeenCalledWith(
      "user-a",
      "company-a",
      { data: { deletedAt: expect.any(Date) }, revokeSessions: true },
      expect.any(Function)
    );
  });

  it("queries only current unscoped company authority for delegation", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "viewer-role",
      name: "Executivo Leitura",
      scope: "COMPANY",
      isActive: true,
      permissions: [{ permission: { resource: "activities", action: "read" } }]
    });
    delegates.assignmentFindMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permission: { resource: "*", action: "*" } }]
        }
      }
    ]);
    const { service } = serviceWithRepository();

    await service.update(request(), "user-a", { roleId: "viewer-role" });

    expect(delegates.assignmentFindMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        userId: "actor-a",
        deletedAt: null,
        clientId: null,
        teamId: null,
        startsAt: { lte: expect.any(Date) },
        OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }],
        company: { status: "ACTIVE", deletedAt: null },
        user: {
          status: "ACTIVE",
          deletedAt: null,
          companies: {
            some: {
              companyId: "company-a",
              deletedAt: null,
              company: { status: "ACTIVE", deletedAt: null }
            }
          }
        },
        role: {
          scope: "COMPANY",
          isActive: true,
          deletedAt: null,
          OR: [{ companyId: "company-a" }, { companyId: null }]
        }
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                OR: [{ companyId: "company-a" }, { companyId: null }],
                permission: {
                  deletedAt: null,
                  OR: [{ companyId: "company-a" }, { companyId: null }]
                }
              },
              include: { permission: true }
            }
          }
        }
      }
    });
  });
});
