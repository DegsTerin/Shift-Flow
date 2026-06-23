import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { ActivitiesController } from "./activities.controller.js";
import {
  activitySchema,
  assignActivitySchema,
  moveActivitySchema
} from "./activities.validators.js";

export const activityRoutes = Router();

activityRoutes.use(authenticate);
activityRoutes.get("/", requirePermission("activities", "read"), ActivitiesController.list);
activityRoutes.get("/kanban", requirePermission("activities", "read"), ActivitiesController.kanban);
activityRoutes.post(
  "/",
  requirePermission("activities", "write"),
  validate("body", activitySchema),
  ActivitiesController.create
);
activityRoutes.get("/:id", requirePermission("activities", "read"), ActivitiesController.get);
activityRoutes.patch(
  "/:id",
  requirePermission("activities", "write"),
  validate("body", activitySchema.partial()),
  ActivitiesController.update
);
activityRoutes.delete(
  "/:id",
  requirePermission("activities", "delete"),
  ActivitiesController.remove
);
activityRoutes.post(
  "/:id/move",
  requirePermission("activities", "write"),
  validate("body", moveActivitySchema),
  ActivitiesController.move
);
activityRoutes.post(
  "/:id/assign",
  requirePermission("activities", "write"),
  validate("body", assignActivitySchema),
  ActivitiesController.assign
);
activityRoutes.post(
  "/:id/close",
  requirePermission("activities", "write"),
  ActivitiesController.close
);
activityRoutes.post(
  "/:id/reopen",
  requirePermission("activities", "write"),
  ActivitiesController.reopen
);
