import express from "express";
import request from "supertest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { AppError } from "../../shared/errors/app-error.js";

function cookieHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join("; ") : (value ?? "");
}

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
      .set("Cookie", "shiftflow_refresh=invalid-token; shiftflow_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({});

    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeDefined();
    const cookies = cookieHeader(response.headers["set-cookie"]);
    expect(cookies).toContain("shiftflow_refresh=");
    expect(cookies).toContain("shiftflow_csrf=");
    expect(cookies).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookies).toContain("SameSite=Lax");
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
      .set("Cookie", "shiftflow_refresh=invalid-token; shiftflow_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({});

    expect(response.status).toBe(500);
    expect(response.headers["set-cookie"]).toBeDefined();
    const cookies = cookieHeader(response.headers["set-cookie"]);
    expect(cookies).toContain("shiftflow_refresh=");
    expect(cookies).toContain("shiftflow_csrf=");
    expect(cookies).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookies).toContain("SameSite=Lax");
  });

  it("rejects cookie-backed refresh without a matching CSRF token", async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/auth/refresh", AuthController.refresh);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "shiftflow_refresh=invalid-token; shiftflow_csrf=test-csrf")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
