// en-GB: Implements auth rules so invariants remain centralised outside the transport layer.
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  authenticationMode,
  demoAccessEmail,
  env,
  portfolioAccessEmail,
  portfolioAccessEnabled
} from "../../shared/config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../../shared/http/request-types.js";
import { AppError, forbidden, notFound, unauthorized } from "../../shared/errors/app-error.js";
import { signAccessToken } from "../../shared/middlewares/authenticate.js";
import { logger } from "../../shared/observability/logger.js";
import {
  AuthRepository,
  PortfolioSessionCapacityError,
  type AuthenticationSessionKind
} from "./auth.repository.js";
import type { LoginDto } from "./auth.dto.js";
import {
  AuthenticationRequestCancelledError,
  authenticationBackoffMaximumMs,
  loginFailureAuditGate,
  loginFailureDelayGate,
  loginSuccessTelemetryGate,
  loginVerificationGate,
  type LoginFailureDelayGate,
  type LoginFailureAuditGate,
  type LoginSuccessTelemetryGate,
  type LoginVerificationGate,
  throwIfAuthenticationRequestCancelled
} from "./login-verification-gate.js";

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
    company?: { name?: string; timezone?: string; status?: string; deletedAt?: Date | null };
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

type DbLoginCredential = Pick<DbUser, "id" | "email" | "passwordHash" | "passwordChangedAt">;

type DbRefreshToken = {
  id: string;
  userId: string;
  companyId?: string | null;
  sessionKind?: AuthenticationSessionKind | null;
  familyId?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  user?: DbUser;
};

const unavailablePrincipalHash = "$2b$12$2sfkfoyzJU1PG2MrSc47RuF7z.ieyVDzKzMHRJCQkYBZirsBtuN9q";
const portfolioRefreshTokenPrefix = "portfolio.";
const portfolioSessionLifetimeMs = 60 * 60 * 1_000;
const minimumAuthenticationFailureDelayMs = 1_000;
const portfolioPermissionAllowlist = new Set([
  "dashboard:read",
  "clients:read",
  "teams:read",
  "shifts:read",
  "activities:read",
  "comments:read",
  "notifications:read",
  "reports:read"
]);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRefreshToken(portfolioSession = false) {
  const token = crypto.randomBytes(48).toString("base64url");
  return portfolioSession ? `${portfolioRefreshTokenPrefix}${token}` : token;
}

function hashIdentifier(value: string | undefined) {
  return crypto
    .createHash("sha256")
    .update(value ?? "unknown")
    .digest("hex");
}

