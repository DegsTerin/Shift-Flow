// en-GB: Validates unsigned Buildx and Trivy evidence without publishing images.
/* global console, process */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const buildType = "https://mobyproject.org/buildkit@v1";
const sourceRepositories = new Set([
  "https://github.com/DegsTerin/Shift-Flow",
  "https://github.com/DegsTerin/Shift-Flow.git"
]);
const severityOrder = new Map([
  ["UNKNOWN", Number.POSITIVE_INFINITY],
  ["LOW", 1],
  ["MEDIUM", 2],
  ["HIGH", 3],
  ["CRITICAL", 4]
]);

export class OciRuntimeEvidenceError extends Error {
  constructor(code, location) {
    super(code);
    this.code = code;
    this.location = location;
  }
}

function fail(code, location) {
  throw new OciRuntimeEvidenceError(code, location);
}

function readJson(path, location) {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 64 * 1024 * 1024) {
    fail("OCI_RUNTIME_EVIDENCE_FILE_INVALID", location);
  }
  const bytes = readFileSync(realpathSync(path));
  if (bytes.includes(0)) fail("OCI_RUNTIME_EVIDENCE_ENCODING_INVALID", location);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("OCI_RUNTIME_EVIDENCE_JSON_INVALID", location);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ociPurlDigest(value) {
  if (typeof value !== "string") return undefined;
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  return /^pkg:oci\/[^?#]+@(?<digest>sha256:[0-9a-f]{64})(?:[?#]|$)/u.exec(decoded)?.groups?.digest;
}

function validateSbom(sbom, subjectDigests) {
  if (
    sbom?.spdxVersion !== "SPDX-2.3" ||
    sbom?.dataLicense !== "CC0-1.0" ||
    sbom?.SPDXID !== "SPDXRef-DOCUMENT" ||
    typeof sbom?.documentNamespace !== "string" ||
    !Array.isArray(sbom?.packages) ||
    sbom.packages.length === 0 ||
    !Array.isArray(sbom?.relationships) ||
    !Array.isArray(sbom?.creationInfo?.creators) ||
    !sbom.creationInfo.creators.some(
      (creator) => typeof creator === "string" && /^Tool: trivy(?:-|$)/iu.test(creator)
    )
  ) {
    fail("OCI_RUNTIME_SBOM_INVALID", "sbom");
  }
  const describedIds = new Set(
    sbom.relationships
      .filter(
        (relationship) =>
          relationship?.spdxElementId === "SPDXRef-DOCUMENT" &&
          relationship?.relationshipType === "DESCRIBES" &&
          typeof relationship?.relatedSpdxElement === "string"
      )
      .map((relationship) => relationship.relatedSpdxElement)
  );
  const containers = sbom.packages.filter(
    (candidate) =>
      candidate?.primaryPackagePurpose === "CONTAINER" && describedIds.has(candidate?.SPDXID)
  );
  if (containers.length !== 1 || !Array.isArray(containers[0].externalRefs)) {
    fail("OCI_RUNTIME_SBOM_SUBJECT_INVALID", "sbom.packages");
  }
  const observedDigests = containers[0].externalRefs
    .filter(
      (reference) =>
        reference?.referenceCategory === "PACKAGE-MANAGER" && reference?.referenceType === "purl"
    )
    .map((reference) => ociPurlDigest(reference.referenceLocator))
    .filter(Boolean);
  if (!observedDigests.some((digest) => subjectDigests.has(digest))) {
    fail("OCI_RUNTIME_SBOM_SUBJECT_INVALID", "sbom.packages[container].externalRefs");
  }
}

function validateScan(scan, subjectRef, policy) {
  if (
    scan?.SchemaVersion !== 2 ||
    scan?.ArtifactType !== "container_image" ||
    scan?.ArtifactName !== subjectRef ||
    !digestPattern.test(scan?.ArtifactID ?? "") ||
    !digestPattern.test(scan?.Metadata?.ImageID ?? "") ||
    !Array.isArray(scan?.Metadata?.RepoDigests) ||
    `${scan?.Metadata?.ImageConfig?.os}/${scan?.Metadata?.ImageConfig?.architecture}` !==
      policy.platform ||
    !Array.isArray(scan?.Results)
  ) {
    fail("OCI_RUNTIME_SCAN_INVALID", "scan");
  }
  const threshold = severityOrder.get(policy.minimumBlockedSeverity);
  if (threshold === undefined || typeof policy.blockUnknownSeverity !== "boolean") {
    fail("OCI_RUNTIME_POLICY_INVALID", "targets.policy");
  }
  for (const [resultIndex, result] of scan.Results.entries()) {
    if (result.Vulnerabilities === undefined) continue;
    if (!Array.isArray(result.Vulnerabilities)) {
      fail("OCI_RUNTIME_SCAN_INVALID", `scan.Results[${resultIndex}].Vulnerabilities`);
    }
    for (const [findingIndex, finding] of result.Vulnerabilities.entries()) {
      const severity = String(finding?.Severity ?? "UNKNOWN").toUpperCase();
      const rank = severityOrder.get(severity);
      if (rank === undefined) {
        fail(
          "OCI_RUNTIME_SCAN_SEVERITY_INVALID",
          `scan.Results[${resultIndex}].Vulnerabilities[${findingIndex}].Severity`
        );
      }
      if (severity === "UNKNOWN" ? policy.blockUnknownSeverity : rank >= threshold) {
        fail(
          "OCI_RUNTIME_VULNERABILITY_BLOCKED",
          `scan.Results[${resultIndex}].Vulnerabilities[${findingIndex}]`
        );
      }
    }
  }
}

function repositoryName(reference) {
  const name = reference.split("@")[0];
  const colon = name.lastIndexOf(":");
  const repository = colon > name.lastIndexOf("/") ? name.slice(0, colon) : name;
  return repository.replace(/^(?:index[.])?docker[.]io\//u, "").replace(/^library\//u, "");
}

function validateScanDigest(scan, subjectRef, digest) {
  if (
    !scan.Metadata.RepoDigests.some((reference) => {
      if (typeof reference !== "string") return false;
      const parts = reference.split("@");
      return (
        parts.length === 2 &&
        parts[1] === digest &&
        repositoryName(parts[0]) === repositoryName(subjectRef)
      );
    })
  ) {
    fail("OCI_RUNTIME_SCAN_SUBJECT_INVALID", "scan.Metadata.RepoDigests");
  }
}

function validateBuildProvenance(provenance, scan, target, sourceCommit, platform) {
  const buildRecord = provenance?.["buildx.build.provenance"];
  const imageDigest = provenance?.["containerimage.digest"];
  const descriptor = provenance?.["containerimage.descriptor"];
  const invocation = buildRecord?.invocation;
  const vcs = buildRecord?.metadata?.[`${buildType}#metadata`]?.vcs;
  const normalisePath = (value) =>
    typeof value === "string" ? posix.normalize(value.replaceAll("\\", "/")) : undefined;
  // Buildx metadata contains the raw predicate, not a signed in-toto envelope.
  if (
    !isObject(buildRecord) ||
    buildRecord.buildType !== buildType ||
    !isObject(buildRecord.buildConfig) ||
    !Array.isArray(buildRecord.materials) ||
    buildRecord.materials.length === 0 ||
    buildRecord?.metadata?.completeness?.parameters !== true ||
    invocation?.parameters?.frontend !== "dockerfile.v0" ||
    invocation?.parameters?.args?.target !== target.target ||
    invocation?.configSource?.entryPoint !== posix.basename(target.dockerfile) ||
    invocation?.environment?.platform !== platform ||
    vcs?.revision !== sourceCommit ||
    !sourceRepositories.has(vcs?.source) ||
    normalisePath(vcs?.["localdir:context"]) !== target.context ||
    normalisePath(vcs?.["localdir:dockerfile"]) !== posix.dirname(target.dockerfile) ||
    !digestPattern.test(imageDigest ?? "") ||
    descriptor?.digest !== imageDigest ||
    descriptor?.mediaType !== "application/vnd.oci.image.index.v1+json" ||
    scan.Metadata.ImageID !== imageDigest
  ) {
    fail("OCI_RUNTIME_PROVENANCE_INVALID", "provenance");
  }
  validateScanDigest(scan, scan.ArtifactName, imageDigest);
  return new Set([imageDigest]);
}

export function validateRuntimeEvidence({
  targets,
  targetId,
  sourceKind,
  sourceCommit,
  subjectRef,
  sbom,
  scan,
  provenance
}) {
  if (
    !Array.isArray(targets?.targets) ||
    !isObject(targets?.policy) ||
    targets.policy.platform !== "linux/amd64"
  ) {
    fail("OCI_RUNTIME_TARGETS_INVALID", "targets");
  }
  const target = targets.targets.find((candidate) => candidate.id === targetId);
  if (!target || target.sourceKind !== sourceKind) {
    fail("OCI_RUNTIME_TARGET_INVALID", "arguments.target-id");
  }
  if (sourceKind === "build") {
    if (
      !commitPattern.test(sourceCommit ?? "") ||
      subjectRef !== `shiftflow-local/${targetId}:${sourceCommit}` ||
      !provenance
    ) {
      fail("OCI_RUNTIME_SUBJECT_INVALID", "arguments.subject-ref");
    }
  } else if (sourceKind === "registry") {
    if (
      subjectRef !== target.image ||
      sourceCommit !== undefined ||
      provenance !== undefined ||
      !digestPattern.test(subjectRef.slice(subjectRef.lastIndexOf("@") + 1))
    ) {
      fail("OCI_RUNTIME_SUBJECT_INVALID", "arguments.subject-ref");
    }
  } else {
    fail("OCI_RUNTIME_SOURCE_KIND_INVALID", "arguments.source-kind");
  }

  validateScan(scan, subjectRef, targets.policy);
  const subjectDigests =
    sourceKind === "build"
      ? validateBuildProvenance(provenance, scan, target, sourceCommit, targets.policy.platform)
      : new Set([subjectRef.slice(subjectRef.lastIndexOf("@") + 1)]);
  if (sourceKind === "registry") {
    validateScanDigest(scan, subjectRef, subjectRef.slice(subjectRef.lastIndexOf("@") + 1));
  }
  validateSbom(sbom, subjectDigests);
  return {
    result: "RUNTIME_EVIDENCE_VALID",
    targetId,
    sourceKind,
    subjectRef,
    packageCount: sbom.packages.length
  };
}

function parseArguments(argumentsList) {
  const allowed = new Set([
    "--targets",
    "--target-id",
    "--source-kind",
    "--source-commit",
    "--subject-ref",
    "--sbom",
    "--scan",
    "--provenance"
  ]);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(name) || !value || values.has(name)) {
      fail("OCI_RUNTIME_ARGUMENT_INVALID", "arguments");
    }
    values.set(name, value);
  }
  for (const required of [
    "--targets",
    "--target-id",
    "--source-kind",
    "--subject-ref",
    "--sbom",
    "--scan"
  ]) {
    if (!values.has(required)) fail("OCI_RUNTIME_ARGUMENT_REQUIRED", `arguments.${required}`);
  }
  const sourceKind = values.get("--source-kind");
  if (sourceKind === "build" && !values.has("--source-commit")) {
    fail("OCI_RUNTIME_ARGUMENT_REQUIRED", "arguments.--source-commit");
  }
  if (sourceKind !== "build" && values.has("--source-commit")) {
    fail("OCI_RUNTIME_ARGUMENT_INVALID", "arguments.--source-commit");
  }
  return values;
}

