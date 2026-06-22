import type { Response } from "express";
import type { ApiRequest } from "../http/request-types.js";
import { asyncHandler } from "../http/async-handler.js";
import { param } from "../http/params.js";
import { created, ok } from "../http/response.js";
import type { BaseService } from "../services/base.service.js";

export class CrudController {
  constructor(private readonly service: BaseService) {}

  list = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.list(req)));
  });

  get = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.get(req, param(req.params.id, "id"))));
  });

  create = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.status(201).json(created(await this.service.create(req, req.body)));
  });

  update = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.update(req, param(req.params.id, "id"), req.body)));
  });

  remove = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.remove(req, param(req.params.id, "id"))));
  });
}
