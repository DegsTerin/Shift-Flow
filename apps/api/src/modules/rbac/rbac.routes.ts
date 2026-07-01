import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import {
  assignPermissionSchema,
  assignRoleSchema,
  permissionCheckSchema,
  permissionSchema,
  roleSchema
} from "./rbac.validators.js";
import { RbacController } from "./rbac.controller.js";

export const rbacRoutes = Router();

rbacRoutes.use(authenticate);
rbacRoutes.get("/check", validate("query", permissionCheckSchema), RbacController.check);
rbacRoutes.get("/roles", requirePermission("rbac", "read"), RbacController.roles.list);
rbacRoutes.post(
  "/roles",
  requirePermission("rbac", "write"),
  validate("body", roleSchema),
  RbacController.roles.create
);
rbacRoutes.patch(
  "/roles/:id",
  requirePermission("rbac", "write"),
  validate("body", roleSchema.partial()),
  RbacController.roles.update
);
rbacRoutes.delete(
  "/roles/:id",
  requirePermission("rbac", "delete"),
  RbacController.roles.remove
);
rbacRoutes.post(
  "/roles/:id/duplicate",
  requirePermission("rbac", "write"),
  RbacController.duplicateRole
);
rbacRoutes.post(
  "/roles/:roleId/permissions",
  requirePermission("rbac", "write"),
  validate("body", assignPermissionSchema),
  RbacController.assignPermission
);
rbacRoutes.delete(
  "/roles/:roleId/permissions/:permissionId",
  requirePermission("rbac", "write"),
  RbacController.removePermission
);
rbacRoutes.get("/permissions", requirePermission("rbac", "read"), RbacController.permissions.list);
rbacRoutes.post(
  "/permissions",
  requirePermission("rbac", "write"),
  validate("body", permissionSchema),
  RbacController.permissions.create
);
rbacRoutes.post(
  "/assignments",
  requirePermission("rbac", "write"),
  validate("body", assignRoleSchema),
  RbacController.assignRole
);
