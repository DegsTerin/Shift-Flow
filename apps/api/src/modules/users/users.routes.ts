import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { UsersController } from "./users.controller.js";
import { createUserSchema, updateUserSchema } from "./users.validators.js";

export const userRoutes = Router();

userRoutes.use(authenticate);
userRoutes.get("/", requirePermission("users", "read"), UsersController.list);
userRoutes.post(
  "/",
  requirePermission("users", "write"),
  validate("body", createUserSchema),
  UsersController.create,
);
userRoutes.get("/:id", requirePermission("users", "read"), UsersController.get);
userRoutes.patch(
  "/:id",
  requirePermission("users", "write"),
  validate("body", updateUserSchema),
  UsersController.update,
);
userRoutes.delete("/:id", requirePermission("users", "delete"), UsersController.remove);
