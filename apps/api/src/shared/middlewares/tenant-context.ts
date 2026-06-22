import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";

export function tenantContext(req: ApiRequest, _res: Response, next: NextFunction) {
  req.tenant = {
    companyId: req.header("x-company-id") ?? undefined,
    clientId: req.header("x-client-id") ?? undefined,
    teamId: req.header("x-team-id") ?? undefined,
    shiftId: req.header("x-shift-id") ?? undefined,
  };
  next();
}
