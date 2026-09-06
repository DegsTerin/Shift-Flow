// en-GB: Scans exact Git candidates and reachable history without exposing matched values.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fileSystemConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const maximumCandidateFileBytes = 16 * 1024 * 1024;
const maximumHistoryBlobBytes = 16 * 1024 * 1024;
const maximumGitBatchBytes = 64 * 1024 * 1024;
const gitBatchEntryOverheadBytes = 160;
const historyAllowlistPath = "eng/secret-history-allowlist.json";
const historyAllowlistSchema = "shiftflow.secret-history-allowlist/v2";
const findingIdentifierSchema = "shiftflow.security-finding/v1";

const userCredentialEnvPattern =
  /^(?:E2E_PASSWORD|NEXT_PUBLIC_DEMO_PASSWORD|DEMO_PASSWORD|USER_PASSWORD|ADMIN_PASSWORD)=(?<value>.*)$/i;

const patterns = [
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "AWS temporary access key", pattern: /ASIA[0-9A-Z]{16}/g },
  { name: "Private key", pattern: /-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g },
  { name: "GitHub classic token", pattern: /ghp_[A-Za-z0-9_]{30,}/g },
  { name: "GitHub fine-grained token", pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "OpenAI API key", pattern: /sk-[A-Za-z0-9]{20,}/g },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/g }
];

const assignmentPattern =
  /\b(?:api[_-]?key|authorization|credential|jwt[_-]?secret|password|private[_-]?key|secret|token)\b\s*[:=]\s*(?:["'](?<quoted>[A-Za-z0-9_./+=-]{32,})["']|(?<bare>[A-Za-z0-9_./+=-]{32,})(?=\s*(?:$|[,;}#])))/gim;

const exactPlaceholderValues = new Set([
  "[redacted]",
  "replace-with-a-local-access-secret",
  "replace-with-a-local-password",
  "replace-with-a-local-secret",
  "test-sensitive-value-that-must-not-cross"
]);

const allowlistableDetectorNames = new Set([
  ...patterns.map(({ name }) => name),
  "Generic sensitive assignment",
  "User credential in environment file"
]);

function runGit(repositoryRoot, argumentsList, options = {}) {
  return execFileSync("git", ["-C", repositoryRoot, ...argumentsList], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    ...options
  });
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/u).length;
}

function isPlaceholderValue(value) {
  return exactPlaceholderValues.has(
    value
      .trim()
      .replace(/^["']|["']$/gu, "")
      .toLowerCase()
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pathIdentifier(file) {
  return sha256(Buffer.from(file, "utf8"));
}

function finding(detector, scope, origin, line, locator) {
  const id = sha256(
    JSON.stringify([findingIdentifierSchema, detector, scope, origin, line, locator])
  );
  return { detector, scope, origin, line, id };
}

function scanContentWithContext(content, context) {
  const findings = [];

  content.split(/\r?\n/u).forEach((line, index) => {
    const credential = line.trim().match(userCredentialEnvPattern);
    if (credential && !isPlaceholderValue(credential.groups?.value ?? "")) {
      findings.push(
        finding(
          "User credential in environment file",
          context.scope,
          context.origin,
          index + 1,
          context.locator
        )
      );
    }
  });

  for (const { name, pattern } of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      findings.push(
        finding(
          name,
          context.scope,
          context.origin,
          lineNumberAt(content, match.index),
          context.locator
        )
      );
    }
  }

  assignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(assignmentPattern)) {
    const value = match.groups?.quoted ?? match.groups?.bare ?? "";
    if (isPlaceholderValue(value) || /^(?:process|import[.]meta|Deno|Bun)[.]env\b/i.test(value)) {
      continue;
    }
    findings.push(
      finding(
        "Generic sensitive assignment",
        context.scope,
        context.origin,
        lineNumberAt(content, match.index),
        context.locator
      )
    );
  }

  return findings;
}

function scanBytes(bytes, context) {
  return scanContentWithContext(bytes.toString("latin1"), context);
}

export function scanContent(content, file = "provided-content") {
  const bytes = Buffer.from(content, "latin1");
  return scanContentWithContext(content, {
    scope: "content",
    origin: "provided-content",
    locator: `content:${sha256(bytes)}:label:${pathIdentifier(String(file))}`
  });
}

export function createScannerFailureFinding() {
  return finding(
    "Security scan could not complete safely",
    "scanner",
    "internal",
    1,
    "scanner-internal-failure"
  );
}

function parseIndexEntries(output) {
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(
        /^(?<mode>[0-7]{6}) (?<objectId>[0-9a-f]+) (?<stage>[0-3])\t(?<file>[\s\S]+)$/u
      );
      if (!match?.groups) throw new Error("Git returned an invalid index entry");
      return {
        mode: match.groups.mode,
        objectId: match.groups.objectId,
        stage: Number(match.groups.stage),
        file: match.groups.file
      };
    });
}

