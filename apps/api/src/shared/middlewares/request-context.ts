// en-GB: Defines the request context implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";

export function requestContext(req: ApiRequest, _res: Response, next: NextFunction) {
  const requestId =
    req.header("x-request-id") ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  req.context = {
    requestId,
    ipAddress: req.ip,
    userAgent: req.header("user-agent")
  };
  _res.setHeader("x-request-id", requestId);
  next();
}
