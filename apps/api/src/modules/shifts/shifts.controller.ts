// en-GB: Handles shifts HTTP requests so transport concerns remain separate from business behaviour.
import type { Response } from "express";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { uuidParam } from "../../shared/http/params.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { created, ok } from "../../shared/http/response.js";
import { ShiftsService } from "./shifts.service.js";

const service = new ShiftsService();
const crud = new CrudController(service);

export const ShiftsController = {
  ...crud,
  open: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.open(req, uuidParam(req.params.id, "id"))));
  }),
  cancel: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.cancel(req, uuidParam(req.params.id, "id"))));
  }),
  close: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.close(req, uuidParam(req.params.id, "id"))));
  }),
  reopen: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.reopen(req, uuidParam(req.params.id, "id"))));
  }),
  addCoverage: asyncHandler(async (req: ApiRequest, res: Response) => {
    res
      .status(201)
      .json(created(await service.addCoverage(req, uuidParam(req.params.id, "id"), req.body)));
  })
};
