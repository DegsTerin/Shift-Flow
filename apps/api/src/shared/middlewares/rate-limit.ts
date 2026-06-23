import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";
import { logger } from "../observability/logger.js";

type RateLimitBucket = {
  resetAt: number;
  count: number;
};

const buckets = new Map<string, RateLimitBucket>();

const windowMs = parsePositiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000);
const maxRequests = parsePositiveInteger(process.env.API_RATE_LIMIT_MAX, 600);
const cleanupIntervalMs = Math.max(windowMs, 60_000);
let lastCleanupAt = 0;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rateLimitKey(req: ApiRequest) {
  return req.auth?.id ?? req.ip ?? "unknown";
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < cleanupIntervalMs) {
    return;
  }

  lastCleanupAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function rateLimit(req: ApiRequest, res: Response, next: NextFunction) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const key = rateLimitKey(req);
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  res.setHeader("x-rate-limit-limit", String(maxRequests));
  res.setHeader("x-rate-limit-remaining", String(Math.max(maxRequests - bucket.count, 0)));
  res.setHeader("x-rate-limit-reset", new Date(bucket.resetAt).toISOString());

  if (bucket.count > maxRequests) {
    logger.warn("rate_limit_exceeded", {
      requestId: req.context?.requestId,
      key,
      path: req.originalUrl,
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
}

export function resetRateLimitBuckets() {
  buckets.clear();
  lastCleanupAt = 0;
}
