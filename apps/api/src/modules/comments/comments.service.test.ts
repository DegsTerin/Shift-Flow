// en-GB: Exercises comments behaviour so regressions at this boundary are detected automatically.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
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
  const repository = {
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
  const service = new CommentsService();
  (service as unknown as { repository: typeof repository }).repository = repository;
  return { service, repository };
}

describe("CommentsService", () => {
  it("allows the comment author to edit and stamps editedAt", async () => {
    const { service, repository } = serviceWithRepository("user-1");

    await service.update(makeRequest(), "comment-1", { body: "Updated comment" });

    expect(repository.update).toHaveBeenCalledWith(
      "comment-1",
      expect.objectContaining({
        body: "Updated comment",
        editedAt: expect.any(Date)
      }),
      "company-1"
    );
  });

  it("blocks edits from users who are not the author or moderators", async () => {
    const { service, repository } = serviceWithRepository("user-2");

    await expect(
      service.update(makeRequest(), "comment-1", { body: "Updated comment" })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN"
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("allows moderators to remove comments from other users", async () => {
    const { service, repository } = serviceWithRepository("user-2");

    await service.remove(makeRequest(["comments:moderate"]), "comment-1");

    expect(repository.softDelete).toHaveBeenCalledWith("comment-1", undefined, "company-1");
  });
});
