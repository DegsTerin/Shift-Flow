// en-GB: Runs the redacted Git-candidate secret scan so local files and detected values never enter gate output.
/* global console, process */
import { scanGitCandidate } from "./security-scan-lib.mjs";

const { findings, scannedFiles } = scanGitCandidate(process.cwd());

if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "ok", scannedFiles }, null, 2));
