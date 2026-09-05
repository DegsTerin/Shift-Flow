// en-GB: Verifies strict environment parsing and fail-closed production rate-limit configuration.
import { ZodError } from "zod";
import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./env.js";

const numericKeys = [
  "API_INSTANCE_COUNT",
  "API_PORT",
  "API_RATE_LIMIT_MAX",
  "API_RATE_LIMIT_WINDOW_MS",
  "AUTH_LOCKOUT_MAX_ATTEMPTS",
  "AUTH_LOCKOUT_WINDOW_MS",
  "AUTH_RATE_LIMIT_MAX",
  "AUTH_RATE_LIMIT_WINDOW_MS",
  "JWT_REFRESH_EXPIRES_DAYS"
] as const;

const booleanKeys = [
  "PORTFOLIO_ACCESS_ENABLED",
  "RENDER",
  "REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS"
] as const;

const numericBounds = [
  ["API_INSTANCE_COUNT", 2_147_483_647],
  ["API_PORT", 65_535],
  ["API_RATE_LIMIT_MAX", 2_147_483_647],
  ["API_RATE_LIMIT_WINDOW_MS", 2_147_483_647],
  ["AUTH_LOCKOUT_MAX_ATTEMPTS", 2_147_483_647],
  ["AUTH_LOCKOUT_WINDOW_MS", 2_147_483_647],
  ["AUTH_RATE_LIMIT_MAX", 2_147_483_647],
  ["AUTH_RATE_LIMIT_WINDOW_MS", 2_147_483_647],
  ["JWT_REFRESH_EXPIRES_DAYS", 36_500]
] as const;

/** Returns validation issues after requiring the supplied environment to fail. */
function parseIssues(input: Readonly<Record<string, unknown>>) {
  try {
    parseEnvironment(input);
  } catch (error) {
    if (error instanceof ZodError) return error.issues;
    throw error;
  }
  throw new Error("Expected environment validation to fail");
}

/** Creates a complete non-placeholder production environment for focused tests. */
function productionEnvironment(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    API_INSTANCE_COUNT: "1",
    CORS_ORIGIN: "https://app.internal",
    DATABASE_URL: `postgresql://service:${"p".repeat(40)}@db.internal:5432/app`,
    JWT_ACCESS_SECRET: "s".repeat(40),
    NODE_ENV: "production",
    RATE_LIMIT_STORE: "memory",
    ...overrides
  };
}

