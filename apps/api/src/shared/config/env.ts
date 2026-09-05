// en-GB: Defines the env implementation so this project responsibility remains explicit and maintainable.
import { z } from "zod";
import { parseTrustedProxy } from "./trusted-proxy.js";

const booleanFromString = z
  .union([
    z.boolean(),
    z
      .string()
      .regex(/^(true|false)$/i, "must be true or false")
      .transform((value) => value.toLowerCase() === "true")
  ])
  .optional();

const maximumCounter = 2_147_483_647;
const maximumTimerDelayMs = 2_147_483_647;
const maximumRefreshDays = 36_500;

/** Creates a schema whose default applies only when the variable is absent. */
const positiveInteger = (fallback: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined ? String(fallback) : value),
    z
      .string()
      .regex(/^[0-9]+$/, "must be a positive decimal integer")
      .transform(Number)
      .refine((value) => Number.isSafeInteger(value) && value > 0 && value <= maximum, {
        message: `must be between 1 and ${maximum}`
      })
  );

const placeholderValuePattern = /(replace|example|test|valid|invalid|missing|shiftflow)/i;
type EnvironmentInput = Readonly<Record<string, unknown>>;

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
    API_INSTANCE_COUNT: positiveInteger(1, maximumCounter),
    API_PORT: positiveInteger(3001, 65_535),
    API_RATE_LIMIT_MAX: positiveInteger(600, maximumCounter),
    API_RATE_LIMIT_WINDOW_MS: positiveInteger(60_000, maximumTimerDelayMs),
    AUTH_LOCKOUT_MAX_ATTEMPTS: positiveInteger(5, maximumCounter),
    AUTH_LOCKOUT_WINDOW_MS: positiveInteger(15 * 60_000, maximumTimerDelayMs),
    AUTH_MODE: z.enum(["required", "demo"]).optional(),
    AUTH_DEMO_EMAIL: z.string().email().default("demo@shiftflow.local"),
    AUTH_RATE_LIMIT_MAX: positiveInteger(10, maximumCounter),
    AUTH_RATE_LIMIT_WINDOW_MS: positiveInteger(15 * 60_000, maximumTimerDelayMs),
    CORS_ORIGIN: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_ACCESS_SECRET: z.string().optional(),
    JWT_ISSUER: z.string().default("shiftflow"),
    JWT_REFRESH_EXPIRES_DAYS: positiveInteger(30, maximumRefreshDays),
    JWT_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORTFOLIO_ACCESS_EMAIL: z.string().email().optional(),
    PORTFOLIO_ACCESS_ENABLED: booleanFromString,
    RATE_LIMIT_STORE: z.enum(["memory", "external"]).default("memory"),
    RENDER: booleanFromString,
    REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS: booleanFromString,
    TRUST_PROXY: z.string().optional()
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === "production";
    const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;

    try {
      parseTrustedProxy(env.TRUST_PROXY);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["TRUST_PROXY"],
        message: "TRUST_PROXY must be false or a comma-separated list of literal IP addresses"
      });
    }

    if (isProduction && env.RENDER && env.TRUST_PROXY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["TRUST_PROXY"],
        message: "TRUST_PROXY must be explicitly configured for a production Render service"
      });
    }

    if (env.RATE_LIMIT_STORE === "external") {
      ctx.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_STORE"],
        message:
          "RATE_LIMIT_STORE=external is not supported because no shared rate-limit backend is configured"
      });
    }

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

    if (env.PORTFOLIO_ACCESS_ENABLED && !env.PORTFOLIO_ACCESS_EMAIL) {
      ctx.addIssue({
        code: "custom",
        path: ["PORTFOLIO_ACCESS_EMAIL"],
        message: "PORTFOLIO_ACCESS_EMAIL is required when public portfolio access is enabled"
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

    if (isProduction && env.API_INSTANCE_COUNT > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["API_INSTANCE_COUNT"],
        message:
          "API_INSTANCE_COUNT must be 1 in production until a shared rate-limit backend is implemented"
      });
    }
  });

/**
 * Parses one environment snapshot without silently replacing malformed values.
 * @param input Environment variables to validate.
 * @returns The validated and normalised application configuration.
 * @throws {ZodError} When a supplied value is malformed or selects an unavailable capability.
 */
export function parseEnvironment(input: EnvironmentInput = process.env) {
  return envSchema.parse(input);
}

export const env = parseEnvironment();

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

export const portfolioAccessEnabled = env.PORTFOLIO_ACCESS_ENABLED ?? false;
export const portfolioAccessEmail = env.PORTFOLIO_ACCESS_EMAIL ?? "";

export const accessTokenSecret =
  env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "shiftflow-dev-access-secret";

export const configuredTrustProxy = parseTrustedProxy(env.TRUST_PROXY);