function listGitIndexEntries(repositoryRoot, pathspec) {
  const argumentsList = ["ls-files", "--stage", "-z"];
  if (pathspec) argumentsList.push("--", pathspec);
  return parseIndexEntries(runGit(repositoryRoot, argumentsList));
}

function listWorktreeCandidateFiles(repositoryRoot) {
  const modified = runGit(
    repositoryRoot,
    ["diff", "--name-only", "-z", "--no-ext-diff", "--diff-filter=ACMRTUXB"],
    { encoding: "utf8" }
  );
  const untracked = runGit(repositoryRoot, ["ls-files", "-z", "--others", "--exclude-standard"], {
    encoding: "utf8"
  });
  return Array.from(new Set(`${modified}${untracked}`.split("\0").filter(Boolean)));
}

function inspectGitObjects(repositoryRoot, objects) {
  if (!objects.length) return [];
  const output = runGit(repositoryRoot, ["cat-file", "--batch-check"], {
    encoding: "utf8",
    input: `${objects.map(({ objectId }) => objectId).join("\n")}\n`,
    maxBuffer: maximumGitBatchBytes
  });
  const descriptions = output.trimEnd().split(/\r?\n/u);
  if (descriptions.length !== objects.length) {
    throw new Error("Git returned an incomplete object inventory");
  }
  return descriptions.map((description, index) => {
    const [objectId, type, sizeText] = description.split(" ");
    if (
      objectId !== objects[index].objectId ||
      !/^[0-9]+$/u.test(sizeText ?? "") ||
      !Number.isSafeInteger(Number(sizeText))
    ) {
      throw new Error("Git returned an invalid object description");
    }
    return { ...objects[index], type, size: Number(sizeText) };
  });
}

