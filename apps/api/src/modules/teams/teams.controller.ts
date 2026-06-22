import type { Response } from "express";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { param } from "../../shared/http/params.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { created, ok } from "../../shared/http/response.js";
import { TeamsService } from "./teams.service.js";

const service = new TeamsService();
const crud = new CrudController(service);

export const TeamsController = {
  ...crud,
  addMember: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.status(201).json(created(await service.addMember(req, param(req.params.id, "id"), req.body)));
  }),
  removeMember: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.removeMember(
          req,
          param(req.params.id, "id"),
          param(req.params.userId, "userId"),
        ),
      ),
    );
  }),
};
