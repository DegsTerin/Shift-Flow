// en-GB: Implements auth rules so invariants remain centralised outside the transport layer.
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { env } from "../../shared/config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../../shared/http/request-types.js";
import { forbidden, unauthorized } from "../../shared/errors/app-error.js";
import { signAccessToken } from "../../shared/middlewares/authenticate.js";
import { AuthRepository } from "./auth.repository.js";
import type { LoginDto } from "./auth.dto.js";

type DbUser = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: string;
  companies?: Array<{ companyId: string; isDefault?: boolean }>;
  roleAssignments?: Array<{
    role?: {
      permissions?: Array<{
        permission?: { resource?: string; action?: string };
      }>;
    };
  }>;
};

type DbRefreshToken = {
  id: string;
  userId: string;
  companyId?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  user?: DbUser;
};

type DbLoginAttempt = {
  failedCount: number;
  lockedUntil?: Date | null;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashIdentifier(value: string | undefined) {
  return crypto
    .createHash("sha256")
    .update(value?.trim().toLowerCase() ?? "unknown")
    .digest("hex");
}

function permissionsFrom(user: DbUser) {
  return Array.from(
    new Set(
      user.roleAssignments
        ?.flatMap((assignment) => assignment.role?.permissions ?? [])
        .map((rolePermission) => rolePermission.permission)
        .filter(Boolean)
        .map((permission) => `${permission?.resource}:${permission?.action}`) ?? []
    )
  );
}

function resolveCompany(user: DbUser, requestedCompanyId?: string) {
  if (requestedCompanyId) {
    const allowed = user.companies?.some((company) => company.companyId === requestedCompanyId);
    if (!allowed) {
      throw forbidden("User is not linked to requested company");
    }
    return requestedCompanyId;
  }

  return (
    user.companies?.find((company) => company.isDefault)?.companyId ??
    user.companies?.[0]?.companyId
  );
}

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async login(req: ApiRequest, input: LoginDto) {
    const emailHash = hashIdentifier(input.email);
    const ipHash = hashIdentifier(req.context?.ipAddress);
    const attempt = (await this.repository.findLoginAttempt(emailHash)) as DbLoginAttempt | null;
    if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > Date.now()) {
      await this.repository.writeAuthAudit({
        action: "LOGIN_LOCKED",
        emailHash,
        requestId: req.context?.requestId,
        ipAddress: req.context?.ipAddress,
        userAgent: req.context?.userAgent,
        detail: { lockedUntil: attempt.lockedUntil.toISOString() }
      });
      throw unauthorized("Invalid credentials");
    }

    const user = (await this.repository.findUserByEmail(input.email)) as DbUser | null;
    if (!user || user.status !== "ACTIVE") {
      await this.recordFailedLogin(req, emailHash, ipHash, attempt, "UNKNOWN_OR_INACTIVE_USER");
      throw unauthorized("Invalid credentials");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      await this.recordFailedLogin(req, emailHash, ipHash, attempt, "INVALID_PASSWORD", user.id);
      throw unauthorized("Invalid credentials");
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      companyId: resolveCompany(user, input.companyId),
      permissions: permissionsFrom(user)
    };
    const accessToken = signAccessToken(authUser);
    const refreshToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await this.repository.createRefreshToken({
      userId: user.id,
      companyId: authUser.companyId,
      tokenHash: hashToken(refreshToken),
      userAgent: req.context?.userAgent,
      ipAddress: req.context?.ipAddress,
      expiresAt
    });
    await this.repository.updateLastLogin(user.id);
    await this.repository.recordSuccessfulLogin(emailHash);
    await this.repository.writeAuthAudit({
      action: "LOGIN_SUCCESS",
      emailHash,
      userId: user.id,
      companyId: authUser.companyId,
      requestId: req.context?.requestId,
      ipAddress: req.context?.ipAddress,
      userAgent: req.context?.userAgent
    });

    return {
      accessToken,
      refreshToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        companyId: authUser.companyId,
        permissions: authUser.permissions
      }
    };
  }

  async refresh(req: ApiRequest, refreshToken?: string) {
    if (!refreshToken) {
      throw unauthorized("Invalid refresh token");
    }
    const stored = (await this.repository.findRefreshToken(
      hashToken(refreshToken)
    )) as DbRefreshToken | null;

    if (!stored || stored.expiresAt.getTime() <= Date.now() || !stored.user) {
      throw unauthorized("Invalid refresh token");
    }

    if (stored.revokedAt) {
      await this.repository.revokeActiveRefreshTokensForUser(stored.userId, stored.companyId);
      throw unauthorized("Invalid refresh token");
    }

    const user = stored.user;
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      permissions: permissionsFrom(user),
      companyId: resolveCompany(user, stored.companyId ?? undefined)
    };
    const nextRefreshToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await this.repository.rotateRefreshToken(stored.id, {
      userId: user.id,
      companyId: authUser.companyId,
      tokenHash: hashToken(nextRefreshToken),
      userAgent: req.context?.userAgent,
      ipAddress: req.context?.ipAddress,
      expiresAt
    });

    return {
      accessToken: signAccessToken(authUser),
      refreshToken: nextRefreshToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        companyId: authUser.companyId,
        permissions: authUser.permissions
      }
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { loggedOut: true };
    }

    const stored = (await this.repository.findRefreshToken(
      hashToken(refreshToken)
    )) as DbRefreshToken | null;

    if (stored && !stored.revokedAt) {
      await this.repository.revokeRefreshToken(stored.id);
    }

    return { loggedOut: true };
  }

  private async recordFailedLogin(
    req: ApiRequest,
    emailHash: string,
    ipHash: string,
    attempt: DbLoginAttempt | null,
    reason: string,
    userId?: string
  ) {
    const failedCount = (attempt?.failedCount ?? 0) + 1;
    const lockedUntil =
      failedCount >= env.AUTH_LOCKOUT_MAX_ATTEMPTS
        ? new Date(Date.now() + env.AUTH_LOCKOUT_WINDOW_MS)
        : undefined;

    await this.repository.recordFailedLogin({
      emailHash,
      failedCount,
      lockedUntil,
      ipHash,
      userAgent: req.context?.userAgent
    });
    await this.repository.writeAuthAudit({
      action: lockedUntil ? "LOGIN_LOCKED" : "LOGIN_FAILED",
      emailHash,
      userId,
      requestId: req.context?.requestId,
      ipAddress: req.context?.ipAddress,
      userAgent: req.context?.userAgent,
      detail: { reason, failedCount, lockedUntil: lockedUntil?.toISOString() }
    });
  }
}
