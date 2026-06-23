import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import {
  activeCompanyId,
  assertActivityInCompany,
  assertClientInCompany,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany,
} from "../../shared/services/scope.service.js";
import { NotificationsRepository } from "./notifications.repository.js";

export class NotificationsService extends BaseService {
  private readonly notificationsRepository: NotificationsRepository;

  constructor() {
    const repository = new NotificationsRepository();
    super(repository, "Notification", {
      userStamps: false,
      orderBy: { createdAt: "desc" },
    });
    this.notificationsRepository = repository;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertUserInCompany(String(data.recipientId), companyId),
      assertClientInCompany(data.clientId ? String(data.clientId) : undefined, companyId),
      assertTeamInCompany(data.teamId ? String(data.teamId) : undefined, companyId),
      assertShiftInCompany(data.shiftId ? String(data.shiftId) : undefined, companyId),
      assertActivityInCompany(data.activityId ? String(data.activityId) : undefined, companyId),
    ]);
    return super.create(req, data);
  }

  async markRead(req: ApiRequest, id?: string) {
    return this.notificationsRepository.markRead(this.companyId(req), String(req.auth?.id), id);
  }

  async unreadCount(req: ApiRequest) {
    return { unread: await this.notificationsRepository.unreadCount(this.companyId(req), String(req.auth?.id)) };
  }
}
