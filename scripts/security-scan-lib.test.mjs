// en-GB: Proves secret findings contain location metadata only so the scanner cannot echo detected credentials.
import { describe, expect, it } from "vitest";
import { scanContent } from "./security-scan-lib.mjs";

describe("secret scan redaction", () => {
  it("reports a recognised token without returning its value or source line", () => {
    const secret = `ghp_${"A".repeat(40)}`;
    const sourceLine = `const credential = "${secret}";`;
    const result = scanContent(sourceLine, "fixture.ts");
    const serialised = JSON.stringify(result);

    expect(result).toContainEqual(
      expect.objectContaining({ name: "GitHub classic token", file: "fixture.ts", line: 1 })
    );
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(sourceLine);
    expect(result.every((finding) => !("value" in finding))).toBe(true);
  });

  it("reports environment credential keys without returning their assignments", () => {
    const sourceLine = "E2E_PASSWORD=correct-horse-battery-staple";
    const result = scanContent(sourceLine, ".env.example");

    expect(result).toEqual([
      { name: "User credential in environment file", file: ".env.example", line: 1 }
    ]);
    expect(JSON.stringify(result)).not.toContain("correct-horse-battery-staple");
  });

  it("detects an unquoted sensitive assignment without returning its value", () => {
    const secret = "b".repeat(40);
    const result = scanContent(`API_KEY=${secret}`, ".env.example");

    expect(result).toContainEqual({
      name: "Generic sensitive assignment",
      file: ".env.example",
      line: 1
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("does not classify an environment-variable reference as a hard-coded secret", () => {
    const result = scanContent(
      "const password = process.env.REALISTIC_SEED_PASSWORD;",
      "fixture.mjs"
    );

    expect(result).toEqual([]);
  });
});