function delayWithAuthenticationAbort(milliseconds: number, signal?: AbortSignal) {
  throwIfAuthenticationRequestCancelled(signal);

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (settlement: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settlement();
    };
    const onAbort = () => settle(() => reject(new AuthenticationRequestCancelledError()));
    const timer = setTimeout(() => settle(resolve), milliseconds);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
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

function resolveLoginCompany(user: DbUser, requestedCompanyId?: string) {
  if (requestedCompanyId) {
    return isActiveMembership(user, requestedCompanyId)
      ? { companyId: requestedCompanyId }
      : { reason: "INVALID_COMPANY_SELECTION" };
  }

  const activeMemberships = user.companies?.filter((membership) =>
    isActiveMembership(user, membership.companyId)
  );
  const companyId =
    activeMemberships?.find((membership) => membership.isDefault)?.companyId ??
    activeMemberships?.[0]?.companyId;
  return companyId ? { companyId } : { reason: "NO_ACTIVE_COMPANY_MEMBERSHIP" };
}

function credentialVersion(user: DbUser) {
  return user.passwordChangedAt?.getTime() ?? 0;
}

function sessionUser(
  user: DbUser,
  companyId: string,
  permissions: string[],
  sessionKind: AuthenticationSessionKind
) {
  const companies = (user.companies ?? [])
    .filter(
      (membership) =>
        membership.deletedAt == null &&
        membership.company?.status === "ACTIVE" &&
        membership.company.deletedAt == null &&
        typeof membership.company.name === "string" &&
        typeof membership.company.timezone === "string" &&
        (sessionKind === "PASSWORD" || membership.companyId === companyId)
    )
    .map((membership) => ({
      id: membership.companyId,
      name: membership.company!.name as string,
      timezone: membership.company!.timezone as string
    }))
    .filter((company, index, all) => all.findIndex((entry) => entry.id === company.id) === index);
  const company = companies.find((entry) => entry.id === companyId);
  if (!company) throw unauthorized("Active company metadata is unavailable");
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    companyId,
    company,
    companies,
    permissions
  };
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
    },
    private readonly portfolioAccess = {
      enabled: portfolioAccessEnabled,
      email: portfolioAccessEmail
    },
    private readonly verificationGate: Pick<LoginVerificationGate, "run"> = loginVerificationGate,
    private readonly delay: (
      milliseconds: number,
      signal?: AbortSignal
    ) => Promise<void> = delayWithAuthenticationAbort,
    private readonly failureAuditGate: Pick<
      LoginFailureAuditGate,
      "takeAggregate"
    > = loginFailureAuditGate,
    private readonly failureDelayGate: Pick<
      LoginFailureDelayGate,
      "recordFailure"
    > = loginFailureDelayGate,
    private readonly successTelemetryGate: Pick<
      LoginSuccessTelemetryGate,
      "takeAggregate"
    > = loginSuccessTelemetryGate
  ) {}

  private portfolioPermissions(user: DbUser, companyId: string) {
    return permissionsFrom(user, companyId).filter((permission) =>
      portfolioPermissionAllowlist.has(permission)
    );
  }

  private async issueSession(
    req: ApiRequest,
    user: DbUser,
    companyId: string,
    permissions = permissionsFrom(user, companyId),
    portfolioSession = false,
    sessionObservation?: {
      sessionKind: AuthenticationSessionKind;
      emailHash: string;
      ipHash?: string;
    }
  ) {
    if (!sessionObservation) {
      throw new Error("Session observation is required before issuing credentials");
    }
    const projectedUser = sessionUser(user, companyId, permissions, sessionObservation.sessionKind);
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      companyId,
      credentialVersion: credentialVersion(user),
      ...(portfolioSession ? { sessionKind: "portfolio" as const } : {})
    };
    authUser.permissions = permissions;
    const accessToken = signAccessToken(authUser);
    const refreshToken = createRefreshToken(portfolioSession);
    const expiresAt = new Date(
      Date.now() +
        (portfolioSession
          ? portfolioSessionLifetimeMs
          : env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)
    );

    let created: boolean;
    try {
      created = await this.repository.createRefreshToken(
        {
          tokenHash: hashToken(refreshToken),
          familyId: crypto.randomUUID(),
          userAgent: req.context?.userAgent,
          ipAddress: req.context?.ipAddress,
          expiresAt
        },
        {
          userId: user.id,
          companyId,
          sessionKind: sessionObservation.sessionKind,
          passwordChangedAt: user.passwordChangedAt ?? null
        },
        {
          ...sessionObservation,
          userId: user.id,
          companyId,
          requestId: req.context?.requestId,
          ipAddress: req.context?.ipAddress,
          userAgent: req.context?.userAgent
        }
      );
    } catch (error) {
      if (error instanceof PortfolioSessionCapacityError) {
        throw new AppError(
          error.message,
          429,
          "AUTHENTICATION_BUSY",
          undefined,
          error.retryAfterSeconds
        );
      }
      throw error;
    }
    if (!created) {
      throw unauthorized("Invalid credentials");
    }
    try {
      await this.repository.updateLastLogin(user.id);
    } catch (error) {
      logger.error("authentication_last_login_update_failed", {
        requestId: req.context?.requestId,
        userId: user.id,
        error
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresAt,
      user: projectedUser
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
    const session = await this.issueSession(req, user, companyId, undefined, false, {
      sessionKind: "DEMO",
      emailHash: hashIdentifier(user.email)
    });
    this.recordSuccessfulLoginTelemetry();
    return session;
  }

  async openPortfolioSession(req: ApiRequest) {
    if (!this.portfolioAccess.enabled) {
      throw notFound();
    }

    const user = (await this.repository.findUserByEmail(
      this.portfolioAccess.email
    )) as DbUser | null;
    if (!user || user.status !== "ACTIVE" || user.deletedAt != null) {
      throw unauthorized("Portfolio access is not provisioned");
    }

    const companyId = resolveCompany(user);
    const permissions = this.portfolioPermissions(user, companyId);
    if (!permissions.includes("dashboard:read")) {
      throw unauthorized("Portfolio access is not safely provisioned");
    }

    const session = await this.issueSession(req, user, companyId, permissions, true, {
      sessionKind: "PORTFOLIO",
      emailHash: hashIdentifier(user.email)
    });
    this.recordSuccessfulLoginTelemetry();
    return session;
  }

  async login(req: ApiRequest, input: LoginDto, signal?: AbortSignal) {
    const emailHash = hashIdentifier(input.email);
    const ipHash = hashIdentifier(req.context?.ipAddress);
    const verified = await this.verificationGate.run(
      emailHash,
      async (withPasswordBudget) => {
        const startedAt = Date.now();
        let failureBackoffUntil: Date | undefined;
        let failureRecorded = false;
        let sessionIssued = false;
        const recordFailure = () => {
          failureRecorded = true;
          return this.recordLoginFailure(emailHash);
        };
        try {
          throwIfAuthenticationRequestCancelled(signal);
          const credential = (await this.repository.findLoginCredentialByEmail(
            input.email
          )) as DbLoginCredential | null;
          throwIfAuthenticationRequestCancelled(signal);
          const validPassword = await withPasswordBudget(() =>
            bcrypt.compare(input.password, credential?.passwordHash ?? unavailablePrincipalHash)
          );
          if (!credential || !validPassword) {
            failureBackoffUntil = recordFailure();
            throwIfAuthenticationRequestCancelled(signal);
            throw unauthorized("Invalid credentials");
          }
          throwIfAuthenticationRequestCancelled(signal);

          const hydratedCandidate = (await this.repository.findUserByEmail(
            input.email
          )) as DbUser | null;
          throwIfAuthenticationRequestCancelled(signal);
          if (!hydratedCandidate || hydratedCandidate.id !== credential.id) {
            failureBackoffUntil = recordFailure();
            throw unauthorized("Invalid credentials");
          }
          const activeCandidate = {
            ...hydratedCandidate,
            passwordChangedAt: credential.passwordChangedAt
          };

          const company = resolveLoginCompany(activeCandidate, input.companyId);
          if (!company.companyId) {
            failureBackoffUntil = recordFailure();
            throw unauthorized("Invalid credentials");
          }

          throwIfAuthenticationRequestCancelled(signal);
          let result: Awaited<ReturnType<AuthService["issueSession"]>>;
          try {
            result = await this.issueSession(
              req,
              activeCandidate,
              company.companyId,
              undefined,
              false,
              {
                sessionKind: "PASSWORD",
                emailHash,
                ipHash
              }
            );
          } catch (error) {
            throwIfAuthenticationRequestCancelled(signal);
            logger.error("authentication_session_issue_failed", {
              requestId: req.context?.requestId,
              userId: activeCandidate.id,
              companyId: company.companyId,
              error
            });
            throw unauthorized("Invalid credentials");
          }
          sessionIssued = true;
          this.recordSuccessfulLoginTelemetry();
          throwIfAuthenticationRequestCancelled(signal);
          return { result };
        } finally {
          if (!sessionIssued && !signal?.aborted) {
            if (!failureRecorded) {
              failureBackoffUntil = recordFailure();
            }
            await this.waitForFailureBackoff(failureBackoffUntil, startedAt, signal);
          }
        }
      },
      signal
    );

    return verified.result;
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
    const hasPortfolioPrefix = refreshToken.startsWith(portfolioRefreshTokenPrefix);
    if (
      !stored.sessionKind ||
      !stored.familyId ||
      (stored.sessionKind === "PORTFOLIO") !== hasPortfolioPrefix
    ) {
      if (!stored.revokedAt) {
        await this.repository.revokeRefreshToken(stored.id);
      }
      throw unauthorized("Invalid refresh token");
    }
    const sessionKind = stored.sessionKind;

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw unauthorized("Invalid refresh token");
    }

    if (stored.revokedAt) {
      if (stored.companyId) {
        await this.repository.revokeActiveRefreshTokenFamily(
          stored.userId,
          stored.companyId,
          sessionKind,
          stored.familyId
        );
      }
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
      if (stored.companyId) {
        await this.repository.revokeActiveRefreshTokenFamily(
          stored.userId,
          stored.companyId,
          sessionKind,
          stored.familyId
        );
      } else if (!stored.revokedAt) {
        await this.repository.revokeRefreshToken(stored.id);
      }
      throw unauthorized("Invalid refresh token");
    }

    const companyId = stored.companyId;
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      companyId,
      credentialVersion: credentialVersion(user),
      ...(sessionKind === "PORTFOLIO" ? { sessionKind: "portfolio" as const } : {})
    };
    const portfolioSession = authUser.sessionKind === "portfolio";
    authUser.permissions = portfolioSession
      ? this.portfolioPermissions(user, companyId)
      : permissionsFrom(user, companyId);
    const projectedUser = sessionUser(user, companyId, authUser.permissions, sessionKind);
    if (portfolioSession) {
      return {
        accessToken: signAccessToken(authUser),
        refreshToken,
        expiresAt: stored.expiresAt,
        user: projectedUser
      };
    }
    const nextRefreshToken = createRefreshToken(portfolioSession);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    const rotated = await this.repository.rotateRefreshToken(
      stored.id,
      {
        tokenHash: hashToken(nextRefreshToken),
        familyId: stored.familyId,
        userAgent: req.context?.userAgent,
        ipAddress: req.context?.ipAddress,
        expiresAt
      },
      {
        userId: user.id,
        companyId,
        sessionKind,
        passwordChangedAt: user.passwordChangedAt ?? null
      }
    );
    if (rotated === "TOO_SOON") {
      return {
        accessToken: signAccessToken(authUser),
        refreshToken,
        expiresAt: stored.expiresAt,
        user: projectedUser
      };
    }
    if (rotated !== "ROTATED") {
      if (["REUSED", "SESSION_STALE", "CONFLICT"].includes(rotated)) {
        await this.repository.revokeActiveRefreshTokenFamily(
          stored.userId,
          stored.companyId,
          sessionKind,
          stored.familyId
        );
      }
      throw unauthorized("Invalid refresh token");
    }

    return {
      accessToken: signAccessToken(authUser),
      refreshToken: nextRefreshToken,
      expiresAt,
      user: projectedUser
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
      const hasPortfolioPrefix = refreshToken.startsWith(portfolioRefreshTokenPrefix);
      if (stored.sessionKind === "PORTFOLIO" && hasPortfolioPrefix) {
        await this.repository.deletePortfolioRefreshToken(stored.id);
        return { loggedOut: true };
      }
      const revoked = !stored.revokedAt && (await this.repository.revokeRefreshToken(stored.id));
      if (
        !revoked &&
        stored.companyId &&
        stored.sessionKind &&
        stored.familyId &&
        (stored.sessionKind === "PORTFOLIO") === hasPortfolioPrefix
      ) {
        await this.repository.revokeActiveRefreshTokenFamily(
          stored.userId,
          stored.companyId,
          stored.sessionKind,
          stored.familyId
        );
      }
    }

    return { loggedOut: true };
  }

  private recordLoginFailure(emailHash: string) {
    const lockedUntil = this.failureDelayGate.recordFailure(
      emailHash,
      env.AUTH_LOCKOUT_MAX_ATTEMPTS,
      env.AUTH_LOCKOUT_WINDOW_MS
    );
    this.recordFailureTelemetry({
      backoffMs: Math.max(0, (lockedUntil?.getTime() ?? 0) - Date.now())
    });
    return lockedUntil;
  }

  private recordFailureTelemetry(fields: Record<string, unknown>) {
    const attemptCount = this.failureAuditGate.takeAggregate();
    if (attemptCount !== undefined) {
      logger.warn("authentication_failures", { attemptCount, ...fields });
    }
  }

  private recordSuccessfulLoginTelemetry() {
    const successCount = this.successTelemetryGate.takeAggregate();
    if (successCount !== undefined) {
      logger.info("authentication_successes", { successCount });
    }
  }

  private async waitForFailureBackoff(
    lockedUntil: Date | undefined,
    startedAt: number,
    signal?: AbortSignal
  ) {
    const minimumCompletionAt = startedAt + minimumAuthenticationFailureDelayMs;
    const delayMs = Math.min(
      Math.max(0, Math.max(minimumCompletionAt, lockedUntil?.getTime() ?? 0) - Date.now()),
      authenticationBackoffMaximumMs
    );
    if (delayMs > 0) {
      throwIfAuthenticationRequestCancelled(signal);
      await this.delay(delayMs, signal);
    }
  }
}