function partitionGitBlobBatches(blobs, maximumBatchBytes = maximumGitBatchBytes) {
  if (!Number.isSafeInteger(maximumBatchBytes) || maximumBatchBytes < 1) {
    throw new Error("Git batch budget must be a positive integer");
  }
  const batches = [];
  let batch = [];
  let batchBytes = 0;
  for (const blob of blobs) {
    const entryBytes = blob.size + gitBatchEntryOverheadBytes;
    if (entryBytes > maximumBatchBytes) {
      throw new Error("A Git blob exceeds the configured cumulative batch budget");
    }
    if (batch.length && batchBytes + entryBytes > maximumBatchBytes) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(blob);
    batchBytes += entryBytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function readGitBlobBatch(repositoryRoot, blobs) {
  if (!blobs.length) return [];
  const expectedBytes = blobs.reduce(
    (total, blob) => total + blob.size + gitBatchEntryOverheadBytes,
    0
  );
  const output = runGit(repositoryRoot, ["cat-file", "--batch"], {
    input: `${blobs.map(({ objectId }) => objectId).join("\n")}\n`,
    maxBuffer: Math.max(expectedBytes, 1_024)
  });
  const contents = [];
  let offset = 0;
  for (const blob of blobs) {
    const headerEnd = output.indexOf(10, offset);
    if (headerEnd === -1) throw new Error("Git returned an incomplete blob header");
    const header = output.subarray(offset, headerEnd).toString("utf8");
    if (header !== `${blob.objectId} blob ${blob.size}`) {
      throw new Error("Git returned an invalid blob header");
    }
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + blob.size;
    if (contentEnd >= output.length || output[contentEnd] !== 10) {
      throw new Error("Git returned an incomplete blob");
    }
    contents.push(output.subarray(contentStart, contentEnd));
    offset = contentEnd + 1;
  }
  if (offset !== output.length) throw new Error("Git returned unexpected trailing blob data");
  return contents;
}

function readGitBlobs(repositoryRoot, blobs, maximumBatchBytes) {
  const contents = [];
  const batches = partitionGitBlobBatches(blobs, maximumBatchBytes);
  for (const batch of batches) contents.push(...readGitBlobBatch(repositoryRoot, batch));
  return { contents, batchCount: batches.length };
}

function sameOpenedFile(left, right) {
  return ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs"].every(
    (field) => left[field] === right[field]
  );
}

function readOpenedBytes(handle, size) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < bytes.length) {
    const bytesRead = readSync(handle, bytes, offset, bytes.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset === bytes.length ? bytes : undefined;
}

function boundedWorktreeFile(repositoryRoot, file, maximumBytes, afterRead) {
  const path = resolve(repositoryRoot, file);
  if (!existsSync(path)) return { status: "missing" };
  let handle;
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return { status: "symbolic-link" };
    if (!stats.isFile()) return { status: "not-file" };

    const realPath = realpathSync(path);
    const relativePath = relative(repositoryRoot, realPath);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return { status: "outside" };
    }

    const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
    handle = openSync(realPath, fileSystemConstants.O_RDONLY | noFollow);
    const openedStats = fstatSync(handle, { bigint: true });
    if (!openedStats.isFile()) return { status: "not-file" };
    if (openedStats.size > BigInt(maximumBytes)) return { status: "oversized" };
    const bytes = readOpenedBytes(handle, Number(openedStats.size));
    afterRead?.();
    const verificationBytes = readOpenedBytes(handle, Number(openedStats.size));
    const completedStats = fstatSync(handle, { bigint: true });
    const completedPathStats = lstatSync(path, { bigint: true });
    const completedRealPath = realpathSync(path);
    if (
      bytes === undefined ||
      verificationBytes === undefined ||
      !bytes.equals(verificationBytes) ||
      !sameOpenedFile(openedStats, completedStats) ||
      !completedPathStats.isFile() ||
      completedRealPath !== realPath ||
      !sameOpenedFile(openedStats, completedPathStats)
    ) {
      return { status: "changed" };
    }
    return { status: "ok", bytes, snapshotId: sha256(bytes) };
  } catch {
    return { status: "unreadable" };
  } finally {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // The caller reports the already fail-closed scan result.
      }
    }
  }
}

function candidateLocator(file, detail) {
  return `path-sha256:${pathIdentifier(file)}:${detail}`;
}

function structuralFinding(detector, scope, origin, locator, line = 1) {
  return finding(detector, scope, origin, line, locator);
}

