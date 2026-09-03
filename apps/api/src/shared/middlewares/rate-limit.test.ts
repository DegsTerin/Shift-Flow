// en-GB: Exercises rate-limit client attribution so Render proxy traffic does not collapse public login into one bucket.
import type { NextFunction, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env.js";
import type { ApiRequest } from "../http/request-types.js";
import { logger } from "../observability/logger.js";
import { loginRateLimit, rateLimitClientAddress, resetRateLimitBuckets } from "./rate-limit.js";

function request(ip: string, cloudflareAddress?: string) {
  return {
    body: {},
    context: { requestId: "request-rate-limit" },
    header: vi.fn((name: string) =>
      name.toLowerCase() === "cf-connecting-ip" ? cloudflareAddress : undefined
    ),
    ip,
    originalUrl: "/api/auth/portfolio"
  } as unknown as ApiRequest;
}

function response() {
  const res = {
    json: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response;
}

describe("login rate limiting", () => {
  beforeEach(() => {
    resetRateLimitBuckets();
    vi.stubEnv("RENDER", "true");
  });

  afterEach(() => {
    resetRateLimitBuckets();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses Express proxy attribution and ignores a spoofable vendor header", () => {
    expect(rateLimitClientAddress(request("203.0.113.10", "198.51.100.20"))).toBe("203.0.113.10");
    expect(rateLimitClientAddress(request("10.0.0.5", "not-an-ip"))).toBe("10.0.0.5");
  });

  it("keeps different Render visitors in separate portfolio-login buckets", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const firstVisitor = request("203.0.113.10", "192.0.2.1");
    const secondVisitor = request("198.51.100.20", "192.0.2.1");

    for (let count = 0; count < env.AUTH_RATE_LIMIT_MAX; count += 1) {
      const next = vi.fn() as NextFunction;
      loginRateLimit(firstVisitor, response(), next);
      expect(next).toHaveBeenCalledWith();
    }

    const secondVisitorNext = vi.fn() as NextFunction;
    loginRateLimit(secondVisitor, response(), secondVisitorNext);
    expect(secondVisitorNext).toHaveBeenCalledWith();

    const limitedResponse = response();
    loginRateLimit(firstVisitor, limitedResponse, vi.fn() as NextFunction);
    expect(limitedResponse.status).toHaveBeenCalledWith(429);
  });
});
