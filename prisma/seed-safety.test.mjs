// en-GB: Verifies destructive seed preflight rejects unsafe targets before any Prisma client can be created.
import { describe, expect, it } from "vitest";
import { assertSafeDestructiveSeed, destructiveSeedConfirmation } from "./seed-safety.mjs";

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
