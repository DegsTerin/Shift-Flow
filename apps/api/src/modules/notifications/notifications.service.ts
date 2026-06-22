import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
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

  async markRead(req: ApiRequest, id?: string) {
    return this.notificationsRepository.markRead(this.companyId(req), String(req.auth?.id), id);
  }

  async unreadCount(req: ApiRequest) {
    return { unread: await this.notificationsRepository.unreadCount(this.companyId(req), String(req.auth?.id)) };
  }
}
