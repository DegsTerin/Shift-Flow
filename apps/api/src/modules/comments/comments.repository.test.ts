// en-GB: Verifies that comment mutation context is tenant-scoped and locked transactionally.
import { describe, expect, it, vi } from "vitest";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { CommentsRepository } from "./comments.repository.js";

describe("CommentsRepository mutation context", () => {
  it("locks an active comment and its active activity inside the supplied tenant", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: "comment-a",
        authorId: "author-a",
        clientId: "client-a",
        teamId: "team-a"
      }
    ]);
    const transaction = { $queryRawUnsafe: query } as unknown as PrismaTransactionClient;

    await expect(
      new CommentsRepository().findMutationContextForUpdate("comment-a", "company-a", transaction)
    ).resolves.toEqual({
      id: "comment-a",
      authorId: "author-a",
      clientId: "client-a",
      teamId: "team-a"
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE OF c, a"),
      "comment-a",
      "company-a"
    );
    const statement = String(query.mock.calls[0]?.[0]);
    expect(statement).toContain('c."companyId" = $2::uuid');
    expect(statement).toContain('a."companyId" = c."companyId"');
    expect(statement).toContain('c."deletedAt" IS NULL');
    expect(statement).toContain('a."deletedAt" IS NULL');
  });

  it("returns null when no active scoped context can be locked", async () => {
    const transaction = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([])
    } as unknown as PrismaTransactionClient;

    await expect(
      new CommentsRepository().findMutationContextForUpdate("comment-a", "company-a", transaction)
    ).resolves.toBeNull();
  });
});
