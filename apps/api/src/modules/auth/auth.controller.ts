// en-GB: Handles auth HTTP requests so transport concerns remain separate from business behaviour.
import type { Response } from "express";
import crypto from "node:crypto";
import { asyncHandler } from "../../shared/http/async-handler.js";
import { authenticationMode, env } from "../../shared/config/env.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { forbidden } from "../../shared/errors/app-error.js";
import { revokeAccessToken } from "../../shared/middlewares/authenticate.js";
import { AuthService } from "./auth.service.js";
const refreshCookieName = "shiftflow_refresh";
const csrfCookieName = "shiftflow_csrf";

function refreshCookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    path: "/api/auth",
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {})
  };
}

function csrfCookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    path: "/",
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {})
  };
}

function cookieValue(req: ApiRequest, name: string) {
  const cookie = req.header("cookie");
  if (!cookie) return undefined;
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function cookieRefreshToken(req: ApiRequest) {
  return cookieValue(req, refreshCookieName);
}

function cookieCsrfToken(req: ApiRequest) {
  return cookieValue(req, csrfCookieName);
}

function bearerAccessToken(req: ApiRequest) {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function setRefreshCookie(res: Response, refreshToken: string, expiresAt: Date) {
  res.cookie(
    refreshCookieName,
    refreshToken,
    refreshCookieOptions(expiresAt.getTime() - Date.now())
  );
}

function setCsrfCookie(res: Response, csrfToken: string, expiresAt: Date) {
  res.cookie(csrfCookieName, csrfToken, csrfCookieOptions(expiresAt.getTime() - Date.now()));
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(refreshCookieName, {
    ...refreshCookieOptions(),
    maxAge: 0,
    expires: new Date(0)
  });
}

function clearCsrfCookie(res: Response) {
  res.clearCookie(csrfCookieName, {
    ...csrfCookieOptions(),
    maxAge: 0,
    expires: new Date(0)
  });
}

function assertCookieCsrf(req: ApiRequest) {
  if (!cookieRefreshToken(req)) {
    return;
  }

  const csrfCookie = cookieCsrfToken(req);
  const csrfHeader = req.header("x-csrf-token");

  if (!csrfCookie || !csrfHeader || !constantTimeEquals(csrfCookie, csrfHeader)) {
    throw forbidden("Invalid CSRF token");
  }
}

function withoutRefreshToken<T extends { refreshToken: string }>(
  { refreshToken, ...payload }: T,
  mode: "required" | "demo" | "portfolio" = authenticationMode
) {
  void refreshToken;
  return { ...payload, authenticationMode: mode };
}

export function createAuthController(service = new AuthService()) {
  return {
    demo: asyncHandler(async (req: ApiRequest, res: Response) => {
      const result = await service.openDemoSession(req);
      const csrfToken = generateCsrfToken();
      setRefreshCookie(res, result.refreshToken, result.expiresAt);
      setCsrfCookie(res, csrfToken, result.expiresAt);
      res.json(ok(withoutRefreshToken(result, "demo")));
    }),

    portfolio: asyncHandler(async (req: ApiRequest, res: Response) => {
      const result = await service.openPortfolioSession(req);
      const csrfToken = generateCsrfToken();
      setRefreshCookie(res, result.refreshToken, result.expiresAt);
      setCsrfCookie(res, csrfToken, result.expiresAt);
      res.json(ok(withoutRefreshToken(result, "portfolio")));
    }),

    login: asyncHandler(async (req: ApiRequest, res: Response) => {
      const result = await service.login(req, req.body);
      const csrfToken = generateCsrfToken();
      setRefreshCookie(res, result.refreshToken, result.expiresAt);
      setCsrfCookie(res, csrfToken, result.expiresAt);
      res.json(ok(withoutRefreshToken(result)));
    }),

    refresh: asyncHandler(async (req: ApiRequest, res: Response) => {
      try {
        assertCookieCsrf(req);
        const result = await service.refresh(req, cookieRefreshToken(req));
        const csrfToken = generateCsrfToken();
        setRefreshCookie(res, result.refreshToken, result.expiresAt);
        setCsrfCookie(res, csrfToken, result.expiresAt);
        res.json(ok(withoutRefreshToken(result)));
      } catch (error) {
        clearRefreshCookie(res);
        clearCsrfCookie(res);
        throw error;
      }
    }),

    logout: asyncHandler(async (req: ApiRequest, res: Response) => {
      try {
        assertCookieCsrf(req);
        let accessRevocationError: unknown;
        try {
          await revokeAccessToken(bearerAccessToken(req), req);
        } catch (error) {
          accessRevocationError = error;
        }
        const result = await service.logout(cookieRefreshToken(req));
        if (accessRevocationError) {
          throw accessRevocationError;
        }
        res.json(ok(result));
      } finally {
        clearRefreshCookie(res);
        clearCsrfCookie(res);
      }
    }),

    me: asyncHandler(async (req: ApiRequest, res: Response) => {
      res.json(ok(req.auth));
    })
  };
}

export const AuthController = createAuthController();
