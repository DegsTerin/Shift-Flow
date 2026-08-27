// en-GB: Implements comments rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { RbacService } from "../rbac/rbac.service.js";
import {
  activeCompanyId,
  assertActivityInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { CommentsRepository } from "./comments.repository.js";

export class CommentsService extends BaseService {
  constructor(private readonly commentsRepository = new CommentsRepository()) {
    super(commentsRepository, "Comment", {
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
    await this.assertCanMutate(req, id, "write");
    return super.update(req, id, { ...data, editedAt: new Date() });
  }

  override async remove(req: ApiRequest, id: string) {
    await this.assertCanMutate(req, id, "delete");
    return super.remove(req, id);
  }

  private async assertCanMutate(req: ApiRequest, id: string, action: "write" | "delete") {
    const companyId = activeCompanyId(req);
    const comment = (await this.commentsRepository.findMutationContext(id, companyId)) as {
      authorId?: string | null;
      activity?: { clientId?: string | null; teamId?: string | null };
    } | null;
    if (!comment) {
      throw notFound("Comment not found");
    }
    const tenant = {
      companyId,
      clientId: comment.activity?.clientId ?? undefined,
      teamId: comment.activity?.teamId ?? undefined
    };
    const hasMutationPermission = req.auth
      ? await RbacService.hasPermission(req.auth, {
          resource: "comments",
          action,
          tenant
        })
      : false;
    if (!hasMutationPermission) {
      throw forbidden(`comments:${action} is required for the comment resource`);
    }
    if (comment.authorId === req.auth?.id) {
      return;
    }

    const canModerate = req.auth
      ? await RbacService.hasPermission(req.auth, {
          resource: "comments",
          action: "moderate",
          tenant
        })
      : false;

    if (!canModerate) {
      throw forbidden("Only the comment author or a moderator can change this comment");
    }
  }
}
