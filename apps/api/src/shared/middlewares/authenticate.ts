// en-GB: Defines the authenticate implementation so this project responsibility remains explicit and maintainable.
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import { accessTokenSecret, env } from "../config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../http/request-types.js";
import { unauthorized } from "../errors/app-error.js";
import { getDelegate } from "../lib/prisma.js";
import { logger } from "../observability/logger.js";

const revokedAccessTokens = new Map<string, number>();

type AccessTokenRevocationDelegate = {
  findUnique(args: unknown): Promise<unknown | null>;
  upsert(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
};

type UserSessionDelegate = {
  findFirst(args: unknown): Promise<{
    id: string;
    email: string;
    passwordChangedAt?: Date | null;
  } | null>;
};

function cleanupRevokedAccessTokens(now = Date.now()) {
  for (const [jwtId, expiresAt] of revokedAccessTokens.entries()) {
    if (expiresAt <= now) {
      revokedAccessTokens.delete(jwtId);
    }
  }
}

export function signAccessToken(user: AuthenticatedUser) {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
    subject: user.id,
    issuer: env.JWT_ISSUER,
    jwtid: crypto.randomUUID()
  };

  return jwt.sign(user, accessTokenSecret, {
    ...options
  });
}

async function accessTokenRevocations() {
  return getDelegate<AccessTokenRevocationDelegate>("accessTokenRevocation");
}

async function users() {
  return getDelegate<UserSessionDelegate>("user");
}

async function persistRevokedAccessToken(data: {
  jwtId: string;
  userId?: string;
  expiresAt: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await (
    await accessTokenRevocations()
  ).upsert({
    where: { jwtId: data.jwtId },
    create: data,
    update: {
      expiresAt: data.expiresAt,
      requestId: data.requestId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent
    }
  });
  try {
    await (
      await accessTokenRevocations()
    ).deleteMany({ where: { expiresAt: { lte: new Date() } } });
  } catch (error) {
    logger.warn("access_token_revocation_cleanup_failed", { error });
  }
}

async function isPersistentlyRevoked(jwtId: string) {
  const revoked = await (await accessTokenRevocations()).findUnique({ where: { jwtId } });
  return Boolean(revoked);
}

async function findLivePrincipal(userId: string, companyId: string) {
  return (await users()).findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
      deletedAt: null,
      companies: {
        some: {
          companyId,
          deletedAt: null,
          company: { status: "ACTIVE", deletedAt: null }
        }
      }
    },
    select: {
      id: true,
      email: true,
      passwordChangedAt: true
    }
  });
}

export async function revokeAccessToken(token: string | undefined, req?: ApiRequest) {
  if (!token) return;

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, accessTokenSecret, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER
    }) as jwt.JwtPayload;
  } catch {
    // Invalid or expired access tokens do not need revocation.
    return;
  }

  const jwtId = decoded.jti;
  const expiresAt = typeof decoded.exp === "number" ? decoded.exp * 1000 : Date.now();
  if (jwtId && expiresAt > Date.now()) {
    revokedAccessTokens.set(jwtId, expiresAt);
    await persistRevokedAccessToken({
      jwtId,
      userId: typeof decoded.sub === "string" ? decoded.sub : undefined,
      expiresAt: new Date(expiresAt),
      requestId: req?.context?.requestId,
      ipAddress: req?.context?.ipAddress,
      userAgent: req?.context?.userAgent
    });
  }
}

export function resetRevokedAccessTokens() {
  revokedAccessTokens.clear();
}

export async function authenticate(req: ApiRequest, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    cleanupRevokedAccessTokens();
    const decoded = jwt.verify(token, accessTokenSecret, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER
    }) as AuthenticatedUser & jwt.JwtPayload;

    if (
      typeof decoded.id !== "string" ||
      decoded.sub !== decoded.id ||
      typeof decoded.jti !== "string" ||
      typeof decoded.companyId !== "string" ||
      (decoded.credentialVersion !== undefined &&
        (!Number.isSafeInteger(decoded.credentialVersion) || decoded.credentialVersion < 0))
    ) {
      next(unauthorized("Invalid or expired token"));
      return;
    }

    if (revokedAccessTokens.has(decoded.jti)) {
      next(unauthorized("Invalid or expired token"));
      return;
    }

    const [persistentlyRevoked, principal] = await Promise.all([
      isPersistentlyRevoked(decoded.jti),
      findLivePrincipal(decoded.id, decoded.companyId)
    ]);
    if (persistentlyRevoked || !principal) {
      next(unauthorized("Invalid or expired token"));
      return;
    }

    const currentCredentialVersion = principal.passwordChangedAt?.getTime() ?? 0;
    if ((decoded.credentialVersion ?? 0) !== currentCredentialVersion) {
      next(unauthorized("Invalid or expired token"));
      return;
    }

    req.auth = {
      id: principal.id,
      email: principal.email,
      companyId: decoded.companyId,
      permissions: Array.isArray(decoded.permissions)
        ? decoded.permissions.filter(
            (permission): permission is string => typeof permission === "string"
          )
        : [],
      credentialVersion: currentCredentialVersion
    };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
