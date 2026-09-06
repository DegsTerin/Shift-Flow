// en-GB: Exercises application behaviour so regressions at this boundary are detected automatically.
import { describe, expect, it } from "vitest";
import {
  maximumBcryptPasswordBytes,
  passwordUtf8ByteLength,
  validatePasswordPolicy
} from "./password-policy.js";

describe("validatePasswordPolicy", () => {
  it("rejects weak or common passwords", () => {
    expect(() => validatePasswordPolicy("password")).toThrow(/Password must include/);
  });

  it("accepts longer mixed passwords", () => {
    expect(() => validatePasswordPolicy("ShiftFlow!2026")).not.toThrow();
  });

  it("accepts 72 ASCII bytes and rejects 73 before bcrypt can truncate", () => {
    const accepted = `Aa1!${"x".repeat(68)}`;
    const rejected = `${accepted}x`;

    expect(passwordUtf8ByteLength(accepted)).toBe(maximumBcryptPasswordBytes);
    expect(() => validatePasswordPolicy(accepted)).not.toThrow();
    expect(passwordUtf8ByteLength(rejected)).toBe(maximumBcryptPasswordBytes + 1);
    expect(() => validatePasswordPolicy(rejected)).toThrow("at most 72 UTF-8 bytes");
  });

  it("counts multibyte passwords by UTF-8 bytes rather than characters", () => {
    const accepted = `Aa1!${"é".repeat(34)}`;
    const rejected = `${accepted}é`;

    expect(passwordUtf8ByteLength(accepted)).toBe(maximumBcryptPasswordBytes);
    expect(() => validatePasswordPolicy(accepted)).not.toThrow();
    expect(passwordUtf8ByteLength(rejected)).toBe(maximumBcryptPasswordBytes + 2);
    expect(() => validatePasswordPolicy(rejected)).toThrow("at most 72 UTF-8 bytes");
  });
});
