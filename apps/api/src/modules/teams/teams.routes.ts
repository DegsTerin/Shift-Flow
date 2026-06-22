import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { TeamsController } from "./teams.controller.js";
import { teamMemberSchema, teamSchema } from "./teams.validators.js";

export const teamRoutes = Router();

teamRoutes.use(authenticate);
teamRoutes.get("/", requirePermission("teams", "read"), TeamsController.list);
teamRoutes.post("/", requirePermission("teams", "write"), validate("body", teamSchema), TeamsController.create);
teamRoutes.get("/:id", requirePermission("teams", "read"), TeamsController.get);
teamRoutes.patch("/:id", requirePermission("teams", "write"), validate("body", teamSchema.partial()), TeamsController.update);
teamRoutes.delete("/:id", requirePermission("teams", "delete"), TeamsController.remove);
teamRoutes.post("/:id/members", requirePermission("teams", "write"), validate("body", teamMemberSchema), TeamsController.addMember);
teamRoutes.delete("/:id/members/:userId", requirePermission("teams", "write"), TeamsController.removeMember);
