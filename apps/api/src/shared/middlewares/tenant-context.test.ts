// en-GB: Ensures caller-controlled headers cannot establish trusted client, team or shift scope.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../http/request-types.js";
import { tenantContext } from "./tenant-context.js";

describe("tenantContext", () => {
  it("retains company selection but discards untrusted resource-scope headers", () => {
    const headers: Record<string, string> = {
      "x-company-id": " company-a ",
      "x-client-id": "client-a",
      "x-team-id": "team-a",
      "x-shift-id": "shift-a"
    };
    const req = {
      header: (name: string) => headers[name]
    } as unknown as ApiRequest;
    const next = vi.fn();

    tenantContext(req, {} as never, next);

    expect(req.tenant).toEqual({ companyId: "company-a" });
    expect(next).toHaveBeenCalledOnce();
  });
});
