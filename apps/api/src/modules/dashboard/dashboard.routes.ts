// en-GB: Registers dashboard endpoints and middleware so the request flow remains explicit.
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { DashboardController } from "./dashboard.controller.js";
import {
  dashboardConfigurationQuerySchema,
  dashboardConfigurationSchema,
  dashboardFilterSchema,
  dashboardTypeParamSchema
} from "./dashboard.validators.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(authenticate);
dashboardRoutes.get(
  "/summary",
  requirePermission("dashboard", "read"),
  validate("query", dashboardFilterSchema),
  DashboardController.summary
);
dashboardRoutes.get(
  "/charts",
  requirePermission("dashboard", "read"),
  validate("query", dashboardFilterSchema),
  DashboardController.charts
);
dashboardRoutes.get(
  "/operational-list",
  requirePermission("dashboard", "read"),
  validate("query", dashboardFilterSchema),
  DashboardController.operationalList
);
dashboardRoutes.get(
  "/configuration/:dashboardType",
  requirePermission("dashboard", "read"),
  validate("params", dashboardTypeParamSchema),
  validate("query", dashboardConfigurationQuerySchema.partial()),
  DashboardController.configuration
);
dashboardRoutes.put(
  "/configuration/:dashboardType",
  requirePermission("dashboard", "write"),
  validate("params", dashboardTypeParamSchema),
  validate("body", dashboardConfigurationSchema),
  DashboardController.saveConfiguration
);
dashboardRoutes.post(
  "/configuration/:dashboardType/reset",
  requirePermission("dashboard", "write"),
  validate("params", dashboardTypeParamSchema),
  validate("query", dashboardConfigurationQuerySchema.partial()),
  DashboardController.resetConfiguration
);
