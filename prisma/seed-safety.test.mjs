// en-GB: Verifies destructive seed and PostgreSQL integration preflights reject unsafe database targets.
import { describe, expect, it } from "vitest";
import {
  assertSafeDestructiveSeed,
  assertSafePostgresIntegrationTarget,
  destructiveSeedConfirmation
} from "./seed-safety.mjs";

const safeInput = {
  databaseUrl: "postgresql://shiftflow:local-password@127.0.0.1:5432/shiftflow_realistic",
  nodeEnv: "development",
  confirmation: destructiveSeedConfirmation,
  password: "local-password-123"
};

describe("realistic seed safety", () => {
  it("accepts an explicitly confirmed loopback ShiftFlow database", () => {
    expect(assertSafeDestructiveSeed(safeInput)).toEqual({
      host: "127.0.0.1",
      databaseName: "shiftflow_realistic"
    });
  });

  it.each([
    [{ ...safeInput, nodeEnv: "production" }, "forbidden in production"],
    [{ ...safeInput, nodeEnv: " Production " }, "forbidden in production"],
    [
      { ...safeInput, databaseUrl: "postgresql://shiftflow:x@db.example.com/shiftflow_test" },
      "loopback"
    ],
    [
      { ...safeInput, databaseUrl: "postgresql://shiftflow:x@localhost/customer_data" },
      "database named"
    ],
    [
      {
        ...safeInput,
        databaseUrl:
          "postgresql://shiftflow:x@127.0.0.1/shiftflow_test?host=db.example.com&schema=public"
      },
      "routing parameters"
    ],
    [{ ...safeInput, confirmation: undefined }, "SHIFTFLOW_DESTRUCTIVE_SEED_CONFIRMATION"],
    [{ ...safeInput, password: undefined }, "at least 12 characters"]
  ])("rejects an unsafe target before database initialisation", (input, message) => {
    expect(() => assertSafeDestructiveSeed(input)).toThrow(message);
  });
});

describe("PostgreSQL integration target safety", () => {
  it.each([
    [
      "postgresql://shiftflow:ephemeral-password@127.0.0.1:55432/shiftflow_runtime_a1b2c3d4e5f60718293a4b5c?schema=public",
      undefined,
      undefined,
      {
        host: "127.0.0.1",
        port: "55432",
        databaseName: "shiftflow_runtime_a1b2c3d4e5f60718293a4b5c"
      }
    ],
    [
      "postgresql://shiftflow:ci-postgres-password@localhost:5432/shiftflow_ci?schema=public",
      undefined,
      "true",
      { host: "localhost", port: "5432", databaseName: "shiftflow_ci" }
    ]
  ])("accepts an approved disposable target", (databaseUrl, nodeEnv, ci, expected) => {
    expect(assertSafePostgresIntegrationTarget(databaseUrl, nodeEnv, ci)).toEqual(expected);
  });

  it.each([
    "postgresql://shiftflow:ephemeral-password@db.example.com:55432/shiftflow_audit",
    "postgresql://shiftflow:ephemeral-password@127.0.0.1:5433/shiftflow_audit",
    "postgresql://shiftflow:ephemeral-password@127.0.0.1:55432/shiftflow_realistic",
    "postgresql://shiftflow:short@127.0.0.1:55432/shiftflow_runtime_a1b2c3d4e5f60718293a4b5c",
    "postgresql://shiftflow:ephemeral-password@127.0.0.1:55432/shiftflow_runtime_a1b2c3d4e5f60718293a4b5c?host=remote",
    "postgresql://shiftflow:ci-postgres-password@localhost:5432/shiftflow_ci"
  ])("rejects a non-disposable or redirectable target", (databaseUrl) => {
    expect(() => assertSafePostgresIntegrationTarget(databaseUrl)).toThrow();
  });

  it("rejects an otherwise local target in production mode", () => {
    expect(() =>
      assertSafePostgresIntegrationTarget(
        "postgresql://shiftflow:ephemeral-password@127.0.0.1:55432/shiftflow_runtime_a1b2c3d4e5f60718293a4b5c",
        " Production "
      )
    ).toThrow("forbidden in production");
  });
});