export function scanGitCandidate(repositoryRoot, options = {}) {
  const root = realpathSync(repositoryRoot);
  const candidateLimit = options.maximumCandidateFileBytes ?? maximumCandidateFileBytes;
  const batchLimit = options.maximumBatchBytes ?? maximumGitBatchBytes;
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error("Candidate scan limit must be a positive integer");
  }
  const findings = [];
  let scannedIndexBlobs = 0;
  let scannedWorktreeFiles = 0;

  const indexEntries = listGitIndexEntries(root);
  for (const entry of indexEntries.filter(({ stage }) => stage !== 0)) {
    findings.push(
      structuralFinding(
        "Unmerged index entry cannot be scanned",
        "candidate",
        "git-index",
        candidateLocator(entry.file, `stage:${entry.stage}:object:${entry.objectId}`)
      )
    );
  }
  const indexObjects = inspectGitObjects(
    root,
    indexEntries.filter(({ stage }) => stage === 0)
  );
  const indexBlobs = [];
  for (const object of indexObjects) {
    if (object.mode === "120000") {
      findings.push(
        structuralFinding(
          "Symbolic link is outside the scanner trust boundary",
          "candidate",
          "git-index",
          candidateLocator(object.file, `object:${object.objectId}`)
        )
      );
    } else if (object.type !== "blob") {
      findings.push(
        structuralFinding(
          "Non-blob index entry cannot be scanned",
          "candidate",
          "git-index",
          candidateLocator(object.file, `object:${object.objectId}:type:${object.type}`)
        )
      );
    } else if (object.size > candidateLimit) {
      findings.push(
        structuralFinding(
          "Index blob exceeds the secret-scanner size limit",
          "candidate",
          "git-index",
          candidateLocator(object.file, `object:${object.objectId}`)
        )
      );
    } else {
      indexBlobs.push(object);
    }
  }

  const indexRead = readGitBlobs(root, indexBlobs, batchLimit);
  indexRead.contents.forEach((bytes, index) => {
    const blob = indexBlobs[index];
    scannedIndexBlobs += 1;
    findings.push(
      ...scanBytes(bytes, {
        scope: "candidate",
        origin: "git-index",
        locator: candidateLocator(blob.file, `object:${blob.objectId}`)
      })
    );
  });

  for (const file of listWorktreeCandidateFiles(root)) {
    const result = boundedWorktreeFile(
      root,
      file,
      candidateLimit,
      options.afterWorktreeSnapshotRead
    );
    if (result.status !== "ok") {
      const names = {
        changed: "Worktree file changed while it was being scanned",
        missing: "Worktree candidate disappeared before it could be scanned",
        "not-file": "Worktree candidate is not a regular file",
        outside: "Candidate path escapes the repository",
        oversized: "Worktree file exceeds the secret-scanner size limit",
        "symbolic-link": "Symbolic link is outside the scanner trust boundary",
        unreadable: "Worktree file could not be scanned safely"
      };
      findings.push(
        structuralFinding(
          names[result.status] ?? "Worktree file could not be scanned safely",
          "candidate",
          "worktree",
          candidateLocator(file, `status:${result.status}`)
        )
      );
      continue;
    }
    scannedWorktreeFiles += 1;
    findings.push(
      ...scanBytes(result.bytes, {
        scope: "candidate",
        origin: "worktree",
        locator: candidateLocator(file, `snapshot:${result.snapshotId}`)
      })
    );
  }

  return {
    findings,
    scannedFiles: scannedIndexBlobs + scannedWorktreeFiles,
    scannedIndexBlobs,
    scannedWorktreeFiles,
    gitBatchCount: indexRead.batchCount
  };
}

function listGitHistoryObjects(repositoryRoot) {
  const output = runGit(repositoryRoot, ["rev-list", "--objects", "--all", "--no-object-names"], {
    encoding: "utf8",
    maxBuffer: maximumGitBatchBytes
  });
  const objectIds = output.split(/\r?\n/u).filter(Boolean);
  if (objectIds.some((objectId) => !/^[0-9a-f]{40,64}$/u.test(objectId))) {
    throw new Error("Git returned an invalid reachable-object inventory");
  }
  return Array.from(new Set(objectIds), (objectId) => ({ objectId }));
}

function readHistoryAllowlistFromIndex(repositoryRoot) {
  const entries = listGitIndexEntries(repositoryRoot, historyAllowlistPath).filter(
    ({ stage }) => stage === 0
  );
  if (!entries.length) return undefined;
  if (entries.length !== 1)
    throw new Error("The secret-history allowlist has ambiguous index entries");
  const [object] = inspectGitObjects(repositoryRoot, entries);
  if (object.type !== "blob" || object.size > maximumCandidateFileBytes) {
    throw new Error("The indexed secret-history allowlist is not a bounded blob");
  }
  const [bytes] = readGitBlobBatch(repositoryRoot, [object]);
  return JSON.parse(bytes.toString("utf8"));
}

