import type { NextFunction, Response } from "express";
import { forbidden } from "../errors/app-error.js";
import type { ApiRequest } from "../http/request-types.js";
import { RbacService } from "../../modules/rbac/rbac.service.js";

export function requirePermission(resource: string, action: string) {
  return async (req: ApiRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(forbidden());
      return;
    }

    const hasPermission = await RbacService.hasPermission(req.auth, {
      resource,
      action,
      tenant: req.tenant,
    });

    if (!hasPermission) {
      next(forbidden(`${resource}:${action} is required`));
      return;
    }

    next();
  };
}
