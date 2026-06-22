import type { Response } from "express";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { param } from "../../shared/http/params.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { ReportsService } from "./reports.service.js";

const service = new ReportsService();
const crud = new CrudController(service);

export const ReportsController = {
  ...crud,
  activitySummary: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.activitySummary(req)));
  }),
  submit: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.submit(req, param(req.params.id, "id"))));
  }),
  approve: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.approve(req, param(req.params.id, "id"))));
  }),
};
