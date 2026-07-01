import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { NextFunction, Response } from "express";
import { accessTokenSecret, env } from "../config/env.js";
import type { ApiRequest, AuthenticatedUser } from "../http/request-types.js";
import { unauthorized } from "../errors/app-error.js";

export function signAccessToken(user: AuthenticatedUser) {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
    subject: user.id,
    issuer: env.JWT_ISSUER
  };

  return jwt.sign(user, accessTokenSecret, {
    ...options
  });
}

export function authenticate(req: ApiRequest, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    req.auth = jwt.verify(token, accessTokenSecret, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER
    }) as AuthenticatedUser;
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