export function runCli(
  argumentsList,
  { cwd = process.cwd(), stdout = console.log, stderr = console.error } = {}
) {
  try {
    const values = parseArguments(argumentsList);
    const provenancePath = values.get("--provenance");
    const result = validateRuntimeEvidence({
      targets: readJson(resolve(cwd, values.get("--targets")), "targets"),
      targetId: values.get("--target-id"),
      sourceKind: values.get("--source-kind"),
      sourceCommit: values.get("--source-commit"),
      subjectRef: values.get("--subject-ref"),
      sbom: readJson(resolve(cwd, values.get("--sbom")), "sbom"),
      scan: readJson(resolve(cwd, values.get("--scan")), "scan"),
      ...(provenancePath
        ? { provenance: readJson(resolve(cwd, provenancePath), "provenance") }
        : {})
    });
    stdout(JSON.stringify(result));
    return 0;
  } catch (error) {
    const failure =
      error instanceof OciRuntimeEvidenceError
        ? { status: "failed", code: error.code, location: error.location }
        : { status: "failed", code: "OCI_RUNTIME_UNEXPECTED_FAILURE", location: "internal" };
    stderr(JSON.stringify(failure));
    return 1;
  }
}

const isDirectExecution =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isDirectExecution) process.exitCode = runCli(process.argv.slice(2));
