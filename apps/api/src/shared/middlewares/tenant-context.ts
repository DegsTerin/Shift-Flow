import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";

export function tenantContext(req: ApiRequest, _res: Response, next: NextFunction) {
  req.tenant = {
    companyId: req.header("x-company-id")?.trim() || undefined,
    clientId: req.header("x-client-id")?.trim() || undefined,
    teamId: req.header("x-team-id")?.trim() || undefined,
    shiftId: req.header("x-shift-id")?.trim() || undefined
  };
  next();
}
