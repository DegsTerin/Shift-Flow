// en-GB: Encapsulates users persistence so data access remains consistent and testable.
import { getPrisma } from "../../shared/lib/prisma.js";
import { notFound } from "../../shared/errors/app-error.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

type TransactionClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  user: {
    update(args: unknown): Promise<unknown>;
  };
  refreshToken: {
    updateMany(args: unknown): Promise<unknown>;
  };
};

export class UsersRepository extends BaseRepository {
  constructor() {
    super("user");
  }

  async updatePasswordAndRevoke(id: string, data: Record<string, unknown>) {
    const prisma = (await getPrisma()) as {
      $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
    };
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<
        Array<{ id: string; passwordChangedAt: Date | null }>
      >('SELECT "id", "passwordChangedAt" FROM "users" WHERE "id" = $1::uuid FOR UPDATE', id);
      const current = locked[0];
      if (!current) {
        throw notFound("User not found");
      }
      if (current.passwordChangedAt !== null && !(current.passwordChangedAt instanceof Date)) {
        throw new Error("Locked password credential version is invalid");
      }

      const previousVersion = current.passwordChangedAt?.getTime() ?? 0;
      const passwordChangedAt = new Date(Math.max(Date.now(), previousVersion + 1));
      const updated = await tx.user.update({
        where: { id },
        data: { ...data, passwordChangedAt }
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      return updated;
    });
  }
}
