import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { DashboardController } from "./dashboard.controller.js";
import { dashboardFilterSchema } from "./dashboard.validators.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(authenticate);
dashboardRoutes.get(
  "/summary",
  requirePermission("dashboard", "read"),
  validate("query", dashboardFilterSchema.partial()),
  DashboardController.summary,
);
dashboardRoutes.get(
  "/charts",
  requirePermission("dashboard", "read"),
  validate("query", dashboardFilterSchema.partial()),
  DashboardController.charts,
);
dashboardRoutes.get(
  "/operational-list",
  requirePermission("dashboard", "read"),
  validate("query", dashboardFilterSchema.partial()),
  DashboardController.operationalList,
);
