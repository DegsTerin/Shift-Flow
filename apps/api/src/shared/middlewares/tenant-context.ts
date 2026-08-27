// en-GB: Defines the tenant context implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Response } from "express";
import type { ApiRequest } from "../http/request-types.js";

export function tenantContext(req: ApiRequest, _res: Response, next: NextFunction) {
  // Sub-scope context must come from persisted resources, never caller-controlled headers.
  req.tenant = {
    companyId: req.header("x-company-id")?.trim() || undefined
  };
  next();
}
