// en-GB: Exercises recipient isolation so notification reads and deletion cannot cross user boundaries.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { buildAuditData } from "../../shared/services/audit-writer.js";
import type { NotificationsRepository } from "./notifications.repository.js";
import { NotificationsService } from "./notifications.service.js";

vi.mock("../../shared/services/audit-writer.js", () => ({
  buildAuditData: vi.fn((_req: unknown, input: Record<string, unknown>) => input),
  writeAudit: vi.fn().mockResolvedValue(undefined)
}));

function makeRequest(): ApiRequest {
  return {
    auth: {
      id: "recipient-a",
      email: "recipient@example.com",
      companyId: "company-a",
      permissions: []
    },
    tenant: { companyId: "company-a" },
    query: {}
  } as unknown as ApiRequest;
}

function serviceWithRepository() {
  const repository = {
    list: vi.fn().mockResolvedValue([{ id: "notification-a" }]),
    count: vi.fn().mockResolvedValue(1),
    findForRecipient: vi.fn(),
    softDeleteForRecipient: vi.fn(),
    markRead: vi.fn().mockResolvedValue({ count: 1 }),
    unreadCount: vi.fn().mockResolvedValue(2)
  };
  return {
    repository,
    service: new NotificationsService(repository as unknown as NotificationsRepository)
  };
}

describe("NotificationsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces list queries to the authenticated recipient", async () => {
    const { service, repository } = serviceWithRepository();

    const result = await service.list(makeRequest(), { recipientId: "recipient-b" });

    expect(result).toMatchObject({ total: 1 });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientId: "recipient-a",
          companyId: "company-a",
          deletedAt: null
        }
      })
    );
    expect(repository.count).toHaveBeenCalledWith({
      recipientId: "recipient-a",
      companyId: "company-a",
      deletedAt: null
    });
  });

  it("does not reveal a notification owned by another recipient", async () => {
    const { service, repository } = serviceWithRepository();
    repository.findForRecipient.mockResolvedValue(null);

    await expect(service.get(makeRequest(), "notification-b")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND"
    });
    expect(repository.findForRecipient).toHaveBeenCalledWith(
      "company-a",
      "recipient-a",
      "notification-b"
    );
  });

  it("soft-deletes only the current recipient notification and writes audit evidence", async () => {
    const { service, repository } = serviceWithRepository();
    const removed = {
      id: "notification-a",
      companyId: "company-a",
      recipientId: "recipient-a",
      deletedAt: new Date()
    };
    repository.softDeleteForRecipient.mockResolvedValue(removed);

    await expect(service.remove(makeRequest(), "notification-a")).resolves.toBe(removed);

    expect(repository.softDeleteForRecipient).toHaveBeenCalledWith(
      "company-a",
      "recipient-a",
      "notification-a",
      expect.any(Function)
    );
    const auditDataFor = repository.softDeleteForRecipient.mock.calls[0]?.[3] as (
      after: unknown
    ) => Record<string, unknown>;
    expect(auditDataFor(removed)).toMatchObject({
      entityType: "Notification",
      entityId: "notification-a",
      action: "SOFT_DELETE",
      companyId: "company-a",
      after: removed
    });
    expect(buildAuditData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Notification",
        entityId: "notification-a",
        action: "SOFT_DELETE",
        companyId: "company-a"
      })
    );
  });

  it("returns not found without audit when no recipient-owned notification is deleted", async () => {
    const { service, repository } = serviceWithRepository();
    repository.softDeleteForRecipient.mockResolvedValue(null);

    await expect(service.remove(makeRequest(), "notification-b")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND"
    });

    expect(repository.softDeleteForRecipient).toHaveBeenCalledWith(
      "company-a",
      "recipient-a",
      "notification-b",
      expect.any(Function)
    );
    expect(buildAuditData).not.toHaveBeenCalled();
  });

  it("marks and counts notifications only for the authenticated recipient", async () => {
    const { service, repository } = serviceWithRepository();

    await service.markRead(makeRequest(), "notification-a");
    await expect(service.unreadCount(makeRequest())).resolves.toEqual({ unread: 2 });

    expect(repository.markRead).toHaveBeenCalledWith("company-a", "recipient-a", "notification-a");
    expect(repository.unreadCount).toHaveBeenCalledWith("company-a", "recipient-a");
  });
});
