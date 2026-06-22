import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { ApiRequest, AuthenticatedUser } from "../../shared/http/request-types.js";
import { badRequest, forbidden, unauthorized } from "../../shared/errors/app-error.js";
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
  expiresAt: Date;
  revokedAt?: Date | null;
  user?: DbUser;
};

const refreshTokenDays = Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 30);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function permissionsFrom(user: DbUser) {
  return Array.from(
    new Set(
      user.roleAssignments
        ?.flatMap((assignment) => assignment.role?.permissions ?? [])
        .map((rolePermission) => rolePermission.permission)
        .filter(Boolean)
        .map((permission) => `${permission?.resource}:${permission?.action}`) ?? [],
    ),
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
    const user = (await this.repository.findUserByEmail(input.email)) as DbUser | null;
    if (!user || user.status !== "ACTIVE") {
      throw unauthorized("Invalid credentials");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw unauthorized("Invalid credentials");
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      companyId: resolveCompany(user, input.companyId),
      permissions: permissionsFrom(user),
    };
    const accessToken = signAccessToken(authUser);
    const refreshToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      userAgent: req.context?.userAgent,
      ipAddress: req.context?.ipAddress,
      expiresAt,
    });
    await this.repository.updateLastLogin(user.id);

    return {
      accessToken,
      refreshToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        companyId: authUser.companyId,
        permissions: authUser.permissions,
      },
    };
  }

  async refresh(refreshToken: string) {
    const stored = (await this.repository.findRefreshToken(
      hashToken(refreshToken),
    )) as DbRefreshToken | null;

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now() || !stored.user) {
      throw unauthorized("Invalid refresh token");
    }

    const user = stored.user;
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      permissions: permissionsFrom(user),
      companyId: resolveCompany(user),
    };

    return { accessToken: signAccessToken(authUser) };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      throw badRequest("refreshToken is required");
    }

    const stored = (await this.repository.findRefreshToken(
      hashToken(refreshToken),
    )) as DbRefreshToken | null;

    if (stored && !stored.revokedAt) {
      await this.repository.revokeRefreshToken(stored.id);
    }

    return { loggedOut: true };
  }
}
