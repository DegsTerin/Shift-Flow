// en-GB: Proves exact candidate/history coverage, bounded reads and path-free findings.
/* global process */
import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { scanContent, scanGitCandidate, scanGitHistory } from "./security-scan-lib.mjs";

const temporaryRoots = [];
const scannerScript = fileURLToPath(new URL("./security-scan.mjs", import.meta.url));
const publicFindingFields = ["detector", "id", "line", "origin", "scope"];

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

function gitWithInput(root, input, ...argumentsList) {
  return execFileSync("git", ["-C", root, ...argumentsList], {
    encoding: "utf8",
    input,
    windowsHide: true
  });
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), "shiftflow-secret-scan-"));
  temporaryRoots.push(root);
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "security-test@shiftflow.local");
  git(root, "config", "user.name", "ShiftFlow security test");
  return root;
}

function plainDirectory() {
  const root = mkdtempSync(join(tmpdir(), "shiftflow-secret-scan-non-repository-"));
  temporaryRoots.push(root);
  return root;
}

function commit(root, message) {
  git(root, "commit", "--quiet", "-m", message);
}

function token(marker) {
  return `ghp_${marker.repeat(40)}`;
}

function hostileFile(marker, extension = ".bin") {
  const prefix = process.platform === "win32" ? "secret-like" : "control-\n";
  return `${prefix}-${token(marker)}${extension}`;
}

function expectPublicFinding(finding) {
  expect(Object.keys(finding).sort()).toEqual(publicFindingFields);
  expect(finding.detector).toEqual(expect.any(String));
  expect(finding.scope).toEqual(expect.any(String));
  expect(finding.origin).toEqual(expect.any(String));
  expect(finding.line).toBeGreaterThan(0);
  expect(finding.id).toMatch(/^[0-9a-f]{64}$/u);
}

function expectPathFree(serialised, file) {
  const escapedFile = JSON.stringify(file).slice(1, -1);
  const embeddedToken = file.match(/ghp_[A-Za-z0-9_]{30,}/u)?.[0];
  expect(serialised).not.toContain(file);
  expect(serialised).not.toContain(escapedFile);
  if (embeddedToken) expect(serialised).not.toContain(embeddedToken);
  expect(serialised).not.toMatch(/"(?:file|name|object|path|source)"\s*:/u);
}

