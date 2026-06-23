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
});
