// en-GB: Implements notifications rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { notFound, unauthorized } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { buildAuditData } from "../../shared/services/audit-writer.js";
import {
  activeCompanyId,
  assertActivityInCompany,
  assertClientInCompany,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { NotificationsRepository } from "./notifications.repository.js";

export class NotificationsService extends BaseService {
  private readonly notificationsRepository: NotificationsRepository;

  constructor(repository = new NotificationsRepository()) {
    super(repository, "Notification", {
      userStamps: false,
      orderBy: { createdAt: "desc" }
    });
    this.notificationsRepository = repository;
  }

  override async list(req: ApiRequest, filters: Record<string, unknown> = {}) {
    return super.list(req, { ...filters, recipientId: this.recipientId(req) });
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.notificationsRepository.findForRecipient(
      activeCompanyId(req),
      this.recipientId(req),
      id
    );
    if (!item) {
      throw notFound("Notification not found");
    }
    return item;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertUserInCompany(String(data.recipientId), companyId),
      assertClientInCompany(data.clientId ? String(data.clientId) : undefined, companyId),
      assertTeamInCompany(data.teamId ? String(data.teamId) : undefined, companyId),
      assertShiftInCompany(data.shiftId ? String(data.shiftId) : undefined, companyId),
      assertActivityInCompany(data.activityId ? String(data.activityId) : undefined, companyId)
    ]);
    return super.create(req, data);
  }

  async markRead(req: ApiRequest, id?: string) {
    return this.notificationsRepository.markRead(activeCompanyId(req), this.recipientId(req), id);
  }

  async unreadCount(req: ApiRequest) {
    return {
      unread: await this.notificationsRepository.unreadCount(
        activeCompanyId(req),
        this.recipientId(req)
      )
    };
  }

  override async remove(req: ApiRequest, id: string) {
    const companyId = activeCompanyId(req);
    const removed = await this.notificationsRepository.softDeleteForRecipient(
      companyId,
      this.recipientId(req),
      id,
      (after) =>
        buildAuditData(req, {
          entityType: "Notification",
          entityId: id,
          action: "SOFT_DELETE",
          after,
          companyId
        })
    );
    if (!removed) {
      throw notFound("Notification not found");
    }
    return removed;
  }

  private recipientId(req: ApiRequest) {
    if (!req.auth?.id) {
      throw unauthorized();
    }
    return req.auth.id;
  }
}
