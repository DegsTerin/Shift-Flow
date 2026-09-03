// en-GB: Proves exact candidate/history coverage, bounded reads and redacted secret findings.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanContent, scanGitCandidate, scanGitHistory } from "./security-scan-lib.mjs";

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

function repository() {
  const root = mkdtempSync(join(tmpdir(), "shiftflow-secret-scan-"));
  temporaryRoots.push(root);
  git(root, "init");
  git(root, "config", "user.email", "security-test@shiftflow.local");
  git(root, "config", "user.name", "ShiftFlow security test");
  return root;
}

function commit(root, message) {
  git(root, "commit", "-m", message);
}

function token(marker) {
  return `ghp_${marker.repeat(40)}`;
}

function writeAllowlist(root, finding) {
  const directory = join(root, "eng");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "secret-history-allowlist.json"),
    `${JSON.stringify(
      {
        schemaVersion: "shiftflow.secret-history-allowlist/v1",
        findings: [{ ...finding, reason: "Synthetic historical scanner regression" }]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

describe("secret scan redaction", () => {
  it("reports a recognised token without returning its value or source line", () => {
    const secret = token("A");
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

  it("permits only exact documented placeholders", () => {
    const testPrefixedSecret = `test${"a".repeat(40)}`;
    const productPrefixedSecret = `shiftflow${"b".repeat(40)}`;

    expect(scanContent("E2E_PASSWORD=replace-with-a-local-password", ".env.example")).toEqual([]);
    expect(scanContent(`E2E_PASSWORD=${testPrefixedSecret}`, ".env")).toEqual([
      { name: "User credential in environment file", file: ".env", line: 1 }
    ]);
    expect(scanContent(`password = "${productPrefixedSecret}"`, "config.ts")).toEqual([
      { name: "Generic sensitive assignment", file: "config.ts", line: 1 }
    ]);
  });

  it("does not classify an environment-variable reference as a hard-coded secret", () => {
    expect(
      scanContent("const password = process.env.REALISTIC_SEED_PASSWORD;", "fixture.mjs")
    ).toEqual([]);
  });
});

describe("exact Git candidate scanning", () => {
  it("finds a NUL-bearing staged secret even when the worktree has been made safe", () => {
    const root = repository();
    const secret = token("S");
    const source = Buffer.concat([Buffer.from("binary\0", "latin1"), Buffer.from(secret, "ascii")]);
    writeFileSync(join(root, "candidate.bin"), source);
    git(root, "add", "candidate.bin");
    writeFileSync(join(root, "candidate.bin"), "safe worktree content\n", "utf8");

    const result = scanGitCandidate(root);
    const serialised = JSON.stringify(result);

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        name: "GitHub classic token",
        file: "candidate.bin",
        source: "git-index"
      })
    );
    expect(serialised).not.toContain(secret);
    expect(result.scannedIndexBlobs).toBe(1);
    expect(result.scannedWorktreeFiles).toBe(1);
  });

  it("finds a NUL-bearing worktree secret when the index remains safe", () => {
    const root = repository();
    const secret = token("W");
    writeFileSync(join(root, "candidate.bin"), "safe indexed content\n", "utf8");
    git(root, "add", "candidate.bin");
    commit(root, "Add safe candidate");
    writeFileSync(
      join(root, "candidate.bin"),
      Buffer.concat([Buffer.from("safe-index\0", "latin1"), Buffer.from(secret, "ascii")])
    );

    const result = scanGitCandidate(root);
    const serialised = JSON.stringify(result);

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        name: "GitHub classic token",
        file: "candidate.bin",
        source: "worktree"
      })
    );
    expect(serialised).not.toContain(secret);
  });

  it("fails structurally before reading an oversized worktree candidate", () => {
    const root = repository();
    writeFileSync(join(root, "oversized.bin"), Buffer.alloc(65, 65));

    const result = scanGitCandidate(root, { maximumCandidateFileBytes: 64 });

    expect(result.findings).toContainEqual({
      name: "Worktree file exceeds the secret-scanner size limit",
      file: "oversized.bin",
      line: 1,
      source: "worktree"
    });
    expect(result.scannedWorktreeFiles).toBe(0);
  });
});

describe("reachable Git history scanning", () => {
  it("detects a NUL-bearing secret that remains only in reachable history", () => {
    const root = repository();
    const secret = token("H");
    const sourceLine = `const retiredCredential = "${secret}";`;
    writeFileSync(
      join(root, "historic.bin"),
      Buffer.concat([Buffer.from("binary\0", "latin1"), Buffer.from(`${sourceLine}\n`, "ascii")])
    );
    git(root, "add", "historic.bin");
    commit(root, "Add historical fixture");
    writeFileSync(join(root, "historic.bin"), "active=true\n", "utf8");
    git(root, "add", "historic.bin");
    commit(root, "Remove historical fixture");

    const result = scanGitHistory(root);
    const serialised = JSON.stringify(result);

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        name: "GitHub classic token",
        file: "historic.bin",
        line: 1,
        source: "git-history"
      })
    );
    expect(result.scannedBlobs).toBeGreaterThanOrEqual(2);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(sourceLine);
  });

  it("uses only the exact indexed allowlist blob", () => {
    const root = repository();
    const secret = token("L");
    writeFileSync(join(root, "historic.ts"), `${secret}\n`, "utf8");
    git(root, "add", "historic.ts");
    commit(root, "Add allowlisted historical fixture");
    writeFileSync(join(root, "historic.ts"), "safe=true\n", "utf8");
    git(root, "add", "historic.ts");
    commit(root, "Remove allowlisted historical fixture");

    const observed = scanGitHistory(root).findings.find(
      (finding) => finding.name === "GitHub classic token" && finding.file === "historic.ts"
    );
    expect(observed).toBeDefined();
    writeAllowlist(root, observed);
    expect(scanGitHistory(root).findings).toContainEqual(observed);

    git(root, "add", "eng/secret-history-allowlist.json");
    expect(scanGitHistory(root).findings).not.toContainEqual(observed);

    writeAllowlist(root, { ...observed, line: observed.line + 1 });
    expect(scanGitHistory(root).findings).not.toContainEqual(observed);
  }, 20_000);

  it("never permits an allowlist to suppress an oversized structural finding", () => {
    const root = repository();
    writeFileSync(join(root, "large.bin"), Buffer.alloc(65, 65));
    git(root, "add", "large.bin");
    commit(root, "Add oversized history fixture");
    const oversized = scanGitHistory(root, { maximumHistoryBlobBytes: 64 }).findings.find(
      (finding) => finding.name === "Historical blob exceeds the secret-scanner size limit"
    );
    expect(oversized).toBeDefined();
    writeAllowlist(root, oversized);
    git(root, "add", "eng/secret-history-allowlist.json");

    expect(() => scanGitHistory(root, { maximumHistoryBlobBytes: 64 })).toThrow(
      /invalid detector entry/
    );
  });

  it("reads multiple real blobs in cumulative-size batches", () => {
    const root = repository();
    for (const name of ["one", "two", "three"]) {
      writeFileSync(join(root, `${name}.txt`), `${name.repeat(20)}\n`, "utf8");
      git(root, "add", `${name}.txt`);
    }
    commit(root, "Add batch fixtures");

    const result = scanGitHistory(root, { maximumBatchBytes: 300 });

    expect(result.findings).toEqual([]);
    expect(result.scannedBlobs).toBe(3);
    expect(result.gitBatchCount).toBe(3);
  });
});
