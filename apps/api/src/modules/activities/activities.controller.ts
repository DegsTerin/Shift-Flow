// en-GB: Handles activities HTTP requests so transport concerns remain separate from business behaviour.
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
    res.json(
      ok(await service.move(req, param(req.params.id, "id"), req.body.status, req.body.note))
    );
  }),
  assign: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(await service.assign(req, param(req.params.id, "id"), req.body.assigneeId, req.body.note))
    );
  }),
  close: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.close(req, param(req.params.id, "id"))));
  }),
  reopen: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.reopen(req, param(req.params.id, "id"), req.body.note)));
  }),
  kanban: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.kanban(req)));
  }),
  taskBoard: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.taskBoard(req, param(req.params.id, "id"))));
  }),
  createTaskColumn: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.createTaskColumn(req, param(req.params.id, "id"), req.body)));
  }),
  updateTaskColumn: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.updateTaskColumn(
          req,
          param(req.params.id, "id"),
          param(req.params.columnId, "columnId"),
          req.body
        )
      )
    );
  }),
  deleteTaskColumn: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.deleteTaskColumn(
          req,
          param(req.params.id, "id"),
          param(req.params.columnId, "columnId")
        )
      )
    );
  }),
  reorderTaskColumns: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(await service.reorderTaskColumns(req, param(req.params.id, "id"), req.body.columnIds))
    );
  }),
  createTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.createTask(req, param(req.params.id, "id"), req.body)));
  }),
  updateTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.updateTask(
          req,
          param(req.params.id, "id"),
          param(req.params.taskId, "taskId"),
          req.body
        )
      )
    );
  }),
  deleteTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.deleteTask(
          req,
          param(req.params.id, "id"),
          param(req.params.taskId, "taskId")
        )
      )
    );
  }),
  archiveTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.archiveTask(
          req,
          param(req.params.id, "id"),
          param(req.params.taskId, "taskId")
        )
      )
    );
  }),
  moveTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.moveTask(
          req,
          param(req.params.id, "id"),
          param(req.params.taskId, "taskId"),
          req.body.columnId,
          req.body.position,
          req.body.note
        )
      )
    );
  })
};
