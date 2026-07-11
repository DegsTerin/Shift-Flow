// en-GB: Defines the error handler implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Request, Response } from "express";
import { AppError, conflict } from "../errors/app-error.js";
import { env } from "../config/env.js";
import type { ApiRequest } from "../http/request-types.js";
import { logger } from "../observability/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`
    }
  });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  void _next;
  const apiReq = req as ApiRequest;

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error("application_error", {
        requestId: apiReq.context?.requestId,
        code: error.code,
        statusCode: error.statusCode,
        error
      });
    }

    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: env.NODE_ENV === "production" ? undefined : error.details
      }
    });
    return;
  }

  if (isPrismaUniqueConstraintError(error)) {
    const fields = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : undefined;
    const message =
      fields && fields.includes("name")
        ? "Ja existe um registro com este nome."
        : "Ja existe um registro com estes dados.";
    const appError = conflict(message, fields ? { fields } : undefined);
    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message,
        details: env.NODE_ENV === "production" ? undefined : appError.details
      }
    });
    return;
  }

  logger.error("unhandled_error", {
    requestId: apiReq.context?.requestId,
    error
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "Unexpected error"
          : error instanceof Error
            ? error.message
            : "Unexpected error"
    }
  });
}

function isPrismaUniqueConstraintError(
  error: unknown
): error is { code: "P2002"; meta?: { target?: unknown } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
