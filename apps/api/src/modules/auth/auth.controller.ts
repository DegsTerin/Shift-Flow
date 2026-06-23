import type { Response } from "express";
import { asyncHandler } from "../../shared/http/async-handler.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { AuthService } from "./auth.service.js";

const service = new AuthService();

export const AuthController = {
  login: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.login(req, req.body)));
  }),

  refresh: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.refresh(req, req.body.refreshToken)));
  }),

  logout: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.logout(req.body.refreshToken)));
  }),

  me: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(req.auth));
  }),
};
