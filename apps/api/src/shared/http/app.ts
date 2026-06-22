import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { authRoutes } from "../../modules/auth/auth.routes.js";
import { userRoutes } from "../../modules/users/users.routes.js";
import { teamRoutes } from "../../modules/teams/teams.routes.js";
import { shiftRoutes } from "../../modules/shifts/shifts.routes.js";
import { activityRoutes } from "../../modules/activities/activities.routes.js";
import { commentRoutes } from "../../modules/comments/comments.routes.js";
import { notificationRoutes } from "../../modules/notifications/notifications.routes.js";
import { reportRoutes } from "../../modules/reports/reports.routes.js";
import { dashboardRoutes } from "../../modules/dashboard/dashboard.routes.js";
import { auditRoutes } from "../../modules/audit/audit.routes.js";
import { rbacRoutes } from "../../modules/rbac/rbac.routes.js";
import { requestContext } from "../middlewares/request-context.js";
import { tenantContext } from "../middlewares/tenant-context.js";
import { errorHandler, notFoundHandler } from "../middlewares/error-handler.js";

export function createServer() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(requestContext);
  app.use(tenantContext);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "shiftflow-api" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/teams", teamRoutes);
  app.use("/api/shifts", shiftRoutes);
  app.use("/api/activities", activityRoutes);
  app.use("/api/comments", commentRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/rbac", rbacRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
