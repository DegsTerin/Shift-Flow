import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./server.js";
import { resetRateLimitBuckets } from "./shared/middlewares/rate-limit.js";

describe("ShiftFlow API", () => {
  afterEach(() => {
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

  it("rate limits repeated login attempts", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({
        email: "missing@example.com",
        password: "password123"
      });

      expect(response.status).not.toBe(429);
    }

    const response = await request(app).post("/api/auth/login").send({
      email: "missing@example.com",
      password: "password123"
    });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});
