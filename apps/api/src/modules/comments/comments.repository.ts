// en-GB: Encapsulates comments persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type CommentDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

export class CommentsRepository extends BaseRepository {
  constructor() {
    super("comment");
  }

  async findMutationContext(id: string, companyId: string) {
    return (await getDelegate<CommentDelegate>("comment")).findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
        activity: { deletedAt: null }
      },
      select: {
        id: true,
        authorId: true,
        activity: {
          select: {
            clientId: true,
            teamId: true
          }
        }
      }
    });
  }
}
