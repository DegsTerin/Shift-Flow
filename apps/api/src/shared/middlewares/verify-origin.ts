import type { NextFunction, Response } from "express";
import { configuredCorsOrigins, requireOriginOnUnsafeRequests } from "../config/env.js";
import type { ApiRequest } from "../http/request-types.js";
import { forbidden } from "../errors/app-error.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originFromReferer(referer: string | undefined) {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function verifyOrigin(req: ApiRequest, _res: Response, next: NextFunction) {
  if (!unsafeMethods.has(req.method)) {
    next();
    return;
  }

  const origin = req.header("origin") ?? originFromReferer(req.header("referer"));

  if (!origin) {
    if (requireOriginOnUnsafeRequests) {
      next(forbidden("Request origin is required"));
      return;
    }
    next();
    return;
  }

  if (!configuredCorsOrigins.includes(origin)) {
    next(forbidden("Invalid request origin"));
    return;
  }

  next();
}
