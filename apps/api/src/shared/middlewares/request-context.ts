// en-GB: Defines the request context implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Response } from "express";
import crypto from "node:crypto";
import type { ApiRequest } from "../http/request-types.js";

const safeRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function requestIdFrom(req: ApiRequest) {
  const candidate = req.header("x-request-id");
  return candidate && safeRequestId.test(candidate) ? candidate : crypto.randomUUID();
}

export function requestContext(req: ApiRequest, _res: Response, next: NextFunction) {
  const requestId = requestIdFrom(req);

  req.context = {
    requestId,
    ipAddress: req.ip,
    userAgent: req.header("user-agent")
  };
  _res.setHeader("x-request-id", requestId);
  next();
}
