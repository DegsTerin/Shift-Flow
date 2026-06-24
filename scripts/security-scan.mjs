/* global console, process */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "generated",
  "node_modules"
]);

const ignoredFiles = new Set([".env", "package-lock.json"]);
const credentialEnvFiles = [".env", ".env.example"];
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
  /\b(?:api[_-]?key|authorization|credential|jwt[_-]?secret|password|private[_-]?key|secret|token)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{32,})["']?/gi;

function walk(directory) {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    const relativePath = relative(process.cwd(), path).replaceAll("\\", "/");
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return ignoredDirectories.has(entry) ? [] : walk(path);
    }

    if (!stats.isFile() || ignoredFiles.has(entry)) {
      return [];
    }

    return [relativePath];
  });
}

const findings = [];

for (const file of credentialEnvFiles) {
  try {
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (userCredentialEnvPattern.test(line.trim())) {
        findings.push({
          name: "User credential in environment file",
          file,
          line: index + 1,
          value: line.split("=")[0]
        });
      }
    });
  } catch {
    // Optional local environment files may be absent.
  }
}

for (const file of walk(process.cwd())) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  for (const { name, pattern } of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ name, file, line, value: lines[line - 1].trim() });
    }
  }

  assignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(assignmentPattern)) {
    const value = match[1];
    if (/^(replace|example|test|valid|invalid|missing|shiftflow)/i.test(value)) {
      continue;
    }
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    findings.push({
      name: "Generic sensitive assignment",
      file,
      line,
      value: lines[line - 1].trim()
    });
  }
}

if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "ok", scannedFiles: walk(process.cwd()).length }, null, 2));
