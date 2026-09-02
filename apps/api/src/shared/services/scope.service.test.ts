// en-GB: Verifies tenant-scoped lookups reject cross-company and soft-deleted records.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../http/request-types.js";
import type * as PrismaModule from "../lib/prisma.js";
import {
  activeCompanyId,
  assertActivityInCompany,
  assertClientInCompany,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany
} from "./scope.service.js";

const persistence = vi.hoisted(() => ({
  getDelegate: vi.fn()
}));

vi.mock("../lib/prisma.js", async (importOriginal) => ({
  ...(await importOriginal<typeof PrismaModule>()),
  getDelegate: persistence.getDelegate
}));

type StoredScopeRecord = Record<string, unknown>;

function request(tenantCompanyId?: string, authCompanyId?: string): ApiRequest {
  return {
    ...(tenantCompanyId ? { tenant: { companyId: tenantCompanyId } } : {}),
    ...(authCompanyId
      ? { auth: { id: "user-a", email: "user@example.com", companyId: authCompanyId } }
      : {}),
    query: {}
  } as unknown as ApiRequest;
}

function matchingDelegate(records: StoredScopeRecord[]) {
  const findFirst = vi.fn(
    async ({ where }: { where: Record<string, unknown> }) =>
      records.find((record) =>
        Object.entries(where).every(([key, value]) => record[key] === value)
      ) ?? null
  );
  return { findFirst };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("activeCompanyId", () => {
  it("rejects a tenant header that differs from the authenticated company", async () => {
    await expect(
      Promise.resolve().then(() => activeCompanyId(request("company-b", "company-a")))
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
      message: "Invalid company context"
    });
  });

  it("rejects requests without either tenant or authenticated company context", async () => {
    await expect(Promise.resolve().then(() => activeCompanyId(request()))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400,
      message: "Company context is required"
    });
  });
});

describe("assertUserInCompany", () => {
  it("rejects memberships that are cross-company or soft-deleted", async () => {
    const deletedAt = new Date("2026-01-01T00:00:00.000Z");
    const delegate = matchingDelegate([
      { userId: "user-a", companyId: "company-b", deletedAt: null },
      { userId: "user-a", companyId: "company-a", deletedAt }
    ]);
    persistence.getDelegate.mockResolvedValue(delegate);

    await expect(assertUserInCompany("user-a", "company-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
      message: "User does not belong to the active company"
    });

    expect(persistence.getDelegate).toHaveBeenCalledWith("userCompany");
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-a", companyId: "company-a", deletedAt: null }
    });
  });
});

describe("entity company assertions", () => {
  it.each([
    {
      delegateName: "client",
      assertScoped: assertClientInCompany,
      message: "Client not found in active company"
    },
    {
      delegateName: "team",
      assertScoped: assertTeamInCompany,
      message: "Team not found in active company"
    },
    {
      delegateName: "shift",
      assertScoped: assertShiftInCompany,
      message: "Shift not found in active company"
    },
    {
      delegateName: "activity",
      assertScoped: assertActivityInCompany,
      message: "Activity not found in active company"
    }
  ])(
    "rejects a $delegateName record that is cross-company or soft-deleted",
    async ({ delegateName, assertScoped, message }) => {
      const deletedAt = new Date("2026-01-01T00:00:00.000Z");
      const delegate = matchingDelegate([
        { id: "entity-a", companyId: "company-b", deletedAt: null },
        { id: "entity-a", companyId: "company-a", deletedAt }
      ]);
      persistence.getDelegate.mockResolvedValue(delegate);

      await expect(assertScoped("entity-a", "company-a")).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
        message
      });

      expect(persistence.getDelegate).toHaveBeenCalledWith(delegateName);
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: "entity-a", companyId: "company-a", deletedAt: null }
      });
    }
  );
});
