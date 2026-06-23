import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";
import { logger } from "../observability/logger.js";

type RateLimitBucket = {
  resetAt: number;
  count: number;
};

type RateLimitOptions = {
  name: string;
  windowMs: number;
  maxRequests: number;
  key: (req: ApiRequest) => string;
};

const buckets = new Map<string, RateLimitBucket>();
const lastCleanupByLimiter = new Map<string, number>();

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function defaultRateLimitKey(req: ApiRequest) {
  return req.auth?.id ?? req.ip ?? "unknown";
}

function loginRateLimitKey(req: ApiRequest) {
  const email =
    req.body && typeof req.body === "object" && "email" in req.body
      ? String((req.body as { email?: unknown }).email ?? "")
          .trim()
          .toLowerCase()
      : "";
  return hashKey(`${req.ip ?? "unknown"}:${email}`);
}

function cleanupExpiredBuckets(name: string, now: number, cleanupIntervalMs: number) {
  const lastCleanupAt = lastCleanupByLimiter.get(name) ?? 0;
  if (now - lastCleanupAt < cleanupIntervalMs) {
    return;
  }

  lastCleanupByLimiter.set(name, now);
  for (const [key, bucket] of buckets.entries()) {
    if (key.startsWith(`${name}:`) && bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimit({ name, windowMs, maxRequests, key }: RateLimitOptions) {
  const cleanupIntervalMs = Math.max(windowMs, 60_000);

  return function rateLimitMiddleware(req: ApiRequest, res: Response, next: NextFunction) {
    const now = Date.now();
    cleanupExpiredBuckets(name, now, cleanupIntervalMs);

    const keyValue = `${name}:${key(req)}`;
    const current = buckets.get(keyValue);
    const bucket =
      current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(keyValue, bucket);

    res.setHeader("x-rate-limit-limit", String(maxRequests));
    res.setHeader("x-rate-limit-remaining", String(Math.max(maxRequests - bucket.count, 0)));
    res.setHeader("x-rate-limit-reset", new Date(bucket.resetAt).toISOString());

    if (bucket.count > maxRequests) {
      logger.warn("rate_limit_exceeded", {
        requestId: req.context?.requestId,
        limiter: name,
        key: hashKey(keyValue),
        path: req.originalUrl.split("?")[0],
        limit: maxRequests,
        windowMs
      });
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests"
        }
      });
      return;
    }

    next();
  };
}

export const rateLimit = createRateLimit({
  name: "global",
  windowMs: parsePositiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000),
  maxRequests: parsePositiveInteger(process.env.API_RATE_LIMIT_MAX, 600),
  key: defaultRateLimitKey
});

export const loginRateLimit = createRateLimit({
  name: "auth-login",
  windowMs: parsePositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  maxRequests: parsePositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 10),
  key: loginRateLimitKey
});

export function resetRateLimitBuckets() {
  buckets.clear();
  lastCleanupByLimiter.clear();
}
