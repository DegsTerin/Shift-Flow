// en-GB: Handles audit HTTP requests so transport concerns remain separate from business behaviour.
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { AuditService } from "./audit.service.js";

export const AuditController = new CrudController(new AuditService());
