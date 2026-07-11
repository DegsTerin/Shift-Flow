// en-GB: Registers audit endpoints and middleware so the request flow remains explicit.
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { AuditController } from "./audit.controller.js";
import { auditFilterSchema } from "./audit.validators.js";

export const auditRoutes = Router();

auditRoutes.use(authenticate);
auditRoutes.get(
  "/",
  requirePermission("audit", "read"),
  validate("query", auditFilterSchema.partial()),
  AuditController.list
);
auditRoutes.get("/:id", requirePermission("audit", "read"), AuditController.get);
