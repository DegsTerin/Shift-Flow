import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./server.js";

describe("ShiftFlow API", () => {
  it("serves health status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "shiftflow-api",
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
});
