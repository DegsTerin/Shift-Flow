// en-GB: Exercises rate-limit client attribution so Render proxy traffic does not collapse public login into one bucket.
import express from "express";
import requestAgent from "supertest";
import type { NextFunction, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env.js";
import type { ApiRequest } from "../http/request-types.js";
import { logger } from "../observability/logger.js";
import { parseTrustedProxy } from "../config/trusted-proxy.js";
import {
  directAccessRateLimit,
  maximumRateLimitBuckets,
  rateLimit,
  rateLimitBucketCountForTests,
  rateLimitClientAddress,
  resetRateLimitBuckets
} from "./rate-limit.js";

function request(ip: string, cloudflareAddress?: string, email?: string) {
  return {
    body: email ? { email } : {},
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

  it.each([false, parseTrustedProxy("192.0.2.10")])(
    "ignores direct forwarded headers when the socket peer is not trusted (%j)",
    async (trustProxy) => {
      const app = express();
      app.set("trust proxy", trustProxy);
      app.get("/probe", (req, res) => {
        res.json({ hostname: req.hostname, ip: req.ip, ips: req.ips, protocol: req.protocol });
      });

      const response = await requestAgent(app)
        .get("/probe")
        .set("Host", "service.internal")
        .set("X-Forwarded-For", "203.0.113.10")
        .set("X-Forwarded-Host", "attacker.example")
        .set("X-Forwarded-Proto", "https");

      expect(response.body.ip).not.toBe("203.0.113.10");
      expect(response.body.ips).toEqual([]);
      expect(response.body.protocol).toBe("http");
      expect(response.body.hostname).toBe("service.internal");
    }
  );

  it("accepts forwarded attribution only from an explicitly trusted socket peer", async () => {
    const app = express();
    app.set("trust proxy", parseTrustedProxy("127.0.0.1,::ffff:127.0.0.1,::1"));
    app.get("/probe", (req, res) => res.json({ ip: req.ip, ips: req.ips, protocol: req.protocol }));

    const response = await requestAgent(app)
      .get("/probe")
      .set("X-Forwarded-For", "203.0.113.10")
      .set("X-Forwarded-Proto", "https");

    expect(response.body).toEqual({ ip: "203.0.113.10", ips: ["203.0.113.10"], protocol: "https" });
  });

  it("keeps different Render visitors in separate portfolio-login buckets", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const firstVisitor = request("203.0.113.10", "192.0.2.1");
    const secondVisitor = request("198.51.100.20", "192.0.2.1");

    for (let count = 0; count < env.AUTH_RATE_LIMIT_MAX; count += 1) {
      const next = vi.fn() as NextFunction;
      directAccessRateLimit(firstVisitor, response(), next);
      expect(next).toHaveBeenCalledWith();
    }

    const secondVisitorNext = vi.fn() as NextFunction;
    directAccessRateLimit(secondVisitor, response(), secondVisitorNext);
    expect(secondVisitorNext).toHaveBeenCalledWith();

    const limitedResponse = response();
    directAccessRateLimit(firstVisitor, limitedResponse, vi.fn() as NextFunction);
    expect(limitedResponse.status).toHaveBeenCalledWith(429);
  });

  it("applies one authentication budget per IP across attacker-controlled e-mails", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const address = "203.0.113.10";

    for (let count = 0; count < env.AUTH_RATE_LIMIT_MAX; count += 1) {
      const next = vi.fn() as NextFunction;
      directAccessRateLimit(
        request(address, undefined, `spray-${count}@example.com`),
        response(),
        next
      );
      expect(next).toHaveBeenCalledWith();
    }

    const limitedResponse = response();
    directAccessRateLimit(
      request(address, undefined, "fresh-identity@example.com"),
      limitedResponse,
      vi.fn() as NextFunction
    );
    expect(limitedResponse.status).toHaveBeenCalledWith(429);
  });

  it("sheds at the fixed per-limiter cap while keeping store cardinality isolated", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    for (let index = 0; index < maximumRateLimitBuckets; index += 1) {
      directAccessRateLimit(
        request(`2001:db8::${index.toString(16)}`),
        response(),
        vi.fn() as NextFunction
      );
    }
    expect(rateLimitBucketCountForTests("auth-direct-access")).toBe(maximumRateLimitBuckets);

    const shed = response();
    directAccessRateLimit(request("2001:db8:ffff::1"), shed, vi.fn() as NextFunction);
    expect(shed.status).toHaveBeenCalledWith(429);
    expect(shed.json).toHaveBeenCalledWith({
      error: { code: "RATE_LIMIT_CAPACITY", message: "Too many requests" }
    });
    const retryAfter = vi
      .mocked(shed.setHeader)
      .mock.calls.find(([name]) => name === "retry-after")?.[1];
    expect(Number(retryAfter)).toBeGreaterThan(60);
    expect(Number(retryAfter)).toBeLessThanOrEqual(
      Math.ceil(env.AUTH_RATE_LIMIT_WINDOW_MS / 1_000)
    );
    expect(rateLimitBucketCountForTests("auth-direct-access")).toBe(maximumRateLimitBuckets);

    const globalNext = vi.fn() as NextFunction;
    rateLimit(request("198.51.100.40"), response(), globalNext);
    expect(globalNext).toHaveBeenCalledWith();
    expect(rateLimitBucketCountForTests("global")).toBe(1);
  });

  it("charges direct-access traffic to the global limiter before its route limiter", async () => {
    const app = express();
    app.use(rateLimit);
    app.post("/portfolio", directAccessRateLimit, (_req, res) => res.status(204).send());

    const response = await requestAgent(app).post("/portfolio");

    expect(response.status).toBe(204);
    expect(rateLimitBucketCountForTests("global")).toBe(1);
    expect(rateLimitBucketCountForTests("auth-direct-access")).toBe(1);
  });
});
