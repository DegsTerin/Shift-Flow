// en-GB: Exercises auth behaviour so regressions at this boundary are detected automatically.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { AuthController } from "./auth.controller.js";
import { authRoutes } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { AppError } from "../../shared/errors/app-error.js";
import { logger } from "../../shared/observability/logger.js";
import * as authenticateMiddleware from "../../shared/middlewares/authenticate.js";
import { requestContext } from "../../shared/middlewares/request-context.js";
import { rateLimit, resetRateLimitBuckets } from "../../shared/middlewares/rate-limit.js";

function cookieHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join("; ") : (value ?? "");
}

describe("AuthController", () => {
  afterEach(() => {
    resetRateLimitBuckets();
    vi.restoreAllMocks();
  });

  it("sets protected session cookies for direct demo access", async () => {
    vi.spyOn(AuthService.prototype, "openDemoSession").mockResolvedValue({
      accessToken: "demo-access-token",
      refreshToken: "demo-refresh-token",
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "demo-user",
        email: "demo@shiftflow.local",
        displayName: "Demo User",
        companyId: "demo-company",
        permissions: ["dashboard:read"]
      }
    });

    const app = express();
    app.use(express.json());
    app.post("/api/auth/demo", AuthController.demo);
    app.use(errorHandler);

    const response = await request(app).post("/api/auth/demo").send({});

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      accessToken: "demo-access-token",
      authenticationMode: "demo",
      user: { email: "demo@shiftflow.local" }
    });
    expect(response.body.data.refreshToken).toBeUndefined();
    const cookies = cookieHeader(response.headers["set-cookie"]);
    expect(cookies).toContain("shiftflow_refresh=demo-refresh-token");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("shiftflow_csrf=");
  });

  it("sets protected session cookies without exposing a credential for portfolio access", async () => {
    vi.spyOn(AuthService.prototype, "openPortfolioSession").mockResolvedValue({
      accessToken: "portfolio-access-token",
      refreshToken: "portfolio-refresh-token",
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "portfolio-user",
        email: "observador.executivo@shiftflow.local",
        displayName: "Portfolio Viewer",
        companyId: "portfolio-company",
        permissions: ["dashboard:read", "activities:read"]
      }
    });

    const app = express();
    app.use(express.json());
    app.post("/api/auth/portfolio", AuthController.portfolio);
    app.use(errorHandler);

    const response = await request(app).post("/api/auth/portfolio").send({});

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      accessToken: "portfolio-access-token",
      authenticationMode: "portfolio",
      user: { email: "observador.executivo@shiftflow.local" }
    });
    expect(response.body.data.refreshToken).toBeUndefined();
    const cookies = cookieHeader(response.headers["set-cookie"]);
    expect(cookies).toContain("shiftflow_refresh=portfolio-refresh-token");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("shiftflow_csrf=");
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

  it("keeps the current cookie when an immediate refresh reuses the valid token", async () => {
    vi.spyOn(AuthService.prototype, "refresh").mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "current-token",
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "User",
        companyId: "company-1",
        permissions: ["dashboard:read"]
      }
    });

    const app = express();
    app.use(express.json());
    app.post("/api/auth/refresh", AuthController.refresh);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "shiftflow_refresh=current-token; shiftflow_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBe("new-access-token");
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(cookieHeader(response.headers["set-cookie"])).toContain(
      "shiftflow_refresh=current-token"
    );
  });

  it("always clears the refresh cookie on logout, even when revocation fails", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
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

  it("still revokes the refresh token when durable access-token revocation fails", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(authenticateMiddleware, "revokeAccessToken").mockRejectedValue(
      new AppError("Unable to persist access revocation", 503, "REVOCATION_UNAVAILABLE")
    );
    const logout = vi.spyOn(AuthService.prototype, "logout").mockResolvedValue({ loggedOut: true });

    const app = express();
    app.use(express.json());
    app.post("/api/auth/logout", AuthController.logout);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", "Bearer signed-access-token")
      .set("Cookie", "shiftflow_refresh=refresh-token; shiftflow_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({});

    expect(response.status).toBe(503);
    expect(logout).toHaveBeenCalledWith("refresh-token");
    expect(response.headers["set-cookie"]).toBeDefined();
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

  it("does not accept refresh tokens from the request body", async () => {
    const refresh = vi
      .spyOn(AuthService.prototype, "refresh")
      .mockRejectedValue(new AppError("Invalid refresh token", 401, "UNAUTHORIZED"));

    const app = express();
    app.use(express.json());
    app.post("/api/auth/refresh", AuthController.refresh);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "body-refresh-token-should-not-be-used" });

    expect(response.status).toBe(401);
    expect(refresh).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("does not let the low direct-access budget lock out a correct password behind NAT", async () => {
    vi.spyOn(AuthService.prototype, "login").mockImplementation(async (_req, input) => {
      if (input.email !== "user@example.com") {
        throw new AppError("Invalid credentials", 401, "UNAUTHORIZED");
      }
      return {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: "user-1",
          email: input.email,
          displayName: "User",
          companyId: "company-1",
          permissions: ["dashboard:read"]
        }
      };
    });

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use(rateLimit);
    app.use("/api/auth", authRoutes);
    app.use(errorHandler);

    for (let index = 0; index < 10; index += 1) {
      const attack = await request(app)
        .post("/api/auth/login")
        .send({ email: `spray-${index}@example.com`, password: "wrong-password" });
      expect(attack.status).toBe(401);
    }

    const legitimate = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "correct-password" });
    expect(legitimate.status).toBe(200);
    expect(cookieHeader(legitimate.headers["set-cookie"])).toContain(
      "shiftflow_refresh=refresh-token"
    );
  });

  it("returns a bounded retry hint when password verification capacity is busy", async () => {
    vi.spyOn(AuthService.prototype, "login").mockRejectedValue(
      new AppError(
        "Authentication capacity is temporarily busy",
        429,
        "AUTHENTICATION_BUSY",
        undefined,
        30
      )
    );
    const app = express();
    app.use(express.json());
    app.post("/api/auth/login", AuthController.login);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "correct-password" });

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("30");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body.error).toEqual({
      code: "AUTHENTICATION_BUSY",
      message: "Authentication capacity is temporarily busy"
    });
  });
});
