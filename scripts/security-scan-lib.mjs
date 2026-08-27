// en-GB: Scans Git candidate text without exposing matched values so secret detection remains safe to report.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const userCredentialEnvPattern =
  /^(?:E2E_EMAIL|E2E_PASSWORD|NEXT_PUBLIC_DEMO_EMAIL|NEXT_PUBLIC_DEMO_PASSWORD|DEMO_EMAIL|DEMO_PASSWORD|USER_PASSWORD|ADMIN_PASSWORD)=/i;

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

export function scanContent(content, file) {
  const findings = [];

  content.split(/\r?\n/u).forEach((line, index) => {
    if (userCredentialEnvPattern.test(line.trim())) {
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
    if (
      /^(replace|example|test|valid|invalid|missing|shiftflow)/i.test(value) ||
      /^(?:process|import[.]meta|Deno|Bun)[.]env\b/i.test(value)
    ) {
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
