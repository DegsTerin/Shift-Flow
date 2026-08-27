// en-GB: Exercises RBAC persistence filters so expired or inactive authority is excluded at source.
import { describe, expect, it, vi } from "vitest";

const {
  assignmentFindMany,
  assignmentCount,
  userCompanyFindFirst,
  clientFindFirst,
  teamFindFirst
} = vi.hoisted(() => ({
  assignmentFindMany: vi.fn().mockResolvedValue([]),
  assignmentCount: vi.fn().mockResolvedValue(0),
  userCompanyFindFirst: vi.fn().mockResolvedValue(null),
  clientFindFirst: vi.fn().mockResolvedValue(null),
  teamFindFirst: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn(async (name: string) => {
    if (name === "userRoleAssignment") {
      return {
        findMany: assignmentFindMany,
        count: assignmentCount,
        create: vi.fn()
      };
    }
    if (name === "userCompany") {
      return { findFirst: userCompanyFindFirst };
    }
    if (name === "client") {
      return { findFirst: clientFindFirst };
    }
    if (name === "team") {
      return { findFirst: teamFindFirst };
    }
    return { findFirst: vi.fn() };
  })
}));

import { RbacRepository } from "./rbac.repository.js";

describe("RbacRepository", () => {
  it("filters permission assignments by current user, tenant and lifecycle", async () => {
    const repository = new RbacRepository();

    await repository.findAssignmentsForUser("user-a", "company-a");

    expect(assignmentFindMany).toHaveBeenCalledOnce();
    const query = assignmentFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      include: Record<string, unknown>;
    };
    expect(query.where).toMatchObject({
      userId: "user-a",
      companyId: "company-a",
      deletedAt: null,
      startsAt: { lte: expect.any(Date) },
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
        isActive: true,
        deletedAt: null,
        OR: [{ companyId: "company-a" }, { companyId: null }]
      }
    });
    expect(query.where.OR).toEqual([{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }]);
    expect(query.where.AND).toEqual([
      {
        OR: [{ clientId: null }, { client: { status: "ACTIVE", deletedAt: null } }]
      },
      {
        OR: [{ teamId: null }, { team: { deletedAt: null } }]
      }
    ]);
    expect(query.include).toMatchObject({
      role: {
        include: {
          permissions: {
            where: {
              OR: [{ companyId: "company-a" }, { companyId: null }],
              permission: {
                deletedAt: null,
                OR: [{ companyId: "company-a" }, { companyId: null }]
              }
            }
          }
        }
      }
    });
  });

  it("counts only assignments that have started and not ended", async () => {
    const repository = new RbacRepository();

    await repository.countActiveAssignments("role-a", "company-a");

    expect(assignmentCount).toHaveBeenCalledWith({
      where: {
        roleId: "role-a",
        companyId: "company-a",
        deletedAt: null,
        startsAt: { lte: expect.any(Date) },
        OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }]
      }
    });
  });

  it("requires active user and company state for membership", async () => {
    const repository = new RbacRepository();

    await repository.findUserCompany("user-a", "company-a");

    expect(userCompanyFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-a",
        companyId: "company-a",
        deletedAt: null,
        user: { status: "ACTIVE", deletedAt: null },
        company: { status: "ACTIVE", deletedAt: null }
      }
    });
  });

  it("accepts only active clients and non-deleted teams for new limited assignments", async () => {
    const repository = new RbacRepository();

    await repository.findClient("client-a", "company-a");
    await repository.findTeam("team-a", "company-a");

    expect(clientFindFirst).toHaveBeenCalledWith({
      where: {
        id: "client-a",
        companyId: "company-a",
        status: "ACTIVE",
        deletedAt: null
      }
    });
    expect(teamFindFirst).toHaveBeenCalledWith({
      where: { id: "team-a", companyId: "company-a", deletedAt: null }
    });
  });
});
