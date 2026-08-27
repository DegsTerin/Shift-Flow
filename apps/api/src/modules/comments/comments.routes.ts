// en-GB: Registers comments endpoints and middleware so the request flow remains explicit.
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { CommentsController } from "./comments.controller.js";
import { commentSchema, updateCommentSchema } from "./comments.validators.js";

export const commentRoutes = Router();

commentRoutes.use(authenticate);
commentRoutes.get("/", requirePermission("comments", "read"), CommentsController.list);
commentRoutes.post(
  "/",
  requirePermission("comments", "write"),
  validate("body", commentSchema),
  CommentsController.create
);
commentRoutes.get("/:id", requirePermission("comments", "read"), CommentsController.get);
commentRoutes.patch("/:id", validate("body", updateCommentSchema), CommentsController.update);
commentRoutes.delete("/:id", CommentsController.remove);