function writeAllowlist(root, finding) {
  const directory = join(root, "eng");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "secret-history-allowlist.json"),
    `${JSON.stringify(
      {
        schemaVersion: "shiftflow.secret-history-allowlist/v2",
        findings: [
          {
            detector: finding.detector,
            scope: finding.scope,
            origin: finding.origin,
            line: finding.line,
            id: finding.id,
            reason: "Synthetic historical scanner regression"
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function runScanner(root) {
  return spawnSync(process.execPath, [scannerScript], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

describe("secret scan redaction", () => {
  it("reports only stable opaque fields without returning the value, source line or label", () => {
    const secret = token("A");
    const file = hostileFile("P", ".ts");
    const sourceLine = `const credential = "${secret}";`;
    const first = scanContent(sourceLine, file);
    const second = scanContent(sourceLine, file);
    const serialised = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first).not.toHaveLength(0);
    expect(first).toContainEqual(
      expect.objectContaining({ detector: "GitHub classic token", line: 1 })
    );
    first.forEach(expectPublicFinding);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(sourceLine);
    expectPathFree(serialised, file);
  });

  it("permits only exact documented placeholders", () => {
    const testPrefixedSecret = `test${"a".repeat(40)}`;
    const productPrefixedSecret = `shiftflow${"b".repeat(40)}`;

    expect(scanContent("E2E_PASSWORD=replace-with-a-local-password", ".env.example")).toEqual([]);
    expect(scanContent(`E2E_PASSWORD=${testPrefixedSecret}`, ".env")).toContainEqual(
      expect.objectContaining({ detector: "User credential in environment file", line: 1 })
    );
    expect(scanContent(`password = "${productPrefixedSecret}"`, "config.ts")[0]).toEqual(
      expect.objectContaining({ detector: "Generic sensitive assignment", line: 1 })
    );
  });

  it("does not classify an environment-variable reference as a hard-coded secret", () => {
    expect(
      scanContent("const password = process.env.REALISTIC_SEED_PASSWORD;", "fixture.mjs")
    ).toEqual([]);
  });
});

describe("exact Git candidate scanning", () => {
  it("finds a NUL-bearing staged secret without serialising its hostile path or value", () => {
    const root = repository();
    const file = hostileFile("I");
    const secret = token("S");
    const source = Buffer.concat([Buffer.from("binary\0", "latin1"), Buffer.from(secret, "ascii")]);
    writeFileSync(join(root, file), source);
    git(root, "add", "--", file);
    writeFileSync(join(root, file), "safe worktree content\n", "utf8");

    const result = scanGitCandidate(root);
    const serialised = JSON.stringify(result.findings);
    const observed = result.findings.find(
      (finding) => finding.detector === "GitHub classic token" && finding.origin === "git-index"
    );

    expect(observed).toBeDefined();
    expectPublicFinding(observed);
    expect(serialised).not.toContain(secret);
    expectPathFree(serialised, file);
    expect(result.scannedIndexBlobs).toBe(1);
    expect(result.scannedWorktreeFiles).toBe(1);
  });

  it("finds a NUL-bearing worktree secret while the exact index remains safe", () => {
    const root = repository();
    const file = hostileFile("W");
    const secret = token("X");
    writeFileSync(join(root, file), "safe indexed content\n", "utf8");
    git(root, "add", "--", file);
    commit(root, "Add safe candidate");
    writeFileSync(
      join(root, file),
      Buffer.concat([Buffer.from("safe-index\0", "latin1"), Buffer.from(secret, "ascii")])
    );

    const result = scanGitCandidate(root);
    const serialised = JSON.stringify(result.findings);
    const observed = result.findings.find(
      (finding) => finding.detector === "GitHub classic token" && finding.origin === "worktree"
    );

    expect(observed).toBeDefined();
    expectPublicFinding(observed);
    expect(serialised).not.toContain(secret);
    expectPathFree(serialised, file);
  });

  it("reports an oversized hostile candidate structurally without exposing its path", () => {
    const root = repository();
    const file = hostileFile("O");
    writeFileSync(join(root, file), Buffer.alloc(65, 65));

    const result = scanGitCandidate(root, { maximumCandidateFileBytes: 64 });
    const serialised = JSON.stringify(result.findings);
    const observed = result.findings.find(
      (finding) => finding.detector === "Worktree file exceeds the secret-scanner size limit"
    );

    expect(observed).toBeDefined();
    expectPublicFinding(observed);
    expectPathFree(serialised, file);
    expect(result.scannedWorktreeFiles).toBe(0);
  });

  it("fails closed when a worktree file changes to different bytes of the same size", () => {
    const root = repository();
    const file = "same-size-candidate.txt";
    const before = `safe${"a".repeat(40)}`;
    const after = token("T");
    expect(Buffer.byteLength(before)).toBe(Buffer.byteLength(after));
    writeFileSync(join(root, file), before, "utf8");

    const result = scanGitCandidate(root, {
      afterWorktreeSnapshotRead() {
        writeFileSync(join(root, file), after, "utf8");
      }
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        detector: "Worktree file changed while it was being scanned",
        origin: "worktree"
      })
    );
    expect(JSON.stringify(result.findings)).not.toContain(after);
    expect(result.scannedWorktreeFiles).toBe(0);
  });

  it.skipIf(process.platform === "win32")(
    "preserves a literal POSIX backslash instead of rewriting it as a separator",
    () => {
      const root = repository();
      const file = `literal\\backslash-${token("B")}.bin`;
      const secret = token("C");
      writeFileSync(join(root, file), secret, "utf8");

      const result = scanGitCandidate(root);
      const observed = result.findings.find(
        (finding) => finding.detector === "GitHub classic token" && finding.origin === "worktree"
      );

      expect(observed).toBeDefined();
      expectPublicFinding(observed);
      expectPathFree(JSON.stringify(result.findings), file);
    }
  );
});

describe("reachable Git history scanning", () => {
  it("detects a NUL-bearing historical secret without serialising its former path", () => {
    const root = repository();
    const file = hostileFile("H");
    const secret = token("R");
    const sourceLine = `const retiredCredential = "${secret}";`;
    writeFileSync(
      join(root, file),
      Buffer.concat([Buffer.from("binary\0", "latin1"), Buffer.from(`${sourceLine}\n`, "ascii")])
    );
    git(root, "add", "--", file);
    commit(root, "Add historical fixture");
    writeFileSync(join(root, file), "active=true\n", "utf8");
    git(root, "add", "--", file);
    commit(root, "Remove historical fixture");

    const result = scanGitHistory(root);
    const serialised = JSON.stringify(result.findings);
    const observed = result.findings.find(
      (finding) => finding.detector === "GitHub classic token" && finding.origin === "git-history"
    );

    expect(observed).toBeDefined();
    expectPublicFinding(observed);
    expect(result.scannedBlobs).toBeGreaterThanOrEqual(2);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(sourceLine);
    expectPathFree(serialised, file);
  });

  it("scans a reachable blob even when no path or object name exists", () => {
    const root = repository();
    const secret = token("D");
    const objectId = gitWithInput(root, secret, "hash-object", "-w", "--stdin").trim();
    git(root, "update-ref", "refs/tags/pathless-secret", objectId);

    const result = scanGitHistory(root);
    const serialised = JSON.stringify(result.findings);
    const observed = result.findings.find(
      (finding) => finding.detector === "GitHub classic token" && finding.origin === "git-history"
    );

    expect(observed).toBeDefined();
    expectPublicFinding(observed);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(objectId);
    expect(result.scannedBlobs).toBe(1);
  });

  it("uses only the exact indexed v2 allowlist blob", () => {
    const root = repository();
    const secret = token("L");
    writeFileSync(join(root, "historic.ts"), `${secret}\n`, "utf8");
    git(root, "add", "historic.ts");
    commit(root, "Add allowlisted historical fixture");
    writeFileSync(join(root, "historic.ts"), "safe=true\n", "utf8");
    git(root, "add", "historic.ts");
    commit(root, "Remove allowlisted historical fixture");

    const observed = scanGitHistory(root).findings.find(
      (finding) => finding.detector === "GitHub classic token"
    );
    expect(observed).toBeDefined();
    writeAllowlist(root, observed);
    expect(scanGitHistory(root).findings).toContainEqual(observed);

    git(root, "add", "eng/secret-history-allowlist.json");
    expect(scanGitHistory(root).findings).not.toContainEqual(observed);

    writeAllowlist(root, { ...observed, line: observed.line + 1 });
    expect(scanGitHistory(root).findings).not.toContainEqual(observed);

    git(root, "add", "eng/secret-history-allowlist.json");
    const stagedResult = scanGitHistory(root).findings;
    expect(stagedResult).toContainEqual(observed);
    expect(stagedResult).toContainEqual(
      expect.objectContaining({ detector: "Stale secret-history allowlist entry" })
    );
  }, 20_000);

  it("never permits an allowlist to suppress an oversized structural finding", () => {
    const root = repository();
    writeFileSync(join(root, "large.bin"), Buffer.alloc(65, 65));
    git(root, "add", "large.bin");
    commit(root, "Add oversized history fixture");
    const oversized = scanGitHistory(root, { maximumHistoryBlobBytes: 64 }).findings.find(
      (finding) => finding.detector === "Historical blob exceeds the secret-scanner size limit"
    );
    expect(oversized).toBeDefined();
    expectPublicFinding(oversized);
    writeAllowlist(root, oversized);
    git(root, "add", "eng/secret-history-allowlist.json");

    expect(() => scanGitHistory(root, { maximumHistoryBlobBytes: 64 })).toThrow(
      /invalid detector entry/u
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

describe("scanner CLI output", () => {
  it("emits only path-free finding fields for a hostile candidate filename", () => {
    const root = repository();
    const file = hostileFile("Q");
    const secret = token("V");
    writeFileSync(join(root, file), Buffer.concat([Buffer.from("NUL\0"), Buffer.from(secret)]));

    const result = runScanner(root);
    const report = JSON.parse(result.stderr);
    const serialised = JSON.stringify(report);

    expect(result.status).toBe(1);
    expect(report.status).toBe("failed");
    expect(report.findings.length).toBeGreaterThan(0);
    report.findings.forEach(expectPublicFinding);
    expect(serialised).not.toContain(secret);
    expectPathFree(serialised, file);
  });

  it("redacts internal Git and filesystem errors instead of serialising exception paths", () => {
    const root = plainDirectory();

    const result = runScanner(root);
    const report = JSON.parse(result.stderr);

    expect(result.status).toBe(1);
    expect(report).toEqual({
      status: "failed",
      findings: [
        expect.objectContaining({
          detector: "Security scan could not complete safely",
          scope: "scanner",
          origin: "internal"
        })
      ]
    });
    expectPublicFinding(report.findings[0]);
    expect(result.stderr).not.toContain(root);
    expect(result.stderr).not.toContain(scannerScript);
  });
});
