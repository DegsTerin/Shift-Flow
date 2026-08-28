// en-GB: Exercises list-route validation before the scoped service boundary.
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "./shared/http/request-types.js";

const persistence = vi.hoisted(() => {
  const team = { findMany: vi.fn(), count: vi.fn() };
  const role = { findMany: vi.fn(), count: vi.fn() };
  const permission = { findMany: vi.fn(), count: vi.fn() };
  return {
    team,
    role,
    permission,
    getDelegate: vi.fn(async (name: string) => {
      if (name === "team") return team;
      if (name === "role") return role;
      if (name === "permission") return permission;
      throw new Error(`Unexpected delegate: ${name}`);
    })
  };
});

vi.mock("./shared/lib/prisma.js", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getDelegate: persistence.getDelegate
}));

vi.mock("./shared/middlewares/authenticate.js", () => ({
  authenticate: (req: ApiRequest, _res: Response, next: NextFunction) => {
    req.auth = { id: "user-a", email: "user@example.com", companyId: "company-a" };
    req.tenant = { companyId: "company-a" };
    next();
  }
}));

vi.mock("./shared/middlewares/authorize.js", () => ({
  requirePermission: (resource: string, action: string) => {
    void resource;
    void action;
    return (_req: ApiRequest, _res: Response, next: NextFunction) => next();
  }
}));

import { rbacRoutes } from "./modules/rbac/rbac.routes.js";
import { teamRoutes } from "./modules/teams/teams.routes.js";
import { errorHandler } from "./shared/middlewares/error-handler.js";

function testApp() {
  const app = express();
  app.use(express.json());
  app.use("/teams", teamRoutes);
  app.use("/rbac", rbacRoutes);
  app.use(errorHandler);
  return app;
}

describe("reference list routes", () => {
  beforeEach(() => {
    persistence.getDelegate.mockClear();
    Object.values({
      team: persistence.team,
      role: persistence.role,
      permission: persistence.permission
    }).forEach((delegate) => {
      delegate.findMany.mockReset();
      delegate.count.mockReset();
    });
    persistence.team.findMany.mockResolvedValue([{ id: "team-11" }]);
    persistence.team.count.mockResolvedValue(11);
    persistence.role.findMany.mockResolvedValue([{ id: "role-11" }]);
    persistence.role.count.mockResolvedValue(11);
    persistence.permission.findMany.mockResolvedValue([{ id: "permission-11" }]);
    persistence.permission.count.mockResolvedValue(11);
  });

  it("composes searchable team pagination from HTTP through the real service", async () => {
    const response = await request(testApp()).get(
      "/teams?search=%20ops%20&page=2&pageSize=10&companyId=company-b"
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [{ id: "team-11" }],
      total: 11,
      page: 2,
      pageSize: 10
    });
    const where = {
      companyId: "company-a",
      deletedAt: null,
      OR: ["name", "description"].map((field) => ({
        [field]: { contains: "ops", mode: "insensitive" }
      }))
    };
    expect(persistence.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: expect.objectContaining({ members: expect.any(Object) })
      })
    );
    expect(persistence.team.count).toHaveBeenCalledWith({ where });
  });

  it("composes role pagination and search from HTTP through the real service", async () => {
    const response = await request(testApp()).get(
      "/rbac/roles?search=%20operator%20&page=3&pageSize=5"
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [{ id: "role-11" }],
      total: 11,
      page: 3,
      pageSize: 5
    });
    const where = {
      companyId: "company-a",
      deletedAt: null,
      OR: ["name", "description"].map((field) => ({
        [field]: { contains: "operator", mode: "insensitive" }
      }))
    };
    expect(persistence.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 5,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: expect.objectContaining({
          permissions: expect.any(Object),
          _count: expect.any(Object)
        })
      })
    );
    expect(persistence.role.count).toHaveBeenCalledWith({ where });
  });

  it("composes permission pagination and rejects values above the canonical limit", async () => {
    const response = await request(testApp()).get(
      "/rbac/permissions?page=2&pageSize=10&companyId=company-b"
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [{ id: "permission-11" }],
      total: 11,
      page: 2,
      pageSize: 10
    });
    const where = { companyId: "company-a", deletedAt: null };
    expect(persistence.permission.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy: [{ resource: "asc" }, { action: "asc" }, { id: "asc" }]
    });
    expect(persistence.permission.count).toHaveBeenCalledWith({ where });

    persistence.permission.findMany.mockClear();
    persistence.permission.count.mockClear();
    const rejected = await request(testApp()).get("/rbac/permissions?page=10001&pageSize=10");
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("BAD_REQUEST");
    expect(persistence.permission.findMany).not.toHaveBeenCalled();
    expect(persistence.permission.count).not.toHaveBeenCalled();
  });
});
