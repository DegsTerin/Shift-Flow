import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requirePermission } from "../../shared/middlewares/authorize.js";
import { validate } from "../../shared/middlewares/validate.js";
import { ClientsController } from "./clients.controller.js";
import { clientSchema } from "./clients.validators.js";

export const clientRoutes = Router();

clientRoutes.use(authenticate);
clientRoutes.get("/", requirePermission("clients", "read"), ClientsController.list);
clientRoutes.post("/", requirePermission("clients", "write"), validate("body", clientSchema), ClientsController.create);
clientRoutes.get("/:id", requirePermission("clients", "read"), ClientsController.get);
clientRoutes.patch("/:id", requirePermission("clients", "write"), validate("body", clientSchema.partial()), ClientsController.update);
clientRoutes.delete("/:id", requirePermission("clients", "delete"), ClientsController.remove);
