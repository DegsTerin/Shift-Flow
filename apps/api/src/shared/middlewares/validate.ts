// en-GB: Defines the validate implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../errors/app-error.js";

type Source = "body" | "query" | "params";
const paginationQueryKeys = new Set(["page", "pageSize"]);

export function validate(source: Source, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(badRequest("Validation failed", result.error.flatten()));
      return;
    }

    if (source === "query") {
      const pagination = Object.fromEntries(
        Object.entries(req.query).filter(([key]) => paginationQueryKeys.has(key))
      );
      Object.defineProperty(req, "query", {
        value: { ...pagination, ...(result.data as Record<string, unknown>) },
        writable: true,
        configurable: true
      });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}
