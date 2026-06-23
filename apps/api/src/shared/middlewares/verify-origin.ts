import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";
import { forbidden } from "../errors/app-error.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const defaultDevelopmentOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

function configuredOrigins() {
  const configured = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length ? configured : defaultDevelopmentOrigins;
}

export function verifyOrigin(req: ApiRequest, _res: Response, next: NextFunction) {
  if (!unsafeMethods.has(req.method)) {
    next();
    return;
  }

  const allowedOrigins = configuredOrigins();
  const origin = req.header("origin");

  if (!origin) {
    next();
    return;
  }

  if (!allowedOrigins.includes(origin)) {
    next(forbidden("Invalid request origin"));
    return;
  }

  next();
}
