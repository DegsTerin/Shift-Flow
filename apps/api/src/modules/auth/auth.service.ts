// en-GB: Implements auth rules so invariants remain centralised outside the transport layer.
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { authenticationMode, demoAccessEmail, env } from "../../shared/config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../../shared/http/request-types.js";
import { forbidden, notFound, unauthorized } from "../../shared/errors/app-error.js";
import { signAccessToken } from "../../shared/middlewares/authenticate.js";
import { AuthRepository } from "./auth.repository.js";
import type { LoginDto } from "./auth.dto.js";

type DbUser = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: string;
  deletedAt?: Date | null;
  passwordChangedAt?: Date | null;
  companies?: Array<{
    companyId: string;
    isDefault?: boolean;
    deletedAt?: Date | null;
    company?: { status?: string; deletedAt?: Date | null };
  }>;
  roleAssignments?: Array<{
    companyId?: string;
    clientId?: string | null;
    teamId?: string | null;
    startsAt?: Date;
    endsAt?: Date | null;
    deletedAt?: Date | null;
    company?: { status?: string; deletedAt?: Date | null };
    role?: {
      companyId?: string | null;
      scope?: string;
      isActive?: boolean;
      deletedAt?: Date | null;
      permissions?: Array<{
        companyId?: string | null;
        permission?: {
          companyId?: string | null;
          resource?: string;
          action?: string;
          deletedAt?: Date | null;
        };
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
  createdAt: Date;
  user?: DbUser;
};

type DbLoginAttempt = {
  failedCount: number;
  lockedUntil?: Date | null;
};

const unavailablePrincipalHash = "$2b$12$2sfkfoyzJU1PG2MrSc47RuF7z.ieyVDzKzMHRJCQkYBZirsBtuN9q";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashIdentifier(value: string | undefined) {
  return crypto
    .createHash("sha256")
    .update(value?.trim().toLowerCase() ?? "unknown")
    .digest("hex");
}

function isActiveMembership(user: DbUser, companyId: string) {
  return Boolean(
    user.companies?.some(
      (membership) =>
        membership.companyId === companyId &&
        membership.deletedAt == null &&
        membership.company?.status === "ACTIVE" &&
        membership.company.deletedAt == null
    )
  );
}

function permissionsFrom(user: DbUser, companyId: string, now = new Date()) {
  return Array.from(
    new Set(
      user.roleAssignments
        ?.filter(
          (assignment) =>
            assignment.companyId === companyId &&
            assignment.clientId == null &&
            assignment.teamId == null &&
            assignment.deletedAt == null &&
            assignment.startsAt instanceof Date &&
            assignment.startsAt <= now &&
            (assignment.endsAt == null ||
              (assignment.endsAt instanceof Date && assignment.endsAt > now)) &&
            assignment.company?.status === "ACTIVE" &&
            assignment.company.deletedAt == null &&
            assignment.role?.scope === "COMPANY" &&
            assignment.role.isActive === true &&
            assignment.role.deletedAt == null &&
            (assignment.role.companyId == null || assignment.role.companyId === companyId)
        )
        .flatMap((assignment) => assignment.role?.permissions ?? [])
        .filter(
          (rolePermission) =>
            (rolePermission.companyId == null || rolePermission.companyId === companyId) &&
            rolePermission.permission?.deletedAt == null &&
            (rolePermission.permission?.companyId == null ||
              rolePermission.permission.companyId === companyId)
        )
        .map((rolePermission) => rolePermission.permission)
        .filter(Boolean)
        .filter(
          (permission) =>
            typeof permission?.resource === "string" && typeof permission.action === "string"
        )
        .map((permission) => `${permission?.resource}:${permission?.action}`) ?? []
    )
  );
}

function resolveCompany(user: DbUser, requestedCompanyId?: string) {
  if (requestedCompanyId) {
    if (!isActiveMembership(user, requestedCompanyId)) {
      throw forbidden("User is not linked to requested company");
    }
    return requestedCompanyId;
  }

  const activeMemberships = user.companies?.filter((membership) =>
    isActiveMembership(user, membership.companyId)
  );
  const companyId =
    activeMemberships?.find((membership) => membership.isDefault)?.companyId ??
    activeMemberships?.[0]?.companyId;
  if (!companyId) {
    throw forbidden("User has no active company membership");
  }
  return companyId;
}

function credentialVersion(user: DbUser) {
  return user.passwordChangedAt?.getTime() ?? 0;
}

function isLoopbackAddress(address: string | undefined) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export class AuthService {
  constructor(
    private readonly repository = new AuthRepository(),
    private readonly demoAccess = {
      enabled: authenticationMode === "demo",
      email: demoAccessEmail
    }
  ) {}

  private async issueSession(req: ApiRequest, user: DbUser, companyId: string) {
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      companyId,
      credentialVersion: credentialVersion(user)
    };
    authUser.permissions = permissionsFrom(user, companyId);
    const accessToken = signAccessToken(authUser);
    const refreshToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.repository.createRefreshToken(
      {
        userId: user.id,
        companyId,
        tokenHash: hashToken(refreshToken),
        userAgent: req.context?.userAgent,
        ipAddress: req.context?.ipAddress,
        expiresAt
      },
      {
        userId: user.id,
        companyId,
        passwordChangedAt: user.passwordChangedAt ?? null
      }
    );
    if (!created) {
      throw unauthorized("Unable to establish session");
    }
    await this.repository.updateLastLogin(user.id);

    return {
      accessToken,
      refreshToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        companyId,
        permissions: authUser.permissions
      }
    };
  }

  async openDemoSession(req: ApiRequest) {
    if (!this.demoAccess.enabled || !isLoopbackAddress(req.context?.ipAddress)) {
      throw notFound();
    }

    const user = (await this.repository.findUserByEmail(this.demoAccess.email)) as DbUser | null;
    if (!user || user.status !== "ACTIVE" || user.deletedAt != null) {
      throw unauthorized("Demo access is not provisioned");
    }

    const companyId = resolveCompany(user);
    const result = await this.issueSession(req, user, companyId);
    await this.repository.writeAuthAudit({
      action: "DEMO_SESSION_STARTED",
      emailHash: hashIdentifier(user.email),
      userId: user.id,
      companyId,
      requestId: req.context?.requestId,
      ipAddress: req.context?.ipAddress,
      userAgent: req.context?.userAgent
    });
    return result;
  }

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
      await bcrypt.compare(input.password, unavailablePrincipalHash);
      await this.recordFailedLogin(req, emailHash, ipHash, "UNKNOWN_OR_INACTIVE_USER");
      throw unauthorized("Invalid credentials");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      await this.recordFailedLogin(req, emailHash, ipHash, "INVALID_PASSWORD", user.id);
      throw unauthorized("Invalid credentials");
    }

    const companyId = resolveCompany(user, input.companyId);
    const result = await this.issueSession(req, user, companyId);
    await this.repository.recordSuccessfulLogin(emailHash);
    await this.repository.writeAuthAudit({
      action: "LOGIN_SUCCESS",
      emailHash,
      userId: user.id,
      companyId,
      requestId: req.context?.requestId,
      ipAddress: req.context?.ipAddress,
      userAgent: req.context?.userAgent
    });

    return result;
  }

  async refresh(req: ApiRequest, refreshToken?: string) {
    if (!refreshToken) {
      throw unauthorized("Invalid refresh token");
    }
    const stored = (await this.repository.findRefreshToken(
      hashToken(refreshToken)
    )) as DbRefreshToken | null;

    if (!stored || !stored.user) {
      throw unauthorized("Invalid refresh token");
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw unauthorized("Invalid refresh token");
    }

    if (stored.revokedAt) {
      await this.repository.revokeActiveRefreshTokensForUser(stored.userId, stored.companyId);
      throw unauthorized("Invalid refresh token");
    }

    const user = stored.user;
    if (
      user.status !== "ACTIVE" ||
      user.deletedAt != null ||
      !stored.companyId ||
      !isActiveMembership(user, stored.companyId) ||
      (user.passwordChangedAt &&
        (!(stored.createdAt instanceof Date) || stored.createdAt < user.passwordChangedAt))
    ) {
      await this.repository.revokeActiveRefreshTokensForUser(stored.userId, stored.companyId);
      throw unauthorized("Invalid refresh token");
    }

    const companyId = stored.companyId;
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      companyId,
      credentialVersion: credentialVersion(user)
    };
    authUser.permissions = permissionsFrom(user, companyId);
    const nextRefreshToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    const rotated = await this.repository.rotateRefreshToken(
      stored.id,
      {
        userId: user.id,
        companyId,
        tokenHash: hashToken(nextRefreshToken),
        userAgent: req.context?.userAgent,
        ipAddress: req.context?.ipAddress,
        expiresAt
      },
      {
        userId: user.id,
        companyId,
        passwordChangedAt: user.passwordChangedAt ?? null
      }
    );
    if (rotated !== "ROTATED") {
      if (["REUSED", "SESSION_STALE", "CONFLICT"].includes(rotated)) {
        await this.repository.revokeActiveRefreshTokensForUser(stored.userId, stored.companyId);
      }
      throw unauthorized("Invalid refresh token");
    }

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

    if (stored && stored.expiresAt.getTime() > Date.now()) {
      const revoked = !stored.revokedAt && (await this.repository.revokeRefreshToken(stored.id));
      if (!revoked) {
        await this.repository.revokeActiveRefreshTokensForUser(stored.userId, stored.companyId);
      }
    }

    return { loggedOut: true };
  }

  private async recordFailedLogin(
    req: ApiRequest,
    emailHash: string,
    ipHash: string,
    reason: string,
    userId?: string
  ) {
    const outcome = (await this.repository.recordFailedLogin({
      emailHash,
      maxAttempts: env.AUTH_LOCKOUT_MAX_ATTEMPTS,
      lockoutWindowMs: env.AUTH_LOCKOUT_WINDOW_MS,
      ipHash,
      userAgent: req.context?.userAgent
    })) as DbLoginAttempt;
    const failedCount = outcome.failedCount;
    const lockedUntil = outcome.lockedUntil ?? undefined;
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
