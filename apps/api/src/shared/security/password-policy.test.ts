// en-GB: Exercises application behaviour so regressions at this boundary are detected automatically.
import { describe, expect, it } from "vitest";
import { validatePasswordPolicy } from "./password-policy.js";

describe("validatePasswordPolicy", () => {
  it("rejects weak or common passwords", () => {
    expect(() => validatePasswordPolicy("password")).toThrow(/Password must include/);
  });

  it("accepts longer mixed passwords", () => {
    expect(() => validatePasswordPolicy("ShiftFlow!2026")).not.toThrow();
  });
});
