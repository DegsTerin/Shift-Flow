// en-GB: Defines the authorize implementation so this project responsibility remains explicit and maintainable.
import type { NextFunction, Response } from "express";
import { forbidden } from "../errors/app-error.js";
import type { ApiRequest } from "../http/request-types.js";
import { RbacService } from "../../modules/rbac/rbac.service.js";

function sessionGrantsPermission(
  permissions: string[] | undefined,
  resource: string,
  action: string
) {
  const required = `${resource}:${action}`;
  return Boolean(permissions?.includes(required) || permissions?.includes("*:*"));
}

export function requirePermission(resource: string, action: string) {
  return async (req: ApiRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(forbidden());
      return;
    }

    if (
      req.auth.sessionKind === "portfolio" &&
      !sessionGrantsPermission(req.auth.permissions, resource, action)
    ) {
      next(forbidden(`${resource}:${action} is required`));
      return;
    }

    const hasPermission = await RbacService.hasPermission(req.auth, {
      resource,
      action,
      tenant: req.tenant
    });

    if (!hasPermission) {
      next(forbidden(`${resource}:${action} is required`));
      return;
    }

    next();
  };
}
