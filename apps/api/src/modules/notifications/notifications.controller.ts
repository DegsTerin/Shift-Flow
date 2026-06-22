import type { Response } from "express";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { param } from "../../shared/http/params.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { NotificationsService } from "./notifications.service.js";

const service = new NotificationsService();
const crud = new CrudController(service);

export const NotificationsController = {
  ...crud,
  markRead: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.markRead(req, param(req.params.id, "id"))));
  }),
  markAllRead: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.markRead(req)));
  }),
  unreadCount: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.unreadCount(req)));
  }),
};
