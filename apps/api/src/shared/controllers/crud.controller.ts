// en-GB: Handles application HTTP requests so transport concerns remain separate from business behaviour.
import type { Response } from "express";
import type { ApiRequest } from "../http/request-types.js";
import { asyncHandler } from "../http/async-handler.js";
import { uuidParam } from "../http/params.js";
import { created, ok } from "../http/response.js";
import type { BaseService } from "../services/base.service.js";

export class CrudController {
  constructor(private readonly service: BaseService) {}

  list = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.list(req)));
  });

  get = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.get(req, uuidParam(req.params.id, "id"))));
  });

  create = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.status(201).json(created(await this.service.create(req, req.body)));
  });

  update = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.update(req, uuidParam(req.params.id, "id"), req.body)));
  });

  remove = asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await this.service.remove(req, uuidParam(req.params.id, "id"))));
  });
}
