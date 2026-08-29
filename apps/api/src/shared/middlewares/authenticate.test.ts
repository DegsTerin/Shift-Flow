// en-GB: Exercises access-token validation so live identity, tenant and credential state remain authoritative.
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { accessTokenSecret, env } from "../config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../http/request-types.js";
import { logger } from "../observability/logger.js";

const { revocationFindUnique, revocationUpsert, revocationDeleteMany, userFindFirst } = vi.hoisted(
  () => ({
    revocationFindUnique: vi.fn(),
    revocationUpsert: vi.fn(),
    revocationDeleteMany: vi.fn(),
    userFindFirst: vi.fn()
  })
);

vi.mock("../lib/prisma.js", () => ({
  getDelegate: vi.fn(async (name: string) => {
    if (name === "accessTokenRevocation") {
      return {
        findUnique: revocationFindUnique,
        upsert: revocationUpsert,
        deleteMany: revocationDeleteMany
      };
    }
    if (name === "user") {
      return { findFirst: userFindFirst };
    }
    throw new Error(`Unexpected Prisma delegate: ${name}`);
  })
}));

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

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1",
    email: "user@example.com",
    companyId: "company-a",
    permissions: ["dashboard:read"],
    credentialVersion: 0,
    ...overrides
  };
}

describe("authenticate middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revocationFindUnique.mockResolvedValue(null);
    revocationUpsert.mockResolvedValue(undefined);
    revocationDeleteMany.mockResolvedValue(undefined);
    userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "current@example.com",
      passwordChangedAt: null
    });
  });

  afterEach(() => {
    resetRevokedAccessTokens();
    vi.restoreAllMocks();
  });

  it("accepts a token only while the user, company and membership remain active", async () => {
    const token = signAccessToken(user());
    const next = vi.fn();
    const req = requestWithToken(token);

    await authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({
      id: "user-1",
      email: "current@example.com",
      companyId: "company-a",
      permissions: ["dashboard:read"],
      credentialVersion: 0
    });
    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        status: "ACTIVE",
        deletedAt: null,
        companies: {
          some: {
            companyId: "company-a",
            deletedAt: null,
            company: { status: "ACTIVE", deletedAt: null }
          }
        }
      },
      select: { id: true, email: true, passwordChangedAt: true }
    });
  });

  it("preserves the signed portfolio session marker after live principal validation", async () => {
    const token = signAccessToken(user({ sessionKind: "portfolio" }));
    const next = vi.fn();
    const req = requestWithToken(token);

    await authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toMatchObject({
      id: "user-1",
      companyId: "company-a",
      permissions: ["dashboard:read"],
      sessionKind: "portfolio"
    });
  });

  it("rejects access tokens revoked during logout", async () => {
    const token = signAccessToken(user());

    await revokeAccessToken(token);
    const next = vi.fn();
    await authenticate(requestWithToken(token), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(revocationUpsert).toHaveBeenCalledOnce();
  });

  it("reports persistent revocation failure while retaining local revocation", async () => {
    revocationUpsert.mockRejectedValue(new Error("database unavailable"));
    const token = signAccessToken(user());

    await expect(revokeAccessToken(token)).rejects.toThrow("database unavailable");

    const next = vi.fn();
    await authenticate(requestWithToken(token), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("does not report failure when only expired-revocation cleanup is unavailable", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    revocationDeleteMany.mockRejectedValue(new Error("cleanup unavailable"));

    await expect(revokeAccessToken(signAccessToken(user()))).resolves.toBeUndefined();

    expect(revocationUpsert).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      "access_token_revocation_cleanup_failed",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it("rejects a token when the live principal or membership is no longer active", async () => {
    userFindFirst.mockResolvedValue(null);
    const next = vi.fn();

    await authenticate(requestWithToken(signAccessToken(user())), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("invalidates an access token after an exact password credential-version change", async () => {
    const passwordChangedAt = new Date("2026-08-27T12:00:00.789Z");
    userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordChangedAt
    });
    const next = vi.fn();

    await authenticate(
      requestWithToken(
        signAccessToken(user({ credentialVersion: passwordChangedAt.getTime() - 1 }))
      ),
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("accepts a token issued with the exact credential version within the same second", async () => {
    const passwordChangedAt = new Date("2026-08-27T12:00:00.789Z");
    userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordChangedAt
    });
    const next = vi.fn();

    await authenticate(
      requestWithToken(signAccessToken(user({ credentialVersion: passwordChangedAt.getTime() }))),
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects malformed identity claims before querying live session state", async () => {
    const token = jwt.sign(
      {
        id: "user-1",
        email: "user@example.com",
        companyId: "company-a",
        permissions: [],
        credentialVersion: 0
      },
      accessTokenSecret,
      {
        algorithm: "HS256",
        expiresIn: "15m",
        issuer: env.JWT_ISSUER,
        subject: "different-user",
        jwtid: "malformed-token"
      }
    );
    const next = vi.fn();

    await authenticate(requestWithToken(token), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("fails closed when persistent revocation state cannot be verified", async () => {
    revocationFindUnique.mockRejectedValue(new Error("database unavailable"));
    const next = vi.fn();

    await authenticate(requestWithToken(signAccessToken(user())), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });
});
