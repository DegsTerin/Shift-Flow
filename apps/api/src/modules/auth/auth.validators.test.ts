// en-GB: Preserves legacy password verification while new writers enforce bcrypt's byte limit.
import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth.validators.js";

describe("login validator", () => {
  it("continues to admit a legacy password above 72 UTF-8 bytes for verification", () => {
    const legacyPassword = "é".repeat(37);

    expect(new TextEncoder().encode(legacyPassword)).toHaveLength(74);
    expect(
      loginSchema.safeParse({ email: "legacy@example.com", password: legacyPassword }).success
    ).toBe(true);
  });

  it("retains the existing 160-character transport ceiling", () => {
    expect(
      loginSchema.safeParse({ email: "legacy@example.com", password: "x".repeat(160) }).success
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: "legacy@example.com", password: "x".repeat(161) }).success
    ).toBe(false);
  });
});
