import { CrudController } from "../../shared/controllers/crud.controller.js";
import { UsersService } from "./users.service.js";

export const UsersController = new CrudController(new UsersService());