describe("parseEnvironment", () => {
  it.each(numericKeys)("rejects a malformed %s value instead of applying its default", (key) => {
    const issues = parseIssues({ [key]: "12ms" });
    expect(issues.some((issue) => issue.path[0] === key)).toBe(true);
  });

  it.each(["", "0", "-1", "1.5", "1e3", " 3001 ", "9007199254740992"])(
    "rejects unsafe integer syntax %j",
    (value) => {
      const issues = parseIssues({ API_PORT: value });
      expect(issues.some((issue) => issue.path[0] === "API_PORT")).toBe(true);
    }
  );

  it.each(booleanKeys)("accepts only boolean values and unambiguous strings for %s", (key) => {
    const companionVariables =
      key === "PORTFOLIO_ACCESS_ENABLED"
        ? { PORTFOLIO_ACCESS_EMAIL: "portfolio@company.example" }
        : {};

    expect(parseEnvironment({ ...companionVariables, [key]: "true" })[key]).toBe(true);
    expect(parseEnvironment({ ...companionVariables, [key]: "false" })[key]).toBe(false);
    expect(parseEnvironment({ ...companionVariables, [key]: "TRUE" })[key]).toBe(true);
    expect(parseEnvironment({ ...companionVariables, [key]: "FALSE" })[key]).toBe(false);
    expect(parseEnvironment({ ...companionVariables, [key]: true })[key]).toBe(true);
    expect(parseEnvironment({ ...companionVariables, [key]: false })[key]).toBe(false);

    for (const invalidValue of ["yes", "1", "on", ""]) {
      const issues = parseIssues({ [key]: invalidValue });
      expect(issues.some((issue) => issue.path[0] === key)).toBe(true);
    }
  });

  it.each(numericBounds)("enforces the operational maximum for %s", (key, maximum) => {
    expect(parseEnvironment({ [key]: String(maximum) })[key]).toBe(maximum);

    const issues = parseIssues({ [key]: String(maximum + 1) });
    expect(issues.some((issue) => issue.path[0] === key)).toBe(true);
  });

  it("normalises a valid non-default integer override", () => {
    expect(parseEnvironment({ API_PORT: "4321" }).API_PORT).toBe(4321);
  });

  it("applies existing defaults only when variables are absent", () => {
    const parsed = parseEnvironment({});

    expect(parsed).toMatchObject({
      API_INSTANCE_COUNT: 1,
      API_PORT: 3001,
      API_RATE_LIMIT_MAX: 600,
      API_RATE_LIMIT_WINDOW_MS: 60_000,
      AUTH_LOCKOUT_MAX_ATTEMPTS: 5,
      AUTH_LOCKOUT_WINDOW_MS: 900_000,
      AUTH_RATE_LIMIT_MAX: 10,
      AUTH_RATE_LIMIT_WINDOW_MS: 900_000,
      JWT_REFRESH_EXPIRES_DAYS: 30,
      RATE_LIMIT_STORE: "memory"
    });
  });

  it("accepts the only supported production rate-limit topology", () => {
    expect(parseEnvironment(productionEnvironment())).toMatchObject({
      API_INSTANCE_COUNT: 1,
      NODE_ENV: "production",
      RATE_LIMIT_STORE: "memory"
    });
  });

  it.each(["development", "test", "production"])(
    "rejects unavailable external storage in %s",
    (nodeEnv) => {
      const input =
        nodeEnv === "production"
          ? productionEnvironment({ RATE_LIMIT_STORE: "external" })
          : { NODE_ENV: nodeEnv, RATE_LIMIT_STORE: "external" };
      const issues = parseIssues(input);

      expect(issues.some((issue) => issue.path[0] === "RATE_LIMIT_STORE")).toBe(true);
    }
  );

  it("rejects process-local production rate limiting with multiple instances", () => {
    const issues = parseIssues(productionEnvironment({ API_INSTANCE_COUNT: "2" }));
    expect(issues.some((issue) => issue.path[0] === "API_INSTANCE_COUNT")).toBe(true);
  });

  it("requires an explicit fail-closed proxy decision on Render", () => {
    const missing = parseIssues(productionEnvironment({ RENDER: "true" }));
    expect(missing.some((issue) => issue.path[0] === "TRUST_PROXY")).toBe(true);

    expect(
      parseEnvironment(productionEnvironment({ RENDER: "true", TRUST_PROXY: "false" }))
    ).toMatchObject({ RENDER: true, TRUST_PROXY: "false" });
    expect(
      parseEnvironment(
        productionEnvironment({ RENDER: "true", TRUST_PROXY: "192.0.2.10,2001:db8::10" })
      )
    ).toMatchObject({ RENDER: true });
  });

  it.each(["true", "*", "10.0.0.0/8", "proxy.internal"])(
    "rejects an ambiguous proxy trust value %s during environment parsing",
    (value) => {
      const issues = parseIssues(productionEnvironment({ TRUST_PROXY: value }));
      expect(issues.some((issue) => issue.path[0] === "TRUST_PROXY")).toBe(true);
    }
  );

  it("reports both unavailable storage and unsafe multi-instance production", () => {
    const issues = parseIssues(
      productionEnvironment({ API_INSTANCE_COUNT: "2", RATE_LIMIT_STORE: "external" })
    );
    const paths = issues.map((issue) => issue.path[0]);

    expect(paths).toEqual(expect.arrayContaining(["RATE_LIMIT_STORE", "API_INSTANCE_COUNT"]));
  });
});
