// en-GB: Handles activities HTTP requests so transport concerns remain separate from business behaviour.
import type { Response } from "express";
import { CrudController } from "../../shared/controllers/crud.controller.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { uuidParam } from "../../shared/http/params.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { ActivitiesService } from "./activities.service.js";

const service = new ActivitiesService();
const crud = new CrudController(service);

export const ActivitiesController = {
  ...crud,
  move: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(await service.move(req, uuidParam(req.params.id, "id"), req.body.status, req.body.note))
    );
  }),
  assign: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.assign(
          req,
          uuidParam(req.params.id, "id"),
          req.body.assigneeId,
          req.body.note
        )
      )
    );
  }),
  close: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.close(req, uuidParam(req.params.id, "id"), req.body.note)));
  }),
  reopen: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.reopen(req, uuidParam(req.params.id, "id"), req.body.note)));
  }),
  kanban: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.kanban(req)));
  }),
  taskBoard: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.taskBoard(req, uuidParam(req.params.id, "id"))));
  }),
  createTaskColumn: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.createTaskColumn(req, uuidParam(req.params.id, "id"), req.body)));
  }),
  updateTaskColumn: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.updateTaskColumn(
          req,
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.columnId, "columnId"),
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
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.columnId, "columnId")
        )
      )
    );
  }),
  reorderTaskColumns: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(await service.reorderTaskColumns(req, uuidParam(req.params.id, "id"), req.body.columnIds))
    );
  }),
  createTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(await service.createTask(req, uuidParam(req.params.id, "id"), req.body)));
  }),
  updateTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.updateTask(
          req,
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.taskId, "taskId"),
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
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.taskId, "taskId")
        )
      )
    );
  }),
  archiveTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.archiveTask(
          req,
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.taskId, "taskId")
        )
      )
    );
  }),
  restoreTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.restoreTask(
          req,
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.taskId, "taskId"),
          req.body.columnId
        )
      )
    );
  }),
  moveTask: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(
      ok(
        await service.moveTask(
          req,
          uuidParam(req.params.id, "id"),
          uuidParam(req.params.taskId, "taskId"),
          req.body.columnId,
          req.body.position,
          req.body.note
        )
      )
    );
  })
};