function validateHistoryAllowlist(allowlist) {
  if (allowlist?.schemaVersion !== historyAllowlistSchema || !Array.isArray(allowlist.findings)) {
    throw new Error("The secret-history allowlist has an invalid schema");
  }
  const identifiers = new Set();
  return allowlist.findings.map((entry) => {
    const fields = Object.keys(entry).sort().join(",");
    if (
      fields !== "detector,id,line,origin,reason,scope" ||
      !allowlistableDetectorNames.has(entry.detector) ||
      typeof entry.id !== "string" ||
      !/^[0-9a-f]{64}$/u.test(entry.id) ||
      !Number.isSafeInteger(entry.line) ||
      entry.line < 1 ||
      entry.origin !== "git-history" ||
      entry.scope !== "history" ||
      typeof entry.reason !== "string" ||
      !entry.reason.trim() ||
      entry.reason.length > 500 ||
      identifiers.has(entry.id)
    ) {
      throw new Error("The secret-history allowlist contains an invalid detector entry");
    }
    identifiers.add(entry.id);
    return entry;
  });
}

function matchesAllowlistEntry(finding, entry) {
  return (
    finding.id === entry.id &&
    finding.detector === entry.detector &&
    finding.scope === entry.scope &&
    finding.origin === entry.origin &&
    finding.line === entry.line
  );
}

function applyHistoryAllowlist(findings, allowlist) {
  if (!allowlist) return findings;
  const entries = validateHistoryAllowlist(allowlist);
  const detectorFindings = findings.filter((finding) =>
    allowlistableDetectorNames.has(finding.detector)
  );
  const allowedIds = new Set(
    entries
      .filter((entry) => detectorFindings.some((finding) => matchesAllowlistEntry(finding, entry)))
      .map((entry) => entry.id)
  );
  const staleEntries = entries
    .filter((entry) => !detectorFindings.some((finding) => matchesAllowlistEntry(finding, entry)))
    .map((entry) =>
      structuralFinding(
        "Stale secret-history allowlist entry",
        "history",
        "git-history",
        `allowlist-entry:${entry.id}`,
        entry.line
      )
    );
  return [
    ...findings.filter(
      (finding) => !allowlistableDetectorNames.has(finding.detector) || !allowedIds.has(finding.id)
    ),
    ...staleEntries
  ];
}

export function scanGitHistory(repositoryRoot, options = {}) {
  const root = realpathSync(repositoryRoot);
  const historyLimit = options.maximumHistoryBlobBytes ?? maximumHistoryBlobBytes;
  const batchLimit = options.maximumBatchBytes ?? maximumGitBatchBytes;
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) {
    throw new Error("History scan limit must be a positive integer");
  }
  const objects = inspectGitObjects(root, listGitHistoryObjects(root));
  const findings = [];
  const blobs = [];
  for (const object of objects) {
    if (object.type !== "blob") continue;
    if (object.size > historyLimit) {
      findings.push(
        structuralFinding(
          "Historical blob exceeds the secret-scanner size limit",
          "history",
          "git-history",
          `object:${object.objectId}`
        )
      );
    } else {
      blobs.push(object);
    }
  }

  const historyRead = readGitBlobs(root, blobs, batchLimit);
  historyRead.contents.forEach((bytes, index) => {
    const blob = blobs[index];
    findings.push(
      ...scanBytes(bytes, {
        scope: "history",
        origin: "git-history",
        locator: `object:${blob.objectId}`
      })
    );
  });

  return {
    findings: applyHistoryAllowlist(findings, readHistoryAllowlistFromIndex(root)),
    scannedBlobs: blobs.length,
    gitBatchCount: historyRead.batchCount
  };
}
