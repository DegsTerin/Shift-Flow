// en-GB: Scans exact Git candidates and reachable history without exposing matched values.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import {
  closeSync,
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
const historyAllowlistSchema = "shiftflow.secret-history-allowlist/v1";

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

function scanBytes(bytes, file) {
  return scanContent(bytes.toString("latin1"), file);
}

export function scanContent(content, file) {
  const findings = [];

  content.split(/\r?\n/u).forEach((line, index) => {
    const credential = line.trim().match(userCredentialEnvPattern);
    if (credential && !isPlaceholderValue(credential.groups?.value ?? "")) {
      findings.push({ name: "User credential in environment file", file, line: index + 1 });
    }
  });

  for (const { name, pattern } of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      findings.push({ name, file, line: lineNumberAt(content, match.index) });
    }
  }

  assignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(assignmentPattern)) {
    const value = match.groups?.quoted ?? match.groups?.bare ?? "";
    if (isPlaceholderValue(value) || /^(?:process|import[.]meta|Deno|Bun)[.]env\b/i.test(value)) {
      continue;
    }
    findings.push({
      name: "Generic sensitive assignment",
      file,
      line: lineNumberAt(content, match.index)
    });
  }

  return findings;
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
        file: match.groups.file.replaceAll("\\", "/")
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
  return Array.from(new Set(`${modified}${untracked}`.split("\0").filter(Boolean))).map((file) =>
    file.replaceAll("\\", "/")
  );
}

