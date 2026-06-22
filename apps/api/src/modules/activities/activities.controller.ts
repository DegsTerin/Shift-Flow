import type { Response } from "express";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { param } from "../../shared/http/params.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { ActivitiesService } from "./activities.service.js";

const service = new ActivitiesService();
const crud = new CrudController(service);

export const ActivitiesController = {
  ...crud,
  move: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.move(req, param(req.params.id, "id"), req.body.status, req.body.note)));
  }),
  assign: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.assign(req, param(req.params.id, "id"), req.body.assigneeId, req.body.note)));
  }),
  close: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.close(req, param(req.params.id, "id"))));
  }),
  kanban: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.kanban(req)));
  }),
};
