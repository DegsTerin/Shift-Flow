// en-GB: Handles comments HTTP requests so transport concerns remain separate from business behaviour.
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { CommentsService } from "./comments.service.js";

export const CommentsController = new CrudController(new CommentsService());
