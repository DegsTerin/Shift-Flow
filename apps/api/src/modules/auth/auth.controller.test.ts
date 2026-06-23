import express from "express";
import request from "supertest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { AppError } from "../../shared/errors/app-error.js";

describe("AuthController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears the refresh cookie when refresh fails", async () => {
    vi.spyOn(AuthService.prototype, "refresh").mockRejectedValue(
      new AppError("Invalid refresh token", 401, "UNAUTHORIZED")
    );

    const app = express();
    app.use(express.json());
    app.post("/api/auth/refresh", AuthController.refresh);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "shiftflow_refresh=invalid-token")
      .send({});

    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.headers["set-cookie"][0]).toContain("shiftflow_refresh=");
    expect(response.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
  });

  it("always clears the refresh cookie on logout, even when revocation fails", async () => {
    vi.spyOn(AuthService.prototype, "logout").mockRejectedValue(
      new AppError("Unable to revoke token", 500, "INTERNAL_ERROR")
    );

    const app = express();
    app.use(express.json());
    app.post("/api/auth/logout", AuthController.logout);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", "shiftflow_refresh=invalid-token")
      .send({});

    expect(response.status).toBe(500);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.headers["set-cookie"][0]).toContain("shiftflow_refresh=");
    expect(response.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
  });
});
