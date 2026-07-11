// en-GB: Defines the request logger implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";
import { logger } from "../observability/logger.js";

export function requestLogger(req: ApiRequest, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    logger[level]("http_request_completed", {
      requestId: req.context?.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.auth?.id,
      companyId: req.auth?.companyId ?? req.tenant?.companyId
    });
  });

  next();
}
