// en-GB: Verifies recursive secret redaction and exact audit delegate selection.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../http/request-types.js";
import type * as PrismaModule from "../lib/prisma.js";
import type { PrismaTransactionClient } from "../lib/prisma.js";
import { buildAuditData, writeAudit } from "./audit-writer.js";

const persistence = vi.hoisted(() => ({
  getDelegate: vi.fn(),
  getDelegateFrom: vi.fn()
}));

vi.mock("../lib/prisma.js", async (importOriginal) => ({
  ...(await importOriginal<typeof PrismaModule>()),
  getDelegate: persistence.getDelegate,
  getDelegateFrom: persistence.getDelegateFrom
}));

function request(): ApiRequest {
  return {
    auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
    context: {
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "unit-test"
    },
    query: {}
  } as unknown as ApiRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildAuditData", () => {
  it("redacts secret-bearing keys recursively through nested objects and arrays", () => {
    const observedAt = new Date("2026-01-01T00:00:00.000Z");
    const before = {
      password: "plain-text-password",
      profile: {
        displayName: "Visible",
        api_key: "private-api-key",
        events: [
          { refreshToken: "private-refresh-token", note: "Visible note" },
          { nested: { credential: "private-credential", count: 2 } }
        ],
        observedAt
      }
    };
    const after = {
      headers: { Authorization: "Bearer private-token", contentType: "application/json" },
      entries: [{ jwt: "private-jwt", status: "accepted" }, "visible-entry"]
    };

    const data = buildAuditData(request(), {
      entityType: "Client",
      entityId: "client-a",
      action: "UPDATE",
      companyId: "company-a",
      before,
      after
    });

    expect(data).toEqual({
      entityType: "Client",
      entityId: "client-a",
      action: "UPDATE",
      companyId: "company-a",
      before: {
        password: "[REDACTED]",
        profile: {
          displayName: "Visible",
          api_key: "[REDACTED]",
          events: [
            { refreshToken: "[REDACTED]", note: "Visible note" },
            { nested: { credential: "[REDACTED]", count: 2 } }
          ],
          observedAt
        }
      },
      after: {
        headers: { Authorization: "[REDACTED]", contentType: "application/json" },
        entries: [{ jwt: "[REDACTED]", status: "accepted" }, "visible-entry"]
      },
      actorUserId: "user-a",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "unit-test"
    });
    expect(before.profile.api_key).toBe("private-api-key");
    expect(after.entries[0]).toEqual({ jwt: "private-jwt", status: "accepted" });
  });
});

describe("writeAudit", () => {
  it("uses the global audit delegate when no transaction client is supplied", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-a" });
    persistence.getDelegate.mockResolvedValue({ create });

    await writeAudit(request(), {
      entityType: "Client",
      entityId: "client-a",
      action: "CREATE",
      companyId: "company-a",
      after: { token: "private-token", name: "Visible" }
    });

    expect(persistence.getDelegate).toHaveBeenCalledWith("auditLog");
    expect(persistence.getDelegateFrom).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "Client",
        entityId: "client-a",
        action: "CREATE",
        companyId: "company-a",
        after: { token: "[REDACTED]", name: "Visible" },
        actorUserId: "user-a",
        requestId: "request-a"
      })
    });
  });

  it("selects and propagates the supplied transaction client to the audit delegate", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-a" });
    const transaction = { auditLog: { create } } as PrismaTransactionClient;
    persistence.getDelegateFrom.mockReturnValue({ create });

    await writeAudit(
      request(),
      {
        entityType: "Shift",
        entityId: "shift-a",
        action: "UPDATE",
        companyId: "company-a",
        before: { status: "DRAFT" },
        after: { status: "ACTIVE" }
      },
      transaction
    );

    expect(persistence.getDelegateFrom).toHaveBeenCalledWith(transaction, "auditLog");
    expect(persistence.getDelegate).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "Shift",
        entityId: "shift-a",
        action: "UPDATE",
        before: { status: "DRAFT" },
        after: { status: "ACTIVE" },
        actorUserId: "user-a",
        requestId: "request-a"
      })
    });
  });
});
