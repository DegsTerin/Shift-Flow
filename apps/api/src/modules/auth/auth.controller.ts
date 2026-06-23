import type { Response } from "express";
import { asyncHandler } from "../../shared/http/async-handler.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { ok } from "../../shared/http/response.js";
import { AuthService } from "./auth.service.js";

const service = new AuthService();
const refreshCookieName = "shiftflow_refresh";

function refreshCookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    path: "/api/auth",
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {})
  };
}

function cookieRefreshToken(req: ApiRequest) {
  const cookie = req.header("cookie");
  if (!cookie) return undefined;
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${refreshCookieName}=`))
    ?.slice(refreshCookieName.length + 1);
}

function setRefreshCookie(res: Response, refreshToken: string, expiresAt: Date) {
  res.cookie(
    refreshCookieName,
    refreshToken,
    refreshCookieOptions(expiresAt.getTime() - Date.now())
  );
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(refreshCookieName, {
    ...refreshCookieOptions(),
    maxAge: 0,
    expires: new Date(0)
  });
}

function withoutRefreshToken<T extends { refreshToken: string }>({ refreshToken, ...payload }: T) {
  void refreshToken;
  return payload;
}

export const AuthController = {
  login: asyncHandler(async (req: ApiRequest, res: Response) => {
    const result = await service.login(req, req.body);
    setRefreshCookie(res, result.refreshToken, result.expiresAt);
    res.json(ok(withoutRefreshToken(result)));
  }),

  refresh: asyncHandler(async (req: ApiRequest, res: Response) => {
    try {
      const result = await service.refresh(req, req.body.refreshToken ?? cookieRefreshToken(req));
      setRefreshCookie(res, result.refreshToken, result.expiresAt);
      res.json(ok(withoutRefreshToken(result)));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  }),

  logout: asyncHandler(async (req: ApiRequest, res: Response) => {
    try {
      const result = await service.logout(req.body.refreshToken ?? cookieRefreshToken(req));
      res.json(ok(result));
    } finally {
      clearRefreshCookie(res);
    }
  }),

  me: asyncHandler(async (req: ApiRequest, res: Response) => {
    res.json(ok(req.auth));
  })
};
