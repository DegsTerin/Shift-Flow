// en-GB: Handles rbac HTTP requests so transport concerns remain separate from business behaviour.
import type { Response } from "express";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { uuidParam } from "../../shared/http/params.js";
import { created, ok } from "../../shared/http/response.js";
import { RbacService } from "./rbac.service.js";

const roles = new CrudController(RbacService.roles);
const permissions = new CrudController(RbacService.permissions);

export const RbacController = {
  roles,
  permissions,
  assignRole: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.status(201).json(created(await RbacService.assignRole(req.auth, req.tenant, req.body)));
  }),
  assignPermission: asyncHandler(async (req: ApiRequest, res: Response) => {
    res
      .status(201)
      .json(
        created(
          await RbacService.assignPermission(
            req.auth,
            req.tenant,
            uuidParam(req.params.roleId, "roleId"),
            req.body.permissionId
          )
        )
      );
  }),
  removePermission: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await RbacService.removePermission(
          req.auth,
          req.tenant,
          uuidParam(req.params.roleId, "roleId"),
          uuidParam(req.params.permissionId, "permissionId")
        )
      )
    );
  }),
  duplicateRole: asyncHandler(async (req: ApiRequest, res: Response) => {
    res
      .status(201)
      .json(created(await RbacService.roles.duplicate(req, uuidParam(req.params.id, "id"))));
  }),
  check: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok({
        allowed: req.auth
          ? await RbacService.hasPermission(req.auth, {
              resource: String(req.query.resource),
              action: String(req.query.action),
              tenant: req.tenant
            })
          : false
      })
    );
  })
};
