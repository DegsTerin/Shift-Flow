import type { ApiRequest } from "../../shared/http/request-types.js";
import { forbidden } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import {
  activeCompanyId,
  assertActivityInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { CommentsRepository } from "./comments.repository.js";

export class CommentsService extends BaseService {
  constructor() {
    super(new CommentsRepository(), "Comment", {
      userStamps: false,
      orderBy: { createdAt: "desc" }
    });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertActivityInCompany(String(data.activityId), companyId),
      assertUserInCompany(req.auth?.id, companyId)
    ]);
    return super.create(req, { ...data, authorId: req.auth?.id });
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    await this.assertCanMutate(req, id);
    return super.update(req, id, { ...data, editedAt: new Date() });
  }

  override async remove(req: ApiRequest, id: string) {
    await this.assertCanMutate(req, id);
    return super.remove(req, id);
  }

  private async assertCanMutate(req: ApiRequest, id: string) {
    const comment = (await this.get(req, id)) as { authorId?: string | null };
    const permissions = req.auth?.permissions ?? [];
    const canModerate = permissions.includes("*:*") || permissions.includes("comments:moderate");

    if (!canModerate && comment.authorId !== req.auth?.id) {
      throw forbidden("Only the comment author or a moderator can change this comment");
    }
  }
}
