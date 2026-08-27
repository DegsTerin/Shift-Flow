// en-GB: Encapsulates notifications persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate, getPrisma } from "../../shared/lib/prisma.js";

type NotificationDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
  updateMany(args: unknown): Promise<{ count: number }>;
  count(args: unknown): Promise<number>;
};

type AuditDelegate = {
  create(args: unknown): Promise<unknown>;
};

type TransactionClient = {
  notification: NotificationDelegate;
  auditLog: AuditDelegate;
};

export class NotificationsRepository extends BaseRepository {
  constructor() {
    super("notification");
  }

  private async notifications() {
    return getDelegate<NotificationDelegate>("notification");
  }

  async findForRecipient(companyId: string, recipientId: string, id: string) {
    return (await this.notifications()).findFirst({
      where: { id, companyId, recipientId, deletedAt: null }
    });
  }

  async softDeleteForRecipient(
    companyId: string,
    recipientId: string,
    id: string,
    auditDataFor: (removed: unknown) => Record<string, unknown>
  ) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      const result = await tx.notification.updateMany({
        where: { id, companyId, recipientId, deletedAt: null },
        data: { deletedAt }
      });
      if (result.count !== 1) {
        return null;
      }
      const removed = await tx.notification.findFirst({
        where: { id, companyId, recipientId, deletedAt }
      });
      if (!removed) {
        throw new Error("Deleted notification could not be read inside its transaction");
      }
      await tx.auditLog.create({ data: auditDataFor(removed) });
      return removed;
    });
  }

  async markRead(companyId: string, recipientId: string, id?: string) {
    return (await this.notifications()).updateMany({
      where: {
        companyId,
        recipientId,
        ...(id ? { id } : {}),
        readAt: null,
        deletedAt: null
      },
      data: { readAt: new Date() }
    });
  }

  async unreadCount(companyId: string, recipientId: string) {
    return (await this.notifications()).count({
      where: { companyId, recipientId, readAt: null, deletedAt: null }
    });
  }
}
