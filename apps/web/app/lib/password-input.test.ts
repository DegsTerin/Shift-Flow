// en-GB: Proves new-password browser validation counts UTF-8 bytes at the bcrypt boundary.
import { describe, expect, it, vi } from "vitest";
import {
  applyNewPasswordByteValidity,
  maximumNewPasswordUtf8Bytes,
  newPasswordUtf8ByteLength
} from "./password-input";

describe("new password input", () => {
  it("accepts 72 ASCII bytes and rejects 73", () => {
    const setCustomValidity = vi.fn();
    const accepted = `Aa1!${"x".repeat(68)}`;

    expect(newPasswordUtf8ByteLength(accepted)).toBe(maximumNewPasswordUtf8Bytes);
    applyNewPasswordByteValidity({ value: accepted, setCustomValidity }, "too long");
    applyNewPasswordByteValidity({ value: `${accepted}x`, setCustomValidity }, "too long");

    expect(setCustomValidity.mock.calls).toEqual([[""], ["too long"]]);
  });

  it("rejects multibyte content above 72 UTF-8 bytes", () => {
    const setCustomValidity = vi.fn();
    const accepted = `Aa1!${"é".repeat(34)}`;

    expect(newPasswordUtf8ByteLength(accepted)).toBe(maximumNewPasswordUtf8Bytes);
    applyNewPasswordByteValidity({ value: accepted, setCustomValidity }, "too long");
    applyNewPasswordByteValidity({ value: `${accepted}é`, setCustomValidity }, "too long");

    expect(setCustomValidity.mock.calls).toEqual([[""], ["too long"]]);
  });
});
