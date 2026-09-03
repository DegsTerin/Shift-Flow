// en-GB: Proves secret findings contain location metadata only so the scanner cannot echo detected credentials.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanContent, scanGitHistory } from "./security-scan-lib.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(root, ...argumentsList) {
  return execFileSync("git", ["-C", root, ...argumentsList], {
    encoding: "utf8",
    windowsHide: true
  });
}

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

  it("detects a redacted secret that remains only in reachable Git history", () => {
    const root = mkdtempSync(join(tmpdir(), "shiftflow-secret-history-"));
    temporaryRoots.push(root);
    git(root, "init");
    git(root, "config", "user.email", "security-test@shiftflow.local");
    git(root, "config", "user.name", "ShiftFlow security test");
    const secret = `ghp_${"H".repeat(40)}`;
    const sourceLine = `const retiredCredential = "${secret}";`;
    writeFileSync(join(root, "historic.ts"), `${sourceLine}\n`, "utf8");
    git(root, "add", "historic.ts");
    git(root, "commit", "-m", "Add historical fixture");
    writeFileSync(join(root, "historic.ts"), "export const active = true;\n", "utf8");
    git(root, "commit", "-am", "Remove historical fixture");

    const result = scanGitHistory(root);
    const serialised = JSON.stringify(result);

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        name: "GitHub classic token",
        file: "historic.ts",
        line: 1,
        source: "git-history"
      })
    );
    expect(result.scannedBlobs).toBeGreaterThanOrEqual(2);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(sourceLine);
  }, 15_000);
});
