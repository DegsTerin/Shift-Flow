// en-GB: Verifies that comment authorisation, mutation and audit share one root transaction.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { writeAudit } from "../../shared/services/audit-writer.js";
import { RbacService } from "../rbac/rbac.service.js";
import { CommentsRepository } from "./comments.repository.js";
import { CommentsService } from "./comments.service.js";

const persistence = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  getDelegateFrom: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getDelegate: vi.fn(),
  getDelegateFrom: persistence.getDelegateFrom,
  getPrisma: vi.fn(),
  withPrismaTransaction: persistence.withTransaction
}));

vi.mock("../../shared/services/audit-writer.js", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined)
}));

describe("CommentsService transaction composition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("opens one root transaction for the lock, authorisation, update and audit", async () => {
    const lockedContext = {
      id: "comment-a",
      authorId: "author-a",
      clientId: "client-a",
      teamId: "team-a"
    };
    const before = {
      id: "comment-a",
      companyId: "company-a",
      authorId: "author-a",
      body: "Before",
      deletedAt: null
    };
    const after = { ...before, body: "After" };
    const query = vi.fn().mockResolvedValue([lockedContext]);
    const findFirst = vi.fn().mockResolvedValue(before);
    const update = vi.fn().mockResolvedValue(after);
    const transaction = {
      $queryRawUnsafe: query,
      comment: { findFirst, update }
    };
    persistence.withTransaction.mockImplementation(
      async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)
    );
    persistence.getDelegateFrom.mockImplementation(
      (value: Record<string, unknown>, name: string) => value[name]
    );
    const permissionCheck = vi.spyOn(RbacService, "hasPermission").mockResolvedValue(true);
    const request = {
      auth: {
        id: "author-a",
        email: "author@example.com",
        companyId: "company-a"
      },
      tenant: { companyId: "company-a" },
      query: {}
    } as unknown as ApiRequest;

    await expect(
      new CommentsService(new CommentsRepository()).update(request, "comment-a", { body: "After" })
    ).resolves.toEqual(after);

    expect(persistence.withTransaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledBefore(findFirst);
    expect(findFirst).toHaveBeenCalledBefore(update);
    expect(permissionCheck).toHaveBeenCalledWith(
      request.auth,
      expect.objectContaining({
        resource: "comments",
        action: "write",
        tenant: {
          companyId: "company-a",
          clientId: "client-a",
          teamId: "team-a"
        }
      }),
      transaction
    );
    expect(vi.mocked(writeAudit)).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ action: "UPDATE", before, after }),
      transaction
    );
  });
});
