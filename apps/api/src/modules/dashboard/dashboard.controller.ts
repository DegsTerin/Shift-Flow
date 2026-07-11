// en-GB: Handles dashboard HTTP requests so transport concerns remain separate from business behaviour.
import type { Response } from "express";
import { asyncHandler } from "../../shared/http/async-handler.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { DashboardService } from "./dashboard.service.js";

const service = new DashboardService();

export const DashboardController = {
  summary: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.summary(req)));
  }),
  charts: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.charts(req)));
  }),
  operationalList: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.operationalList(req)));
  }),
  configuration: asyncHandler(async (req: ApiRequest, res: Response) => {
    const params = req.params as { dashboardType: "MAIN" | "TEAM" | "EXECUTIVE" };
    const query = req.query as { teamId?: string };
    res.json(ok(await service.configuration(req, params.dashboardType, query.teamId)));
  }),
  saveConfiguration: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.saveConfiguration(req, req.body)));
  }),
  resetConfiguration: asyncHandler(async (req: ApiRequest, res: Response) => {
    const params = req.params as { dashboardType: "MAIN" | "TEAM" | "EXECUTIVE" };
    const query = req.query as { teamId?: string };
    res.json(ok(await service.resetConfiguration(req, params.dashboardType, query.teamId)));
  })
};
