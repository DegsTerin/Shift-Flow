// en-GB: Exercises the session and live-RBAC intersection so restricted tokens cannot regain database authority.
import type { NextFunction, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RbacService } from "../../modules/rbac/rbac.service.js";
import type { ApiRequest } from "../http/request-types.js";
import { requirePermission } from "./authorize.js";

function request(permissions?: string[], portfolioSession = true) {
  return {
    auth: {
      id: "user-1",
      email: "portfolio@shiftflow.local",
      companyId: "company-a",
      permissions,
      ...(portfolioSession ? { sessionKind: "portfolio" as const } : {})
    },
    tenant: { companyId: "company-a" }
  } as ApiRequest;
}

describe("requirePermission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates the portfolio ceiling and live authority decision to the central service", async () => {
    const livePermission = vi.spyOn(RbacService, "hasPermission").mockResolvedValue(false);
    const next = vi.fn() as NextFunction;
    const req = request(["dashboard:read"]);

    await requirePermission("users", "read")(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(livePermission).toHaveBeenCalledWith(req.auth, {
      resource: "users",
      action: "read",
      tenant: req.tenant
    });
  });

  it("rejects a signed permission that live RBAC has revoked", async () => {
    vi.spyOn(RbacService, "hasPermission").mockResolvedValue(false);
    const next = vi.fn() as NextFunction;

    await requirePermission("activities", "read")(
      request(["activities:read"]),
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("continues only when both the signed session and live RBAC grant access", async () => {
    const livePermission = vi.spyOn(RbacService, "hasPermission").mockResolvedValue(true);
    const next = vi.fn() as NextFunction;
    const req = request(["*:*"]);

    await requirePermission("activities", "write")(req, {} as Response, next);

    expect(livePermission).toHaveBeenCalledWith(req.auth, {
      resource: "activities",
      action: "write",
      tenant: req.tenant
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("preserves live tenant-scoped RBAC for conventional sessions without company claims", async () => {
    const livePermission = vi.spyOn(RbacService, "hasPermission").mockResolvedValue(true);
    const next = vi.fn() as NextFunction;
    const req = request([], false);
    req.tenant = { companyId: "company-a", clientId: "client-a", teamId: "team-a" };

    await requirePermission("activities", "write")(req, {} as Response, next);

    expect(livePermission).toHaveBeenCalledWith(req.auth, {
      resource: "activities",
      action: "write",
      tenant: req.tenant
    });
    expect(next).toHaveBeenCalledWith();
  });
});
