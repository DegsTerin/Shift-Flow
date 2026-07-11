// en-GB: Registers notifications endpoints and middleware so the request flow remains explicit.
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { NotificationsController } from "./notifications.controller.js";
import { notificationSchema } from "./notifications.validators.js";

export const notificationRoutes = Router();

notificationRoutes.use(authenticate);
notificationRoutes.get(
  "/",
  requirePermission("notifications", "read"),
  NotificationsController.list
);
notificationRoutes.get(
  "/unread-count",
  requirePermission("notifications", "read"),
  NotificationsController.unreadCount
);
notificationRoutes.post(
  "/",
  requirePermission("notifications", "write"),
  validate("body", notificationSchema),
  NotificationsController.create
);
notificationRoutes.post(
  "/mark-all-read",
  requirePermission("notifications", "write"),
  NotificationsController.markAllRead
);
notificationRoutes.post(
  "/:id/read",
  requirePermission("notifications", "write"),
  NotificationsController.markRead
);
notificationRoutes.delete(
  "/:id",
  requirePermission("notifications", "delete"),
  NotificationsController.remove
);
