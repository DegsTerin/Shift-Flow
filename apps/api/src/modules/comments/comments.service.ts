import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { CommentsRepository } from "./comments.repository.js";

export class CommentsService extends BaseService {
  constructor() {
    super(new CommentsRepository(), "Comment", {
      userStamps: false,
      orderBy: { createdAt: "desc" },
    });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    return super.create(req, { ...data, authorId: req.auth?.id });
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    return super.update(req, id, { ...data, editedAt: new Date() });
  }
}
