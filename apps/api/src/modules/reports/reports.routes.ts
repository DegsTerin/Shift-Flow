import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { ReportsController } from "./reports.controller.js";
import { reportFilterSchema, shiftReportSchema } from "./reports.validators.js";

export const reportRoutes = Router();

reportRoutes.use(authenticate);
reportRoutes.get(
  "/activities",
  requirePermission("reports", "read"),
  validate("query", reportFilterSchema.partial()),
  ReportsController.activitySummary
);
reportRoutes.get("/shifts", requirePermission("reports", "read"), ReportsController.list);
reportRoutes.post(
  "/shifts",
  requirePermission("reports", "write"),
  validate("body", shiftReportSchema),
  ReportsController.create
);
reportRoutes.get("/shifts/:id", requirePermission("reports", "read"), ReportsController.get);
reportRoutes.patch(
  "/shifts/:id",
  requirePermission("reports", "write"),
  validate("body", shiftReportSchema.partial()),
  ReportsController.update
);
reportRoutes.post(
  "/shifts/:id/submit",
  requirePermission("reports", "write"),
  ReportsController.submit
);
reportRoutes.post(
  "/shifts/:id/approve",
  requirePermission("reports", "approve"),
  ReportsController.approve
);
