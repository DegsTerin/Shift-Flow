// en-GB: Handles clients HTTP requests so transport concerns remain separate from business behaviour.
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { ClientsService } from "./clients.service.js";

export const ClientsController = new CrudController(new ClientsService());
