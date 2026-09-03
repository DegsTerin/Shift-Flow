// en-GB: Runs the redacted Git-candidate secret scan so local files and detected values never enter gate output.
/* global console, process */
import { scanGitCandidate, scanGitHistory } from "./security-scan-lib.mjs";

const candidate = scanGitCandidate(process.cwd());
const history = scanGitHistory(process.cwd());
const findings = [...candidate.findings, ...history.findings];

if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      scannedFiles: candidate.scannedFiles,
      scannedHistoryBlobs: history.scannedBlobs
    },
    null,
    2
  )
);
