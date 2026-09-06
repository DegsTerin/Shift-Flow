// en-GB: Defines the rate limit implementation so this project responsibility remains explicit and maintainable.
import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import { env } from "../config/env.js";
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

type RateLimitStore = {
  buckets: Map<string, RateLimitBucket>;
  lastCleanupAt: number;
  nextExpiryAt?: number;
};

const cleanupIntervalMs = 60_000;
export const maximumRateLimitBuckets = 10_000;
const rateLimitStores = new Map<string, RateLimitStore>();

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function defaultRateLimitKey(req: ApiRequest) {
  return req.auth?.id ?? req.ip ?? "unknown";
}

export function rateLimitClientAddress(req: ApiRequest) {
  return req.ip ?? "unknown";
}

function directAccessRateLimitKey(req: ApiRequest) {
  return hashKey(rateLimitClientAddress(req));
}

function cleanupExpiredBuckets(store: RateLimitStore, now: number) {
  if (
    now - store.lastCleanupAt < cleanupIntervalMs &&
    (store.nextExpiryAt === undefined || store.nextExpiryAt > now)
  ) {
    return;
  }

  store.lastCleanupAt = now;
  let nextExpiryAt: number | undefined;
  for (const [key, bucket] of store.buckets.entries()) {
    if (bucket.resetAt <= now) {
      store.buckets.delete(key);
    } else {
      nextExpiryAt = Math.min(nextExpiryAt ?? bucket.resetAt, bucket.resetAt);
    }
  }
  store.nextExpiryAt = nextExpiryAt;
}

function createRateLimit({ name, windowMs, maxRequests, key }: RateLimitOptions) {
  const store: RateLimitStore = { buckets: new Map(), lastCleanupAt: 0 };
  rateLimitStores.set(name, store);

  return function rateLimitMiddleware(req: ApiRequest, res: Response, next: NextFunction) {
    const now = Date.now();
    cleanupExpiredBuckets(store, now);

    const keyValue = `${name}:${key(req)}`;
    const current = store.buckets.get(keyValue);
    if (!current && store.buckets.size >= maximumRateLimitBuckets) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((store.nextExpiryAt ?? now + windowMs) - now) / 1_000)
      );
      res.setHeader("x-rate-limit-limit", String(maxRequests));
      res.setHeader("x-rate-limit-remaining", "0");
      res.setHeader("retry-after", String(retryAfterSeconds));
      logger.warn("rate_limit_capacity_exceeded", {
        requestId: req.context?.requestId,
        limiter: name,
        path: req.originalUrl.split("?")[0],
        capacity: maximumRateLimitBuckets
      });
      res.status(429).json({
        error: {
          code: "RATE_LIMIT_CAPACITY",
          message: "Too many requests"
        }
      });
      return;
    }
    const bucket =
      current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    store.buckets.set(keyValue, bucket);
    store.nextExpiryAt = Math.min(store.nextExpiryAt ?? bucket.resetAt, bucket.resetAt);

    res.setHeader("x-rate-limit-limit", String(maxRequests));
    res.setHeader("x-rate-limit-remaining", String(Math.max(maxRequests - bucket.count, 0)));
    res.setHeader("x-rate-limit-reset", new Date(bucket.resetAt).toISOString());

    if (bucket.count > maxRequests) {
      res.setHeader("retry-after", String(Math.ceil((bucket.resetAt - now) / 1000)));
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
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.API_RATE_LIMIT_MAX,
  key: defaultRateLimitKey
});

export const directAccessRateLimit = createRateLimit({
  name: "auth-direct-access",
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.AUTH_RATE_LIMIT_MAX,
  key: directAccessRateLimitKey
});

export function resetRateLimitBuckets() {
  for (const store of rateLimitStores.values()) {
    store.buckets.clear();
    store.lastCleanupAt = 0;
    store.nextExpiryAt = undefined;
  }
}

export function rateLimitBucketCountForTests(name?: "auth-direct-access" | "global") {
  if (name) return rateLimitStores.get(name)?.buckets.size ?? 0;
  return [...rateLimitStores.values()].reduce((total, store) => total + store.buckets.size, 0);
}
