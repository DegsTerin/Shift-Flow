import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { app } from "./server.js";
import { env } from "./shared/config/env.js";
import { errorHandler } from "./shared/middlewares/error-handler.js";
import { loginRateLimit, resetRateLimitBuckets } from "./shared/middlewares/rate-limit.js";
import { validate } from "./shared/middlewares/validate.js";
import { logger } from "./shared/observability/logger.js";

const originalNodeEnv = env.NODE_ENV;

describe("ShiftFlow API", () => {
  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
    resetRateLimitBuckets();
  });

  it("serves health status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body).toEqual({
      status: "ok",
      service: "shiftflow-api"
    });
  });

  it("serves readiness status", async () => {
    const response = await request(app).get("/ready").set("x-request-id", "test-request-id");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("test-request-id");
    expect(response.body).toMatchObject({
      status: "ready",
      service: "shiftflow-api"
    });
  });

  it("returns not found for unknown routes", async () => {
    const response = await request(app).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("protects authenticated API routes", async () => {
    const response = await request(app).get("/api/users");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("exposes rate limit headers", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-rate-limit-limit"]).toBeDefined();
    expect(response.headers["x-rate-limit-remaining"]).toBeDefined();
    expect(response.headers["x-rate-limit-reset"]).toBeDefined();
  });

  it("rejects unsafe requests from untrusted origins", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://evil.example")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("removes unknown validated query parameters while preserving pagination", async () => {
    const validatedApp = express();
    validatedApp.get(
      "/items",
      validate("query", z.object({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() })),
      (req, res) => res.json({ query: req.query })
    );

    const response = await request(validatedApp).get(
      "/items?status=ACTIVE&page=2&pageSize=10&deletedAt=null"
    );

    expect(response.status).toBe(200);
    expect(response.body.query).toEqual({
      status: "ACTIVE",
      page: "2",
      pageSize: "10"
    });
  });

  it("rate limits repeated login attempts", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const rateLimitedApp = express();
    rateLimitedApp.use(express.json());
    rateLimitedApp.post("/login", loginRateLimit, (_req, res) => {
      res.status(204).send();
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(rateLimitedApp).post("/login").send({
        email: "missing@example.com",
        password: "invalid-login-password"
      });

      expect(response.status).toBe(204);
    }

    const response = await request(rateLimitedApp).post("/login").send({
      email: "missing@example.com",
      password: "invalid-login-password"
    });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(warn).toHaveBeenCalledWith("rate_limit_exceeded", expect.any(Object));
  });

  it("does not expose Prisma unique constraint details in production", async () => {
    env.NODE_ENV = "production";
    const productionApp = express();
    productionApp.post("/unique", (_req, _res, next) => {
      next({ code: "P2002", meta: { target: ["email"] } });
    });
    productionApp.use(errorHandler);

    const response = await request(productionApp).post("/unique").send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "CONFLICT",
      message: "Ja existe um registro com estes dados."
    });
  });
});
