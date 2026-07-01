import { afterEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { ApiRequest, AuthenticatedUser } from "../http/request-types.js";
import {
  authenticate,
  resetRevokedAccessTokens,
  revokeAccessToken,
  signAccessToken
} from "./authenticate.js";

function requestWithToken(token: string): ApiRequest {
  return {
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined
  } as ApiRequest;
}

describe("authenticate middleware", () => {
  afterEach(() => {
    resetRevokedAccessTokens();
  });

  it("rejects access tokens revoked during logout", async () => {
    const user: AuthenticatedUser = {
      id: "user-1",
      email: "user@example.com",
      companyId: "company-a",
      permissions: ["dashboard:read"]
    };
    const token = signAccessToken(user);
    const nextBeforeRevocation = vi.fn();
    const reqBeforeRevocation = requestWithToken(token);

    await authenticate(reqBeforeRevocation, {} as Response, nextBeforeRevocation);

    expect(nextBeforeRevocation).toHaveBeenCalledWith();
    expect(reqBeforeRevocation.auth?.id).toBe("user-1");

    await revokeAccessToken(token);

    const nextAfterRevocation = vi.fn();
    await authenticate(requestWithToken(token), {} as Response, nextAfterRevocation);

    expect(nextAfterRevocation).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
  });
});
