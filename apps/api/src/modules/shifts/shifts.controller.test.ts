// en-GB: Proves Shift command HTTP wiring, UUID validation and write-permission enforcement.
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { conflict, unauthorized } from "../../shared/errors/app-error.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { RbacService } from "../rbac/rbac.service.js";
import { ShiftsService } from "./shifts.service.js";
import { shiftRoutes } from "./shifts.routes.js";

const principal = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../../shared/middlewares/authenticate.js", () => ({
  authenticate: (req: ApiRequest, _res: Response, next: NextFunction) => {
    if (!principal.authenticated) return next(unauthorized());
    req.auth = { id: "actor-1", email: "actor@example.com", companyId: "company-a" };
    req.tenant = { companyId: "company-a" };
    next();
  }
}));

const shiftId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const commands = ["open", "close", "reopen", "cancel"] as const;

function app() {
  const application = express();
  application.use(express.json());
  application.use("/api/shifts", shiftRoutes);
  application.use(errorHandler);
  return application;
}

describe("Shift command HTTP boundary", () => {
  beforeEach(() => {
    principal.authenticated = true;
    vi.spyOn(RbacService, "hasPermission").mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(commands)(
    "routes POST %s to the tenant-scoped service with shifts:write",
    async (command) => {
      const mutation = vi
        .spyOn(ShiftsService.prototype, command)
        .mockResolvedValue({ id: shiftId });
      const response = await request(app()).post(`/api/shifts/${shiftId}/${command}`).send({});
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ id: shiftId });
      expect(RbacService.hasPermission).toHaveBeenCalledWith(
        expect.objectContaining({ id: "actor-1", companyId: "company-a" }),
        { resource: "shifts", action: "write", tenant: { companyId: "company-a" } }
      );
      expect(mutation).toHaveBeenCalledWith(
        expect.objectContaining({ tenant: { companyId: "company-a" } }),
        shiftId
      );
    }
  );

  it.each(commands)(
    "rejects %s without write authority before the service runs",
    async (command) => {
      vi.mocked(RbacService.hasPermission).mockResolvedValueOnce(false);
      const mutation = vi
        .spyOn(ShiftsService.prototype, command)
        .mockResolvedValue({ id: shiftId });
      const response = await request(app()).post(`/api/shifts/${shiftId}/${command}`).send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(mutation).not.toHaveBeenCalled();
    }
  );

  it.each(commands)("rejects an invalid UUID for %s before the service runs", async (command) => {
    const mutation = vi.spyOn(ShiftsService.prototype, command).mockResolvedValue({ id: shiftId });
    const response = await request(app()).post(`/api/shifts/not-a-uuid/${command}`).send({});
    expect(response.status).toBe(400);
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each(commands)("preserves a lost-transition conflict from %s", async (command) => {
    vi.spyOn(ShiftsService.prototype, command).mockRejectedValueOnce(
      conflict("Shift status changed during transition")
    );
    const response = await request(app()).post(`/api/shifts/${shiftId}/${command}`).send({});
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "CONFLICT",
      message: "Shift status changed during transition"
    });
  });

  it("does not run permission or mutation handlers without authentication", async () => {
    principal.authenticated = false;
    const mutation = vi.spyOn(ShiftsService.prototype, "open").mockResolvedValue({ id: shiftId });
    const response = await request(app()).post(`/api/shifts/${shiftId}/open`).send({});
    expect(response.status).toBe(401);
    expect(RbacService.hasPermission).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });
});
