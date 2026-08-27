// en-GB: Exercises notification persistence filters so recipient isolation cannot be weakened in the repository.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, updateMany, count, auditCreate, transaction } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn().mockResolvedValue({ findFirst, updateMany, count }),
  getPrisma: vi.fn().mockResolvedValue({ $transaction: transaction })
}));

import { NotificationsRepository } from "./notifications.repository.js";

describe("NotificationsRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue(undefined);
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        notification: { findFirst, updateMany, count },
        auditLog: { create: auditCreate }
      })
    );
  });

  const auditDataFor = (after: unknown) => ({
    entityType: "Notification",
    entityId: "notification-a",
    action: "SOFT_DELETE",
    after,
    companyId: "company-a"
  });

  it("finds notifications only inside the company and recipient boundary", async () => {
    findFirst.mockResolvedValue(null);
    const repository = new NotificationsRepository();

    await repository.findForRecipient("company-a", "recipient-a", "notification-a");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "notification-a",
        companyId: "company-a",
        recipientId: "recipient-a",
        deletedAt: null
      }
    });
  });

  it("does not read after a scoped soft-delete that changed no record", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const repository = new NotificationsRepository();

    await expect(
      repository.softDeleteForRecipient("company-a", "recipient-a", "notification-b", auditDataFor)
    ).resolves.toBeNull();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "notification-b",
        companyId: "company-a",
        recipientId: "recipient-a",
        deletedAt: null
      },
      data: { deletedAt: expect.any(Date) }
    });
    expect(findFirst).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("re-reads a deleted notification within the same recipient boundary", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "notification-a" });
    const repository = new NotificationsRepository();

    await repository.softDeleteForRecipient(
      "company-a",
      "recipient-a",
      "notification-a",
      auditDataFor
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "notification-a",
        companyId: "company-a",
        recipientId: "recipient-a",
        deletedAt: expect.any(Date)
      }
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        entityType: "Notification",
        entityId: "notification-a",
        action: "SOFT_DELETE",
        after: { id: "notification-a" },
        companyId: "company-a"
      }
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("propagates an audit failure from the same transaction", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "notification-a" });
    auditCreate.mockRejectedValue(new Error("audit unavailable"));
    const repository = new NotificationsRepository();

    await expect(
      repository.softDeleteForRecipient("company-a", "recipient-a", "notification-a", auditDataFor)
    ).rejects.toThrow("audit unavailable");

    expect(transaction).toHaveBeenCalledOnce();
  });

  it("marks only unread, non-deleted notifications for the recipient", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const repository = new NotificationsRepository();

    await repository.markRead("company-a", "recipient-a", "notification-a");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        recipientId: "recipient-a",
        id: "notification-a",
        readAt: null,
        deletedAt: null
      },
      data: { readAt: expect.any(Date) }
    });
  });

  it("counts only unread, non-deleted notifications for the recipient", async () => {
    count.mockResolvedValue(0);
    const repository = new NotificationsRepository();

    await repository.unreadCount("company-a", "recipient-a");

    expect(count).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        recipientId: "recipient-a",
        readAt: null,
        deletedAt: null
      }
    });
  });
});