export function listGitCandidateFiles(repositoryRoot) {
  const indexed = listGitIndexEntries(repositoryRoot)
    .filter(({ stage }) => stage === 0)
    .map(({ file }) => file);
  return Array.from(new Set([...indexed, ...listWorktreeCandidateFiles(repositoryRoot)]));
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

export function partitionGitBlobBatches(blobs, maximumBatchBytes = maximumGitBatchBytes) {
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

function boundedWorktreeFile(repositoryRoot, file, maximumBytes) {
  const path = resolve(repositoryRoot, file);
  if (!existsSync(path)) return { status: "missing" };
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) return { status: "symbolic-link" };
  if (!stats.isFile()) return { status: "not-file" };

  const realPath = realpathSync(path);
  const relativePath = relative(repositoryRoot, realPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return { status: "outside" };
  }

  const handle = openSync(realPath, "r");
  try {
    const openedStats = fstatSync(handle);
    if (openedStats.size > maximumBytes) return { status: "oversized" };
    const bytes = Buffer.alloc(openedStats.size);
    let offset = 0;
    while (offset < bytes.length) {
      const bytesRead = readSync(handle, bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== bytes.length) return { status: "changed" };
    return { status: "ok", bytes };
  } finally {
    closeSync(handle);
  }
}

function structuralFinding(name, file, source, object) {
  return { name, file, line: 1, ...(object ? { object } : {}), source };
}

export function scanGitCandidate(repositoryRoot, options = {}) {
  const root = realpathSync(repositoryRoot);
  const candidateLimit = options.maximumCandidateFileBytes ?? maximumCandidateFileBytes;
  const batchLimit = options.maximumBatchBytes ?? maximumGitBatchBytes;
  const findings = [];
  let scannedIndexBlobs = 0;
  let scannedWorktreeFiles = 0;

  const indexEntries = listGitIndexEntries(root);
  for (const entry of indexEntries.filter(({ stage }) => stage !== 0)) {
    findings.push(
      structuralFinding("Unmerged index entry cannot be scanned", entry.file, "git-index")
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
          object.file,
          "git-index"
        )
      );
    } else if (object.type !== "blob") {
      findings.push(
        structuralFinding("Non-blob index entry cannot be scanned", object.file, "git-index")
      );
    } else if (object.size > candidateLimit) {
      findings.push(
        structuralFinding(
          "Index blob exceeds the secret-scanner size limit",
          object.file,
          "git-index",
          object.objectId
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
      ...scanBytes(bytes, blob.file).map((finding) => ({
        ...finding,
        object: blob.objectId,
        source: "git-index"
      }))
    );
  });

  for (const file of listWorktreeCandidateFiles(root)) {
    const result = boundedWorktreeFile(root, file, candidateLimit);
    if (result.status === "missing" || result.status === "not-file") continue;
    if (result.status !== "ok") {
      const names = {
        changed: "Worktree file changed while it was being scanned",
        outside: "Candidate path escapes the repository",
        oversized: "Worktree file exceeds the secret-scanner size limit",
        "symbolic-link": "Symbolic link is outside the scanner trust boundary"
      };
      findings.push(structuralFinding(names[result.status], file, "worktree"));
      continue;
    }
    scannedWorktreeFiles += 1;
    findings.push(
      ...scanBytes(result.bytes, file).map((finding) => ({ ...finding, source: "worktree" }))
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
  const output = runGit(repositoryRoot, ["rev-list", "--objects", "--all"], { encoding: "utf8" });
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      return separator === -1
        ? { objectId: line, file: undefined }
        : { objectId: line.slice(0, separator), file: line.slice(separator + 1) };
    });
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

function historyFindingKey(finding) {
  return [finding.name, finding.file, finding.line, finding.object, finding.source].join("\u0000");
}

function validateHistoryAllowlist(allowlist) {
  if (allowlist?.schemaVersion !== historyAllowlistSchema || !Array.isArray(allowlist.findings)) {
    throw new Error("The secret-history allowlist has an invalid schema");
  }
  return allowlist.findings.map((finding) => {
    const fields = Object.keys(finding).sort().join(",");
    if (
      fields !== "file,line,name,object,reason,source" ||
      !allowlistableDetectorNames.has(finding.name) ||
      typeof finding.file !== "string" ||
      !finding.file ||
      !Number.isSafeInteger(finding.line) ||
      finding.line < 1 ||
      typeof finding.object !== "string" ||
      !/^[0-9a-f]{40,64}$/u.test(finding.object) ||
      finding.source !== "git-history" ||
      typeof finding.reason !== "string" ||
      !finding.reason.trim() ||
      finding.reason.length > 500
    ) {
      throw new Error("The secret-history allowlist contains an invalid detector entry");
    }
    return finding;
  });
}

function applyHistoryAllowlist(findings, allowlist) {
  if (!allowlist) return findings;
  const entries = validateHistoryAllowlist(allowlist);
  const allowedKeys = new Set(entries.map(historyFindingKey));
  const observedDetectorKeys = new Set(
    findings
      .filter((finding) => allowlistableDetectorNames.has(finding.name))
      .map(historyFindingKey)
  );
  const staleEntries = entries
    .filter((finding) => !observedDetectorKeys.has(historyFindingKey(finding)))
    .map((finding) =>
      structuralFinding(
        "Stale secret-history allowlist entry",
        finding.file,
        "git-history",
        finding.object
      )
    );
  return [
    ...findings.filter(
      (finding) =>
        !allowlistableDetectorNames.has(finding.name) ||
        !allowedKeys.has(historyFindingKey(finding))
    ),
    ...staleEntries
  ];
}

export function scanGitHistory(repositoryRoot, options = {}) {
  const root = realpathSync(repositoryRoot);
  const historyLimit = options.maximumHistoryBlobBytes ?? maximumHistoryBlobBytes;
  const batchLimit = options.maximumBatchBytes ?? maximumGitBatchBytes;
  const objects = inspectGitObjects(root, listGitHistoryObjects(root));
  const findings = [];
  const blobs = [];
  for (const object of objects) {
    if (object.type !== "blob" || !object.file) continue;
    if (object.size > historyLimit) {
      findings.push(
        structuralFinding(
          "Historical blob exceeds the secret-scanner size limit",
          object.file,
          "git-history",
          object.objectId
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
      ...scanBytes(bytes, blob.file).map((finding) => ({
        ...finding,
        object: blob.objectId,
        source: "git-history"
      }))
    );
  });

  return {
    findings: applyHistoryAllowlist(findings, readHistoryAllowlistFromIndex(root)),
    scannedBlobs: blobs.length,
    gitBatchCount: historyRead.batchCount
  };
}
