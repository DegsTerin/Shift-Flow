// en-GB: Verifies that proxy trust is disabled by default and accepts only explicit literal addresses.
import { describe, expect, it } from "vitest";
import { parseTrustedProxy } from "./trusted-proxy.js";

describe("parseTrustedProxy", () => {
  it("treats the documented false string as disabled proxy trust", () => {
    expect(parseTrustedProxy("false")).toBe(false);
    expect(parseTrustedProxy(undefined)).toBe(false);
  });

  it("normalises an explicit IPv4 and IPv6 allowlist", () => {
    expect(parseTrustedProxy(" 172.31.238.10, ::1 ")).toEqual(["172.31.238.10", "::1"]);
  });

  it.each(["true", "*", "10.0.0.0/8", "proxy.internal"])(
    "rejects broad or non-literal trust value %s",
    (value) => {
      expect(() => parseTrustedProxy(value)).toThrow(/literal IP addresses/);
    }
  );
});
