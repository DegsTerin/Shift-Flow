// en-GB: Proves Shift command HTTP wiring, UUID validation and write-permission enforcement.
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { conflict, notFound, unauthorized } from "../../shared/errors/app-error.js";
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

  it("routes bounded coverage GET with shifts:read and serialises its public dates", async () => {
    const row = {
      id: "coverage-a",
      startsAt: new Date("2026-09-04T09:00:00.123Z"),
      endsAt: new Date("2026-09-04T17:00:00Z")
    };
    const read = vi
      .spyOn(ShiftsService.prototype, "listCoverages")
      .mockResolvedValue({ items: [row], total: 26, page: 2, pageSize: 25 });
    const response = await request(app()).get(
      `/api/shifts/${shiftId}/coverages?page=2&pageSize=25`
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [
        {
          id: "coverage-a",
          startsAt: "2026-09-04T09:00:00.123Z",
          endsAt: "2026-09-04T17:00:00.000Z"
        }
      ],
      total: 26,
      page: 2,
      pageSize: 25
    });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { companyId: "company-a" },
        query: { page: 2, pageSize: 25 }
      }),
      shiftId
    );
    expect(RbacService.hasPermission).toHaveBeenCalledOnce();
    expect(RbacService.hasPermission).toHaveBeenCalledWith(expect.any(Object), {
      resource: "shifts",
      action: "read",
      tenant: { companyId: "company-a" }
    });
  });

  it("supplies existing default coverage pagination", async () => {
    const read = vi
      .spyOn(ShiftsService.prototype, "listCoverages")
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    expect((await request(app()).get(`/api/shifts/${shiftId}/coverages`)).status).toBe(200);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ query: { page: 1, pageSize: 25 } }),
      shiftId
    );
  });

  it.each(["page=0", "page=10001", "page=1.5", "pageSize=101", "pageSize=0", "page=1&page=2"])(
    "rejects invalid coverage pagination %s before the service",
    async (query) => {
      const read = vi.spyOn(ShiftsService.prototype, "listCoverages");
      expect((await request(app()).get(`/api/shifts/${shiftId}/coverages?${query}`)).status).toBe(
        400
      );
      expect(read).not.toHaveBeenCalled();
    }
  );

  it("validates the coverage parent UUID and propagates a scoped 404", async () => {
    const read = vi
      .spyOn(ShiftsService.prototype, "listCoverages")
      .mockRejectedValue(notFound("Shift not found"));
    expect((await request(app()).get("/api/shifts/invalid/coverages")).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    expect((await request(app()).get(`/api/shifts/${shiftId}/coverages`)).status).toBe(404);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "rejects coverage GET without read authority or authentication=%s",
    async (authenticated) => {
      principal.authenticated = authenticated;
      vi.mocked(RbacService.hasPermission).mockResolvedValue(false);
      const read = vi.spyOn(ShiftsService.prototype, "listCoverages");
      expect((await request(app()).get(`/api/shifts/${shiftId}/coverages`)).status).toBe(
        authenticated ? 403 : 401
      );
      expect(read).not.toHaveBeenCalled();
    }
  );

  it("preserves strict POST strings and the existing write-permission boundary", async () => {
    const data = {
      userId: "8f536533-317b-41ea-ab86-d7545910e3cb",
      startsAt: "2026-09-04t09:00:00.123456789012z",
      endsAt: "2026-09-04T17:00:00+01:00"
    };
    const mutation = vi
      .spyOn(ShiftsService.prototype, "addCoverage")
      .mockResolvedValue({ id: "coverage-a" });
    const response = await request(app()).post(`/api/shifts/${shiftId}/coverages`).send(data);
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: "coverage-a" });
    expect(mutation).toHaveBeenCalledWith(expect.any(Object), shiftId, {
      ...data,
      type: "REGULAR"
    });
    expect(RbacService.hasPermission).toHaveBeenCalledWith(expect.any(Object), {
      resource: "shifts",
      action: "write",
      tenant: { companyId: "company-a" }
    });
    vi.mocked(RbacService.hasPermission).mockResolvedValue(false);
    expect((await request(app()).post(`/api/shifts/${shiftId}/coverages`).send(data)).status).toBe(
      403
    );
    expect(mutation).toHaveBeenCalledOnce();
  });

  it.each([null, true, 0, "2026-09-04", "2026-09-04T09:00", "2026-02-30T09:00:00Z"])(
    "rejects coercive POST date %j before mutation",
    async (startsAt) => {
      const mutation = vi.spyOn(ShiftsService.prototype, "addCoverage");
      const response = await request(app()).post(`/api/shifts/${shiftId}/coverages`).send({
        userId: "8f536533-317b-41ea-ab86-d7545910e3cb",
        startsAt,
        endsAt: "2026-09-04T17:00:00Z"
      });
      expect(response.status).toBe(400);
      expect(mutation).not.toHaveBeenCalled();
    }
  );
});
