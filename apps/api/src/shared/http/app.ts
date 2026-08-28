// en-GB: Defines the app implementation so this project responsibility remains explicit and maintainable.
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { authRoutes } from "../../modules/auth/auth.routes.js";
import { clientRoutes } from "../../modules/clients/clients.routes.js";
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
import { configuredCorsOrigins, configuredTrustProxy, env } from "../config/env.js";
import { rateLimit } from "../middlewares/rate-limit.js";
import { requestContext } from "../middlewares/request-context.js";
import { requestLogger } from "../middlewares/request-logger.js";
import { tenantContext } from "../middlewares/tenant-context.js";
import { verifyOrigin } from "../middlewares/verify-origin.js";
import { errorHandler, notFoundHandler } from "../middlewares/error-handler.js";
import { checkReadiness } from "../services/readiness.service.js";

export function createServer() {
  const app = express();
  const corsOptions = { origin: configuredCorsOrigins, credentials: true };

  app.use(helmet());
  app.set("trust proxy", configuredTrustProxy);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(verifyOrigin);
  app.use(requestContext);
  app.use(tenantContext);
  app.use(rateLimit);
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "shiftflow-api" });
  });

  app.get("/ready", async (_req, res, next) => {
    try {
      await checkReadiness();
      res.status(200).json({
        status: "ready",
        service: "shiftflow-api",
        environment: env.NODE_ENV
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/clients", clientRoutes);
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
