import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { NextFunction, Response } from "express";
import type { ApiRequest, AuthenticatedUser } from "../http/request-types.js";
import { unauthorized } from "../errors/app-error.js";

const accessTokenSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

if (process.env.NODE_ENV === "production" && !accessTokenSecret) {
  throw new Error("JWT_ACCESS_SECRET or JWT_SECRET is required in production");
}

const signingSecret = accessTokenSecret || "shiftflow-dev-access-secret";

export function signAccessToken(user: AuthenticatedUser) {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m") as SignOptions["expiresIn"],
    subject: user.id,
    issuer: process.env.JWT_ISSUER ?? "shiftflow"
  };

  return jwt.sign(user, signingSecret, {
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
    req.auth = jwt.verify(token, signingSecret, {
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER ?? "shiftflow"
    }) as AuthenticatedUser;
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
