import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import { accessTokenSecret, env } from "../config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../http/request-types.js";
import { unauthorized } from "../errors/app-error.js";
import { getDelegate } from "../lib/prisma.js";

const revokedAccessTokens = new Map<string, number>();

type AccessTokenRevocationDelegate = {
  findUnique(args: unknown): Promise<unknown | null>;
  upsert(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
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

async function persistRevokedAccessToken(data: {
  jwtId: string;
  userId?: string;
  expiresAt: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
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
    await (
      await accessTokenRevocations()
    ).deleteMany({ where: { expiresAt: { lte: new Date() } } });
  } catch {
    // The in-memory revocation cache remains active when Prisma is unavailable.
  }
}

async function isPersistentlyRevoked(jwtId: string) {
  try {
    const revoked = await (await accessTokenRevocations()).findUnique({ where: { jwtId } });
    return Boolean(revoked);
  } catch {
    return false;
  }
}

export async function revokeAccessToken(token: string | undefined, req?: ApiRequest) {
  if (!token) return;

  try {
    const decoded = jwt.verify(token, accessTokenSecret, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER
    }) as jwt.JwtPayload;
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
  } catch {
    // Invalid or expired access tokens do not need revocation.
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

    if (decoded.jti && revokedAccessTokens.has(decoded.jti)) {
      next(unauthorized("Invalid or expired token"));
      return;
    }

    if (decoded.jti && (await isPersistentlyRevoked(decoded.jti))) {
      next(unauthorized("Invalid or expired token"));
      return;
    }

    req.auth = decoded;
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
