// en-GB: Verifies that credential changes and refresh-token revocation share one transaction.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, lockUser, userUpdate, refreshUpdateMany } = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockUser: vi.fn(),
  userUpdate: vi.fn(),
  refreshUpdateMany: vi.fn()
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  getPrisma: vi.fn().mockResolvedValue({ $transaction: transaction })
}));

import { UsersRepository } from "./users.repository.js";

describe("UsersRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockUser.mockResolvedValue([{ id: "user-1", passwordChangedAt: null }]);
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRawUnsafe: lockUser,
        user: { update: userUpdate },
        refreshToken: { updateMany: refreshUpdateMany }
      })
    );
  });

  it("updates the password before revoking every active refresh token in the same transaction", async () => {
    const updated = { id: "user-1", passwordChangedAt: new Date() };
    userUpdate.mockResolvedValue(updated);
    refreshUpdateMany.mockResolvedValue({ count: 2 });
    const repository = new UsersRepository();
    const data = { passwordHash: "new-password-hash" };

    await expect(repository.updatePasswordAndRevoke("user-1", data)).resolves.toBe(updated);

    expect(lockUser).toHaveBeenCalledWith(
      'SELECT "id", "passwordChangedAt" FROM "users" WHERE "id" = $1::uuid FOR UPDATE',
      "user-1"
    );
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { ...data, passwordChangedAt: expect.any(Date) }
    });
    expect(refreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(userUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      refreshUpdateMany.mock.invocationCallOrder[0] ?? 0
    );
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("advances the credential version for two concurrent password changes after serialised locks", async () => {
    let persistedVersion = new Date(Date.now() + 60_000);
    let transactionTail = Promise.resolve();
    const observedVersions: Date[] = [];
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({
          $queryRawUnsafe: vi
            .fn()
            .mockImplementation(async () => [
              { id: "user-1", passwordChangedAt: persistedVersion }
            ]),
          user: {
            update: vi.fn().mockImplementation(async (args: unknown) => {
              const nextVersion = (args as { data: { passwordChangedAt: Date } }).data
                .passwordChangedAt;
              persistedVersion = nextVersion;
              observedVersions.push(nextVersion);
              return { id: "user-1", passwordChangedAt: nextVersion };
            })
          },
          refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
        });
      } finally {
        release();
      }
    });
    const repository = new UsersRepository();

    await Promise.all([
      repository.updatePasswordAndRevoke("user-1", { passwordHash: "first-hash" }),
      repository.updatePasswordAndRevoke("user-1", { passwordHash: "second-hash" })
    ]);

    expect(observedVersions).toHaveLength(2);
    expect(observedVersions[1]?.getTime()).toBe((observedVersions[0]?.getTime() ?? 0) + 1);
  });
});
