import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";

export function requestContext(req: ApiRequest, _res: Response, next: NextFunction) {
  req.context = {
    requestId:
      req.header("x-request-id") ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    ipAddress: req.ip,
    userAgent: req.header("user-agent")
  };
  next();
}
