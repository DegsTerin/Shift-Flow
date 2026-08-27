// en-GB: Registers activities endpoints and middleware so the request flow remains explicit.
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { ActivitiesController } from "./activities.controller.js";
import {
  activityFilterSchema,
  activityNoteSchema,
  activitySchema,
  assignActivitySchema,
  activityTaskColumnSchema,
  activityTaskSchema,
  moveActivitySchema,
  moveActivityTaskSchema,
  reorderTaskColumnsSchema
} from "./activities.validators.js";

export const activityRoutes = Router();

activityRoutes.use(authenticate);
activityRoutes.get(
  "/",
  requirePermission("activities", "read"),
  validate("query", activityFilterSchema),
  ActivitiesController.list
);
activityRoutes.get(
  "/kanban",
  requirePermission("activities", "read"),
  validate("query", activityFilterSchema),
  ActivitiesController.kanban
);
activityRoutes.post(
  "/",
  requirePermission("activities", "write"),
  validate("body", activitySchema),
  ActivitiesController.create
);
activityRoutes.get(
  "/:id/task-board",
  requirePermission("activities", "read"),
  ActivitiesController.taskBoard
);
activityRoutes.post(
  "/:id/task-board/columns",
  requirePermission("activities", "write"),
  validate("body", activityTaskColumnSchema),
  ActivitiesController.createTaskColumn
);
activityRoutes.patch(
  "/:id/task-board/columns/:columnId",
  requirePermission("activities", "write"),
  validate("body", activityTaskColumnSchema.partial()),
  ActivitiesController.updateTaskColumn
);
activityRoutes.delete(
  "/:id/task-board/columns/:columnId",
  requirePermission("activities", "delete"),
  ActivitiesController.deleteTaskColumn
);
activityRoutes.post(
  "/:id/task-board/columns/reorder",
  requirePermission("activities", "write"),
  validate("body", reorderTaskColumnsSchema),
  ActivitiesController.reorderTaskColumns
);
activityRoutes.post(
  "/:id/task-board/tasks",
  requirePermission("activities", "write"),
  validate("body", activityTaskSchema),
  ActivitiesController.createTask
);
activityRoutes.patch(
  "/:id/task-board/tasks/:taskId",
  requirePermission("activities", "write"),
  validate("body", activityTaskSchema.partial()),
  ActivitiesController.updateTask
);
activityRoutes.delete(
  "/:id/task-board/tasks/:taskId",
  requirePermission("activities", "delete"),
  ActivitiesController.deleteTask
);
activityRoutes.post(
  "/:id/task-board/tasks/:taskId/archive",
  requirePermission("activities", "write"),
  ActivitiesController.archiveTask
);
activityRoutes.post(
  "/:id/task-board/tasks/:taskId/move",
  requirePermission("activities", "write"),
  validate("body", moveActivityTaskSchema),
  ActivitiesController.moveTask
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
  validate("body", activityNoteSchema),
  ActivitiesController.close
);
activityRoutes.post(
  "/:id/reopen",
  requirePermission("activities", "write"),
  validate("body", activityNoteSchema),
  ActivitiesController.reopen
);
