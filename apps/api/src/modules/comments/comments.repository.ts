// en-GB: Encapsulates comments persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";

type CommentMutationQueryClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export type CommentMutationContext = {
  id: string;
  authorId: string;
  clientId: string | null;
  teamId: string | null;
};

export class CommentsRepository extends BaseRepository {
  constructor() {
    super("comment");
  }

  async findMutationContextForUpdate(
    id: string,
    companyId: string,
    transaction: PrismaTransactionClient
  ): Promise<CommentMutationContext | null> {
    const queryClient = transaction as CommentMutationQueryClient;
    const rows = await queryClient.$queryRawUnsafe<CommentMutationContext[]>(
      'SELECT c."id", c."authorId", a."clientId", a."teamId" FROM "comments" AS c INNER JOIN "activities" AS a ON a."id" = c."activityId" AND a."companyId" = c."companyId" WHERE c."id" = $1::uuid AND c."companyId" = $2::uuid AND c."deletedAt" IS NULL AND a."deletedAt" IS NULL FOR UPDATE OF c, a',
      id,
      companyId
    );
    return rows[0] ?? null;
  }
}
