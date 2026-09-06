// en-GB: Defines the error handler implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
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

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: "Validation failed",
        details: env.NODE_ENV === "production" ? undefined : error.flatten()
      }
    });
    return;
  }

  if (isBodyParserError(error)) {
    const payloadTooLarge = error.type === "entity.too.large" || error.status === 413;
    res.status(payloadTooLarge ? 413 : 400).json({
      error: {
        code: payloadTooLarge ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
        message: payloadTooLarge ? "Request body exceeds the allowed size" : "Malformed JSON body"
      }
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error("application_error", {
        requestId: apiReq.context?.requestId,
        code: error.code,
        statusCode: error.statusCode,
        error
      });
    }

    if (error.retryAfterSeconds !== undefined) {
      res.setHeader("retry-after", String(error.retryAfterSeconds));
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

function isBodyParserError(
  error: unknown
): error is { status?: number; type: "entity.parse.failed" | "entity.too.large" } {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return false;
  }
  const type = (error as { type?: unknown }).type;
  return type === "entity.parse.failed" || type === "entity.too.large";
}
