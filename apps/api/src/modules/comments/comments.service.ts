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
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";

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
    return this.commentsRepository.withTransaction(async (_repository, transaction) => {
      await this.assertCanMutate(req, id, "write", transaction);
      return super.update(req, id, { ...data, editedAt: new Date() });
    });
  }

  override async remove(req: ApiRequest, id: string) {
    return this.commentsRepository.withTransaction(async (_repository, transaction) => {
      await this.assertCanMutate(req, id, "delete", transaction);
      return super.remove(req, id);
    });
  }

  private async assertCanMutate(
    req: ApiRequest,
    id: string,
    action: "write" | "delete",
    transaction: PrismaTransactionClient
  ) {
    const companyId = activeCompanyId(req);
    const comment = await this.commentsRepository.findMutationContextForUpdate(
      id,
      companyId,
      transaction
    );
    if (!comment) {
      throw notFound("Comment not found");
    }
    const tenant = {
      companyId,
      clientId: comment.clientId ?? undefined,
      teamId: comment.teamId ?? undefined
    };
    const hasMutationPermission = req.auth
      ? await RbacService.hasPermission(
          req.auth,
          {
            resource: "comments",
            action,
            tenant
          },
          transaction
        )
      : false;
    if (!hasMutationPermission) {
      throw forbidden(`comments:${action} is required for the comment resource`);
    }
    if (comment.authorId === req.auth?.id) {
      return;
    }

    const canModerate = req.auth
      ? await RbacService.hasPermission(
          req.auth,
          {
            resource: "comments",
            action: "moderate",
            tenant
          },
          transaction
        )
      : false;

    if (!canModerate) {
      throw forbidden("Only the comment author or a moderator can change this comment");
    }
  }
}
