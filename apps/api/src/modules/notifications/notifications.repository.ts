import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type NotificationDelegate = {
  updateMany(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
};

export class NotificationsRepository extends BaseRepository {
  constructor() {
    super("notification");
  }

  private async notifications() {
    return getDelegate<NotificationDelegate>("notification");
  }

  async markRead(companyId: string | undefined, recipientId: string, id?: string) {
    return (await this.notifications()).updateMany({
      where: {
        ...(companyId ? { companyId } : {}),
        recipientId,
        ...(id ? { id } : {}),
        readAt: null
      },
      data: { readAt: new Date() }
    });
  }

  async unreadCount(companyId: string | undefined, recipientId: string) {
    return (await this.notifications()).count({
      where: { ...(companyId ? { companyId } : {}), recipientId, readAt: null, deletedAt: null }
    });
  }
}
