// en-GB: Handles users HTTP requests so transport concerns remain separate from business behaviour.
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { UsersService } from "./users.service.js";

export const UsersController = new CrudController(new UsersService());
