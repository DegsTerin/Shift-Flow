import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../errors/app-error.js";

type Source = "body" | "query" | "params";

export function validate(source: Source, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(badRequest("Validation failed", result.error.flatten()));
      return;
    }

    if (source === "query") {
      Object.assign(req.query, result.data);
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}
