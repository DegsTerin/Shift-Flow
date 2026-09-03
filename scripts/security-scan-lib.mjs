// en-GB: Scans candidate and reachable Git history without exposing matched values in gate output.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const maximumHistoryBlobBytes = 16 * 1024 * 1024;
const maximumGitBatchBytes = 256 * 1024 * 1024;

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

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/u).length;
}

function isPlaceholderValue(value) {
  return /^(replace|example|test|valid|invalid|missing|shiftflow)/i.test(
    value.trim().replace(/^["']|["']$/gu, "")
  );
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

export function listGitCandidateFiles(repositoryRoot) {
  return execFileSync(
    "git",
    ["-C", repositoryRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
}

export function scanGitCandidate(repositoryRoot) {
  const root = realpathSync(repositoryRoot);
  const findings = [];
  let scannedFiles = 0;

  for (const file of listGitCandidateFiles(root)) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      continue;
    }
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) {
      findings.push({ name: "Symbolic link is outside the scanner trust boundary", file, line: 1 });
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }

    const realPath = realpathSync(path);
    const relativePath = relative(root, realPath);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      findings.push({ name: "Candidate path escapes the repository", file, line: 1 });
      continue;
    }

    const bytes = readFileSync(realPath);
    if (bytes.includes(0)) {
      continue;
    }
    scannedFiles += 1;
    findings.push(...scanContent(bytes.toString("utf8"), file.replaceAll("\\", "/")));
  }

  return { findings, scannedFiles };
}

function listGitHistoryObjects(repositoryRoot) {
  const output = execFileSync("git", ["-C", repositoryRoot, "rev-list", "--objects", "--all"], {
    encoding: "utf8",
    windowsHide: true
  });
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

function inspectGitObjects(repositoryRoot, objects) {
  const output = execFileSync("git", ["-C", repositoryRoot, "cat-file", "--batch-check"], {
    encoding: "utf8",
    input: `${objects.map(({ objectId }) => objectId).join("\n")}\n`,
    maxBuffer: maximumGitBatchBytes,
    windowsHide: true
  });
  const descriptions = output.trimEnd().split(/\r?\n/u);
  if (descriptions.length !== objects.length) {
    throw new Error("Git returned an incomplete history object inventory");
  }
  return descriptions.map((description, index) => {
    const [objectId, type, sizeText] = description.split(" ");
    if (objectId !== objects[index].objectId || !/^[0-9]+$/u.test(sizeText ?? "")) {
      throw new Error("Git returned an invalid history object description");
    }
    return { ...objects[index], type, size: Number(sizeText) };
  });
}

function readGitBlobBatch(repositoryRoot, blobs) {
  if (!blobs.length) return [];
  const output = execFileSync("git", ["-C", repositoryRoot, "cat-file", "--batch"], {
    input: `${blobs.map(({ objectId }) => objectId).join("\n")}\n`,
    maxBuffer: maximumGitBatchBytes,
    windowsHide: true
  });
  const contents = [];
  let offset = 0;
  for (const blob of blobs) {
    const headerEnd = output.indexOf(10, offset);
    if (headerEnd === -1) throw new Error("Git returned an incomplete history blob header");
    const header = output.subarray(offset, headerEnd).toString("utf8");
    if (header !== `${blob.objectId} blob ${blob.size}`) {
      throw new Error("Git returned an invalid history blob header");
    }
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + blob.size;
    if (contentEnd >= output.length || output[contentEnd] !== 10) {
      throw new Error("Git returned an incomplete history blob");
    }
    contents.push(output.subarray(contentStart, contentEnd));
    offset = contentEnd + 1;
  }
  if (offset !== output.length) throw new Error("Git returned unexpected trailing history data");
  return contents;
}

export function scanGitHistory(repositoryRoot) {
  const root = realpathSync(repositoryRoot);
  const objects = inspectGitObjects(root, listGitHistoryObjects(root));
  const findings = [];
  const blobs = [];
  for (const object of objects) {
    if (object.type !== "blob" || !object.file) continue;
    if (object.size > maximumHistoryBlobBytes) {
      findings.push({
        name: "Historical blob exceeds the secret-scanner size limit",
        file: object.file,
        line: 1,
        object: object.objectId,
        source: "git-history"
      });
      continue;
    }
    blobs.push(object);
  }

  let scannedBlobs = 0;
  const contents = readGitBlobBatch(root, blobs);
  for (const [index, bytes] of contents.entries()) {
    if (bytes.includes(0)) continue;
    const blob = blobs[index];
    scannedBlobs += 1;
    findings.push(
      ...scanContent(bytes.toString("utf8"), blob.file).map((finding) => ({
        ...finding,
        object: blob.objectId,
        source: "git-history"
      }))
    );
  }

  const allowlistPath = resolve(root, "eng/secret-history-allowlist.json");
  if (!existsSync(allowlistPath)) return { findings, scannedBlobs };
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  if (
    allowlist?.schemaVersion !== "shiftflow.secret-history-allowlist/v1" ||
    !Array.isArray(allowlist.findings)
  ) {
    throw new Error("The secret-history allowlist has an invalid schema");
  }
  const key = (finding) =>
    [finding.name, finding.file, finding.line, finding.object, finding.source].join("\u0000");
  const allowedKeys = new Set(
    allowlist.findings.map((finding) => {
      const fields = Object.keys(finding).sort().join(",");
      if (fields !== "file,line,name,object,reason,source" || typeof finding.reason !== "string") {
        throw new Error("The secret-history allowlist contains an invalid entry");
      }
      return key(finding);
    })
  );
  const observedKeys = new Set(findings.map(key));
  const staleEntries = allowlist.findings
    .filter((finding) => !observedKeys.has(key(finding)))
    .map((finding) => ({
      name: "Stale secret-history allowlist entry",
      file: finding.file,
      line: finding.line,
      object: finding.object,
      source: "git-history"
    }));
  return {
    findings: [...findings.filter((finding) => !allowedKeys.has(key(finding))), ...staleEntries],
    scannedBlobs
  };
}
