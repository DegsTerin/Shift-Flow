// en-GB: Exercises comments behaviour so regressions at this boundary are detected automatically.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { RbacService } from "../rbac/rbac.service.js";
import type { CommentsRepository } from "./comments.repository.js";
import { CommentsService } from "./comments.service.js";

vi.mock("../../shared/services/audit-writer.js", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined)
}));

function makeRequest(permissions: string[] = []): ApiRequest {
  return {
    auth: {
      id: "user-1",
      email: "user@example.com",
      permissions
    },
    tenant: {
      companyId: "company-1"
    },
    query: {}
  } as ApiRequest;
}

function serviceWithRepository(authorId: string) {
  const transaction = { marker: "comments-transaction" } as unknown as PrismaTransactionClient;
  const repository = {
    withTransaction: vi.fn(
      async (
        operation: (
          value: CommentsRepository,
          valueTransaction: PrismaTransactionClient
        ) => Promise<unknown>
      ) => operation(repository as unknown as CommentsRepository, transaction)
    ),
    findMutationContext: vi.fn().mockResolvedValue({
      id: "comment-1",
      authorId,
      activity: { clientId: "client-1", teamId: "team-1" }
    }),
    findById: vi.fn().mockResolvedValue({
      id: "comment-1",
      companyId: "company-1",
      authorId,
      body: "Current comment",
      deletedAt: null
    }),
    update: vi.fn().mockResolvedValue({
      id: "comment-1",
      companyId: "company-1",
      authorId,
      body: "Updated comment",
      deletedAt: null
    }),
    softDelete: vi.fn().mockResolvedValue({
      id: "comment-1",
      companyId: "company-1",
      authorId,
      body: "Current comment",
      deletedAt: new Date()
    })
  };
  const service = new CommentsService(repository as unknown as CommentsRepository);
  return { service, repository };
}

describe("CommentsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the comment author to edit and stamps editedAt", async () => {
    const { service, repository } = serviceWithRepository("user-1");
    const permissionCheck = vi.spyOn(RbacService, "hasPermission").mockResolvedValue(true);

    await service.update(makeRequest(), "comment-1", { body: "Updated comment" });

    expect(repository.update).toHaveBeenCalledWith(
      "comment-1",
      expect.objectContaining({
        body: "Updated comment",
        editedAt: expect.any(Date)
      }),
      "company-1"
    );
    expect(permissionCheck).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }), {
      resource: "comments",
      action: "write",
      tenant: {
        companyId: "company-1",
        clientId: "client-1",
        teamId: "team-1"
      }
    });
    expect(permissionCheck).toHaveBeenCalledOnce();
  });

  it("does not trust a stale moderation claim when current RBAC denies it", async () => {
    const { service, repository } = serviceWithRepository("user-2");
    vi.spyOn(RbacService, "hasPermission").mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      service.update(makeRequest(["comments:moderate"]), "comment-1", {
        body: "Updated comment"
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN"
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("denies an author whose current scoped write authority is absent", async () => {
    const { service, repository } = serviceWithRepository("user-1");
    vi.spyOn(RbacService, "hasPermission").mockResolvedValue(false);

    await expect(
      service.update(makeRequest(["comments:write"]), "comment-1", {
        body: "Updated comment"
      })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    expect(repository.update).not.toHaveBeenCalled();
  });

  it("allows current scoped moderators to remove comments from other users", async () => {
    const { service, repository } = serviceWithRepository("user-2");
    const permissionCheck = vi.spyOn(RbacService, "hasPermission").mockResolvedValue(true);

    await service.remove(makeRequest(), "comment-1");

    expect(repository.softDelete).toHaveBeenCalledWith("comment-1", undefined, "company-1");
    expect(permissionCheck).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "user-1" }), {
      resource: "comments",
      action: "delete",
      tenant: {
        companyId: "company-1",
        clientId: "client-1",
        teamId: "team-1"
      }
    });
    expect(permissionCheck).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "user-1" }), {
      resource: "comments",
      action: "moderate",
      tenant: {
        companyId: "company-1",
        clientId: "client-1",
        teamId: "team-1"
      }
    });
  });
});
