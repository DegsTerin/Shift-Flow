// en-GB: Defines the env implementation so this project responsibility remains explicit and maintainable.
import { z } from "zod";
import { parseTrustedProxy } from "./trusted-proxy.js";

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    return value.toLowerCase() === "true";
  });

const positiveInteger = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? "", 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    });

const placeholderValuePattern = /(replace|example|test|valid|invalid|missing|shiftflow)/i;

function isPlaceholderValue(value: string | undefined) {
  return Boolean(value && placeholderValuePattern.test(value));
}

function getDatabasePassword(databaseUrl: string | undefined) {
  if (!databaseUrl) return undefined;
  try {
    return new URL(databaseUrl).password;
  } catch {
    return undefined;
  }
}

const envSchema = z
  .object({
    API_INSTANCE_COUNT: positiveInteger(1),
    API_PORT: positiveInteger(3001),
    API_RATE_LIMIT_MAX: positiveInteger(600),
    API_RATE_LIMIT_WINDOW_MS: positiveInteger(60_000),
    AUTH_LOCKOUT_MAX_ATTEMPTS: positiveInteger(5),
    AUTH_LOCKOUT_WINDOW_MS: positiveInteger(15 * 60_000),
    AUTH_MODE: z.enum(["required", "demo"]).optional(),
    AUTH_DEMO_EMAIL: z.string().email().default("demo@shiftflow.local"),
    AUTH_RATE_LIMIT_MAX: positiveInteger(10),
    AUTH_RATE_LIMIT_WINDOW_MS: positiveInteger(15 * 60_000),
    CORS_ORIGIN: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_ACCESS_SECRET: z.string().optional(),
    JWT_ISSUER: z.string().default("shiftflow"),
    JWT_REFRESH_EXPIRES_DAYS: positiveInteger(30),
    JWT_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    RATE_LIMIT_STORE: z.enum(["memory", "external"]).default("memory"),
    REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS: booleanFromString,
    TRUST_PROXY: z.string().optional()
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === "production";
    const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;

    if (isProduction && !env.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production"
      });
    }

    if (isProduction && isPlaceholderValue(getDatabasePassword(env.DATABASE_URL))) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL password cannot use a placeholder value in production"
      });
    }

    if (isProduction && !env.CORS_ORIGIN) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN is required in production"
      });
    }

    if (
      env.CORS_ORIGIN?.split(",")
        .map((origin) => origin.trim())
        .includes("*")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN cannot include * when credentialed requests are enabled"
      });
    }

    if (isProduction && (!accessSecret || accessSecret.length < 32)) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET or JWT_SECRET must be at least 32 characters in production"
      });
    }

    if (isProduction && env.AUTH_MODE === "demo") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "AUTH_MODE=demo is not permitted in production"
      });
    }

    if (
      isProduction &&
      (isPlaceholderValue(env.JWT_ACCESS_SECRET) || isPlaceholderValue(env.JWT_SECRET))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET or JWT_SECRET cannot use a placeholder value in production"
      });
    }

    if (isProduction && env.API_INSTANCE_COUNT > 1 && env.RATE_LIMIT_STORE !== "external") {
      ctx.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_STORE"],
        message:
          "RATE_LIMIT_STORE=external is required when production API_INSTANCE_COUNT is greater than 1"
      });
    }
  });

export const env = envSchema.parse(process.env);

export const configuredCorsOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : ["http://localhost:3000", "http://127.0.0.1:3000"];

export const requireOriginOnUnsafeRequests =
  env.REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS ?? env.NODE_ENV === "production";

export const authenticationMode =
  env.AUTH_MODE ?? (env.NODE_ENV === "development" ? "demo" : "required");

export const demoAccessEmail = env.AUTH_DEMO_EMAIL;

export const accessTokenSecret =
  env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "shiftflow-dev-access-secret";

export const configuredTrustProxy = parseTrustedProxy(env.TRUST_PROXY);
