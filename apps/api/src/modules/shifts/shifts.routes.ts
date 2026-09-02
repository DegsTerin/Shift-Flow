// en-GB: Registers shifts endpoints and middleware so the request flow remains explicit.
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { searchableListQuerySchema } from "../../shared/http/pagination.js";
import { ShiftsController } from "./shifts.controller.js";
import { coverageSchema, shiftCreateSchema, shiftUpdateSchema } from "./shifts.validators.js";

export const shiftRoutes = Router();

shiftRoutes.use(authenticate);
shiftRoutes.get(
  "/",
  requirePermission("shifts", "read"),
  validate("query", searchableListQuerySchema),
  ShiftsController.list
);
shiftRoutes.post(
  "/",
  requirePermission("shifts", "write"),
  validate("body", shiftCreateSchema),
  ShiftsController.create
);
shiftRoutes.get("/:id", requirePermission("shifts", "read"), ShiftsController.get);
shiftRoutes.patch(
  "/:id",
  requirePermission("shifts", "write"),
  validate("body", shiftUpdateSchema),
  ShiftsController.update
);
shiftRoutes.delete("/:id", requirePermission("shifts", "delete"), ShiftsController.remove);
shiftRoutes.post("/:id/close", requirePermission("shifts", "write"), ShiftsController.close);
shiftRoutes.post("/:id/reopen", requirePermission("shifts", "write"), ShiftsController.reopen);
shiftRoutes.post(
  "/:id/coverages",
  requirePermission("shifts", "write"),
  validate("body", coverageSchema),
  ShiftsController.addCoverage
);
