// en-GB: Guards the simple user editor against invalid or destructive limited-role assignment changes.
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { UsersRepository } from "./users.repository.js";

const delegates = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  roleFindFirst: vi.fn(),
  userCompanyUpsert: vi.fn(),
  assignmentFindFirst: vi.fn(),
  assignmentFindMany: vi.fn().mockResolvedValue([]),
  assignmentCreate: vi.fn(),
  assignmentUpdate: vi.fn(),
  assignmentUpdateMany: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn(async (name: string) => {
    if (name === "user") return { findFirst: delegates.userFindFirst };
    if (name === "role") return { findFirst: delegates.roleFindFirst };
    if (name === "userCompany") return { upsert: delegates.userCompanyUpsert };
    if (name === "userRoleAssignment") {
      return {
        findFirst: delegates.assignmentFindFirst,
        findMany: delegates.assignmentFindMany,
        create: delegates.assignmentCreate,
        update: delegates.assignmentUpdate,
        updateMany: delegates.assignmentUpdateMany
      };
    }
    throw new Error(`Unexpected delegate: ${name}`);
  })
}));

vi.mock("../../shared/services/audit-writer.js", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined)
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
    create: vi.fn().mockResolvedValue({ id: "user-a" }),
    update: vi.fn().mockResolvedValue({ id: "user-a" }),
    updatePasswordAndRevoke: vi.fn().mockResolvedValue({ id: "user-a" })
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
    delegates.assignmentFindFirst.mockResolvedValue(null);
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
    expect(repository.update).not.toHaveBeenCalled();
    expect(delegates.userCompanyUpsert).not.toHaveBeenCalled();
    expect(delegates.assignmentUpdateMany).not.toHaveBeenCalled();
    expect(delegates.assignmentCreate).not.toHaveBeenCalled();
  });

  it("replaces only company-scoped assignments and preserves limited assignments", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "company-role",
      name: "Operador",
      scope: "COMPANY",
      isActive: true
    });
    const { service } = serviceWithRepository();

    await service.update(request(), "user-a", { roleId: "company-role" });

    expect(delegates.assignmentUpdateMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        userId: "user-a",
        deletedAt: null,
        clientId: null,
        teamId: null,
        startsAt: { lte: expect.any(Date) },
        endsAt: null,
        NOT: { roleId: "company-role" },
        role: { scope: "COMPANY" }
      },
      data: { deletedAt: expect.any(Date) }
    });
    expect(delegates.assignmentFindFirst).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        userId: "user-a",
        roleId: "company-role",
        clientId: null,
        teamId: null,
        deletedAt: null,
        startsAt: { lte: expect.any(Date) },
        endsAt: null
      }
    });
    expect(delegates.assignmentCreate).toHaveBeenCalledWith({
      data: { companyId: "company-a", userId: "user-a", roleId: "company-role" }
    });
  });

  it("does not rewrite an existing permanent assignment for an unrelated edit", async () => {
    delegates.roleFindFirst.mockResolvedValue({
      id: "company-role",
      name: "Operador",
      scope: "COMPANY",
      isActive: true
    });
    delegates.assignmentFindFirst.mockResolvedValue({ id: "assignment-a" });
    const { service } = serviceWithRepository();

    await service.update(request(), "user-a", { roleId: "company-role" });

    expect(delegates.assignmentUpdate).not.toHaveBeenCalled();
    expect(delegates.assignmentCreate).not.toHaveBeenCalled();
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

    expect(repository.update).not.toHaveBeenCalled();
    expect(delegates.userCompanyUpsert).not.toHaveBeenCalled();
    expect(delegates.assignmentUpdateMany).not.toHaveBeenCalled();
    expect(delegates.assignmentCreate).not.toHaveBeenCalled();
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

    expect(repository.create).not.toHaveBeenCalled();
    expect(delegates.userCompanyUpsert).not.toHaveBeenCalled();
    expect(delegates.assignmentCreate).not.toHaveBeenCalled();
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
    expect(repository.create).not.toHaveBeenCalled();
    expect(delegates.userCompanyUpsert).not.toHaveBeenCalled();
    expect(delegates.assignmentCreate).not.toHaveBeenCalled();
  });

  it("changes the credential version and revokes refresh sessions through one repository operation", async () => {
    const { service, repository } = serviceWithRepository();
    vi.spyOn(bcrypt, "hash").mockImplementation(async () => "new-password-hash");

    await service.update(request(), "user-a", {
      displayName: "Updated user",
      password: "CorrectHorseBattery1!"
    });

    expect(repository.updatePasswordAndRevoke).toHaveBeenCalledWith("user-a", {
      displayName: "Updated user",
      passwordHash: "new-password-hash"
    });
    expect(repository.update).not.toHaveBeenCalled();
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
