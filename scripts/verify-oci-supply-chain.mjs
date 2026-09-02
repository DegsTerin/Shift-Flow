// en-GB: Validates caller-supplied OCI policy artefacts without invoking build, container or scanner tools.
/* global Buffer, console, process */

import Ajv from "ajv";
import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";

const targetSchemaVersion = "shiftflow.oci-targets/v1";
const exceptionSchemaVersion = "shiftflow.oci-cve-exceptions/v1";
const evidenceSchemaVersion = "shiftflow.oci-evidence/v1";
const scanSchemaVersion = "shiftflow.oci-scan/v1";
const precursorClassification = "LOCAL_UNSIGNED_PRECURSOR";
// en-GB: The v1 profile closes the local graph and named OCI invariants, not all SPDX semantics.
const spdxOciPackageProfile = "shiftflow.spdx-2.3-oci-package-profile/v1";
const inTotoStatementType = "https://in-toto.io/Statement/v1";
const spdxSchemaPath = "eng/spdx-2.3-schema.json";
const spdxSchemaSha256 = "sha256:3ec6cd5b8ba0c9a3e821da48536fa1b814567dc7e4376efe98d3e7b2a7a8d230";
const spdxSchemaSource =
  "https://raw.githubusercontent.com/spdx/spdx-spec/v2.3/schemas/spdx-schema.json";
const spdxSchemaSourceSha256 =
  "sha256:239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b";
const maximumJsonBytes = 5 * 1024 * 1024;
const maximumJsonDepth = 64;
const maximumJsonTokens = 250_000;
const maximumSbomJsonBytes = 64 * 1024 * 1024;
const maximumSbomJsonTokens = 2_000_000;
const maximumScanJsonBytes = 32 * 1024 * 1024;
const maximumScanJsonTokens = 2_000_000;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitObjectPattern = /^[a-f0-9]{40}$/u;
const cvePattern = /^CVE-[0-9]{4}-[0-9]{4,}$/u;
const safeIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const spdxElementIdPattern = /^SPDXRef-[A-Za-z0-9.-]+$/u;
const spdxExternalElementIdPattern = /^DocumentRef-[A-Za-z0-9.+-]+:SPDXRef-[A-Za-z0-9.-]+$/u;
const spdxSpecialReferences = new Set(["NONE", "NOASSERTION"]);
const exactTargetIds = [
  "api-dotnet",
  "legacy-api",
  "migration",
  "nginx",
  "postgres",
  "redis",
  "web"
];
const blockedSeverities = new Set(["MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);
const expectedRegistryImages = new Map([
  [
    "nginx",
    "nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8"
  ],
  [
    "postgres",
    "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685"
  ],
  [
    "redis",
    "redis:8.2.1-alpine@sha256:987c376c727652f99625c7d205a1cba3cb2c53b92b0b62aade2bd48ee1593232"
  ]
]);
const expectedBuildTargets = new Map([
  [
    "api-dotnet",
    { composeService: "api-dotnet", dockerfile: "apps/api-dotnet/Dockerfile", target: "runtime" }
  ],
  [
    "legacy-api",
    {
      composeService: "legacy-api",
      dockerfile: "infra/docker/node.Dockerfile",
      target: "legacy-api"
    }
  ],
  [
    "migration",
    { composeService: "migrate", dockerfile: "infra/docker/node.Dockerfile", target: "migration" }
  ],
  ["web", { composeService: "web", dockerfile: "infra/docker/node.Dockerfile", target: "web" }]
]);
const policyStateSnapshots = new WeakMap();

export class OciSupplyChainPolicyError extends Error {
  constructor(code, location) {
    super(code);
    this.name = "OciSupplyChainPolicyError";
    this.code = code;
    this.location = location;
  }
}

function fail(code, location) {
  throw new OciSupplyChainPolicyError(code, location);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value, location) {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("OCI_OBJECT_REQUIRED", location);
  }
}

function assertExactKeys(value, requiredKeys, location) {
  assertRecord(value, location);
  const actual = Object.keys(value).sort();
  const expected = [...requiredKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("OCI_PROPERTIES_INVALID", location);
  }
}

function assertString(value, location, { pattern, minimum = 1, maximum = 2048 } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value.normalize("NFC") !== value ||
    (pattern && !pattern.test(value))
  ) {
    fail("OCI_STRING_INVALID", location);
  }
}

function assertInteger(value, location, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail("OCI_INTEGER_INVALID", location);
  }
}

function assertDigest(value, location) {
  assertString(value, location, { pattern: digestPattern, maximum: 71 });
}

function assertIsoInstant(value, location) {
  assertString(value, location, { maximum: 32 });
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    fail("OCI_TIMESTAMP_INVALID", location);
  }
  return instant;
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSortedUnique(values, selector, location) {
  const keys = values.map(selector);
  const expected = [...keys].sort(compareOrdinal);
  if (keys.some((key, index) => key !== expected[index]) || new Set(keys).size !== keys.length) {
    fail("OCI_ARRAY_ORDER_INVALID", location);
  }
}

function assertNoWildcards(value, location) {
  if (/[*?]/u.test(value)) {
    fail("OCI_WILDCARD_FORBIDDEN", location);
  }
}

function hasForbiddenPortablePathCharacter(value) {
  const forbiddenCharacters = '<>:"|?*';
  return [...value].some(
    (character) => character.codePointAt(0) <= 0x1f || forbiddenCharacters.includes(character)
  );
}

function decodePurlComponent(value, location, { allowSeparators = false } = {}) {
  if (value.length === 0 || /\s/u.test(value)) fail("OCI_PACKAGE_PURL_INVALID", location);
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "%") continue;
    const escape = value.slice(index, index + 3);
    if (!/^%[0-9A-F]{2}$/u.test(escape)) fail("OCI_PACKAGE_PURL_INVALID", location);
    index += 2;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    fail("OCI_PACKAGE_PURL_INVALID", location);
  }
  if (
    decoded.length === 0 ||
    decoded.normalize("NFC") !== decoded ||
    /\s/u.test(decoded) ||
    [...decoded].some(
      (character) =>
        character.codePointAt(0) <= 0x1f ||
        character.codePointAt(0) === 0x7f ||
        character === "*" ||
        character === "?"
    ) ||
    (!allowSeparators && (decoded.includes("/") || decoded.includes("\\")))
  ) {
    fail("OCI_PACKAGE_PURL_INVALID", location);
  }
  return decoded;
}

function assertPackagePurl(value, location) {
  assertString(value, location, { maximum: 512 });
  const fragmentParts = value.split("#");
  if (fragmentParts.length > 2) fail("OCI_PACKAGE_PURL_INVALID", location);
  const queryParts = fragmentParts[0].split("?");
  if (queryParts.length > 2) fail("OCI_PACKAGE_PURL_INVALID", location);
  const identity = queryParts[0];
  const firstSlash = identity.indexOf("/");
  const versionDelimiter = identity.indexOf("@", firstSlash + 1);
  const packagePathEnd = versionDelimiter === -1 ? identity.length : versionDelimiter;
  if (
    !identity.startsWith("pkg:") ||
    firstSlash <= "pkg:".length ||
    packagePathEnd <= firstSlash + 1 ||
    (versionDelimiter !== -1 &&
      (versionDelimiter === identity.length - 1 ||
        identity.indexOf("@", versionDelimiter + 1) !== -1))
  ) {
    fail("OCI_PACKAGE_PURL_INVALID", location);
  }
  const packageType = identity.slice("pkg:".length, firstSlash);
  if (!/^[a-z][a-z0-9.+-]*$/u.test(packageType)) {
    fail("OCI_PACKAGE_PURL_INVALID", location);
  }
  const packageSegments = identity.slice(firstSlash + 1, packagePathEnd).split("/");
  if (packageSegments.some((segment) => segment.length === 0)) {
    fail("OCI_PACKAGE_PURL_INVALID", location);
  }
  for (const segment of packageSegments) decodePurlComponent(segment, location);
  if (versionDelimiter !== -1) {
    decodePurlComponent(identity.slice(versionDelimiter + 1), location, {
      allowSeparators: true
    });
  }

  if (queryParts.length === 2) {
    if (queryParts[1].length === 0) fail("OCI_PACKAGE_PURL_INVALID", location);
    const qualifierKeys = [];
    for (const qualifier of queryParts[1].split("&")) {
      const equals = qualifier.indexOf("=");
      if (
        equals <= 0 ||
        equals === qualifier.length - 1 ||
        qualifier.indexOf("=", equals + 1) >= 0
      ) {
        fail("OCI_PACKAGE_PURL_INVALID", location);
      }
      const key = qualifier.slice(0, equals);
      if (!/^[a-z][a-z0-9._-]*$/u.test(key)) fail("OCI_PACKAGE_PURL_INVALID", location);
      decodePurlComponent(qualifier.slice(equals + 1), location, { allowSeparators: true });
      qualifierKeys.push(key);
    }
    const orderedKeys = [...qualifierKeys].sort(compareOrdinal);
    if (
      qualifierKeys.some((key, index) => key !== orderedKeys[index]) ||
      new Set(qualifierKeys).size !== qualifierKeys.length
    ) {
      fail("OCI_PACKAGE_PURL_INVALID", location);
    }
  }

  if (fragmentParts.length === 2) {
    const subpathSegments = fragmentParts[1].split("/");
    if (
      subpathSegments.some((segment) => {
        const decoded = decodePurlComponent(segment, location);
        return decoded === "." || decoded === "..";
      })
    ) {
      fail("OCI_PACKAGE_PURL_INVALID", location);
    }
  }
}

function assertSpdxElementId(value, location) {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    value.normalize("NFC") !== value ||
    !spdxElementIdPattern.test(value)
  ) {
    fail("OCI_SBOM_ELEMENT_ID_INVALID", location);
  }
  return value;
}

function registerSpdxElementId(value, location, elementIds) {
  const elementId = assertSpdxElementId(value, location);
  if (elementIds.has(elementId)) fail("OCI_SBOM_DUPLICATE_ID", location);
  elementIds.add(elementId);
  return elementId;
}

function assertLocalSpdxReference(value, location, expectedIds) {
  const elementId = assertSpdxElementId(value, location);
  if (!expectedIds.has(elementId)) fail("OCI_SBOM_REFERENCE_INVALID", location);
  return elementId;
}

function assertResolvableSpdxReference(value, location, { elementIds, allowSpecial = false }) {
  assertString(value, location, { maximum: 512 });
  if (spdxElementIdPattern.test(value)) {
    if (!elementIds.has(value)) fail("OCI_SBOM_REFERENCE_INVALID", location);
    return;
  }
  if (spdxExternalElementIdPattern.test(value)) {
    fail("OCI_SBOM_EXTERNAL_REFERENCE_UNSUPPORTED", location);
  }
  if (allowSpecial && spdxSpecialReferences.has(value)) return;
  fail("OCI_SBOM_REFERENCE_INVALID", location);
}

function ajvFailureLocation(baseLocation, validator) {
  const candidates = (Array.isArray(validator.errors) ? validator.errors : [])
    .map((error) => {
      const dataPath =
        typeof error?.dataPath === "string" &&
        error.dataPath.length <= 512 &&
        /^(?:\/(?:[A-Za-z0-9._-]|~[01])*)*$/u.test(error.dataPath)
          ? error.dataPath
          : "";
      const missingProperty =
        error?.keyword === "required" &&
        typeof error.params?.missingProperty === "string" &&
        /^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(error.params.missingProperty)
          ? `/${error.params.missingProperty}`
          : "";
      const keyword =
        typeof error?.keyword === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(error.keyword)
          ? error.keyword
          : undefined;
      return keyword ? `${dataPath}${missingProperty}#${keyword}` : undefined;
    })
    .filter((candidate) => candidate !== undefined)
    .sort(compareOrdinal);
  return `${baseLocation}${candidates[0] ?? "#schema"}`;
}

function assertSafeRelativePath(value, location) {
  assertString(value, location, { maximum: 512 });
  const segments = value.split("/");
  if (
    isAbsolute(value) ||
    value.includes("\\") ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        hasForbiddenPortablePathCharacter(segment) ||
        /[. ]$/u.test(segment) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[.].*)?$/iu.test(segment)
    )
  ) {
    fail("OCI_PATH_INVALID", location);
  }
}

function hasLoneUtf16Surrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function walkCanonicalValues(value, location, depth = 0) {
  if (depth > maximumJsonDepth) fail("OCI_JSON_DEPTH_INVALID", location);
  if (typeof value === "string") {
    if (value.normalize("NFC") !== value) {
      fail("OCI_STRING_NOT_NFC", location);
    }
    if (hasLoneUtf16Surrogate(value)) fail("OCI_STRING_SURROGATE_INVALID", location);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail("OCI_NUMBER_UNSAFE", location);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkCanonicalValues(entry, `${location}[${index}]`, depth + 1));
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      walkCanonicalValues(key, `${location}.<key>`, depth + 1);
      walkCanonicalValues(entry, `${location}.${key}`, depth + 1);
    }
  }
}

function assertNoDuplicateJsonKeys(text, location, tokenLimit) {
  let index = 0;
  let tokenCount = 0;
  const primitivePattern =
    /(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/uy;
  const consumeToken = () => {
    tokenCount += 1;
    if (tokenCount > tokenLimit) fail("OCI_JSON_TOKEN_LIMIT", location);
  };
  const skipWhitespace = () => {
    while (/\s/u.test(text[index] ?? "")) index += 1;
  };
  const parseString = () => {
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += text[index + 1] === "u" ? 6 : 2;
      } else if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      } else {
        index += 1;
      }
    }
    fail("OCI_JSON_INVALID", location);
  };
  const parseValue = (depth = 0) => {
    if (depth > maximumJsonDepth) fail("OCI_JSON_DEPTH_INVALID", location);
    consumeToken();
    skipWhitespace();
    if (text[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        if (text[index] !== '"') fail("OCI_JSON_INVALID", location);
        const key = parseString();
        consumeToken();
        if (keys.has(key)) fail("OCI_JSON_DUPLICATE_KEY", location);
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") fail("OCI_JSON_INVALID", location);
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail("OCI_JSON_INVALID", location);
        index += 1;
      }
      fail("OCI_JSON_INVALID", location);
    }
    if (text[index] === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail("OCI_JSON_INVALID", location);
        index += 1;
      }
      fail("OCI_JSON_INVALID", location);
    }
    if (text[index] === '"') {
      parseString();
      return;
    }
    primitivePattern.lastIndex = index;
    const match = primitivePattern.exec(text);
    if (!match) fail("OCI_JSON_INVALID", location);
    index += match[0].length;
  };

  parseValue();
  skipWhitespace();
  if (index !== text.length) fail("OCI_JSON_INVALID", location);
}

export function parseStrictJson(
  bytesOrText,
  location = "json",
  { byteLimit = maximumJsonBytes, tokenLimit = maximumJsonTokens } = {}
) {
  const bytes = Buffer.isBuffer(bytesOrText)
    ? bytesOrText
    : Buffer.from(String(bytesOrText), "utf8");
  if (bytes.length > byteLimit) fail("OCI_JSON_TOO_LARGE", location);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("OCI_JSON_BOM_FORBIDDEN", location);
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("OCI_JSON_UTF8_INVALID", location);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("OCI_JSON_INVALID", location);
  }
  assertNoDuplicateJsonKeys(text, location, tokenLimit);
  walkCanonicalValues(value, location);
  return value;
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  assertRecord(value, "canonical-json");
  return `{${Object.keys(value)
    .sort(compareOrdinal)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function composeServiceBlock(composeText, serviceName) {
  const servicesBlocks = [
    ...composeText.matchAll(/^services:[ \t]*\r?\n(?<body>[\s\S]*?)(?=^\S|(?![\s\S]))/gmu)
  ];
  if (servicesBlocks.length !== 1) fail("OCI_COMPOSE_SERVICES_INVALID", "targets");
  const servicesText = servicesBlocks[0].groups.body;
  const escapedServiceName = escapeRegularExpression(serviceName);
  const match = new RegExp(
    `^  ${escapedServiceName}:\\r?\\n(?<body>.*?)(?=^  \\S|(?![\\s\\S]))`,
    "msu"
  ).exec(servicesText);
  if (!match) fail("OCI_COMPOSE_SERVICE_MISSING", `targets.${serviceName}`);
  return match[0];
}

function composeMappingBlock(text, indentation, propertyName, location) {
  const escapedPropertyName = escapeRegularExpression(propertyName);
  const blocks = [
    ...text.matchAll(
      new RegExp(
        `^ {${indentation}}${escapedPropertyName}:[ \\t]*\\r?\\n(?<body>[\\s\\S]*?)(?=^ {${indentation}}\\S|(?![\\s\\S]))`,
        "gmu"
      )
    )
  ];
  if (blocks.length !== 1) fail("OCI_COMPOSE_BUILD_MISMATCH", location);
  return blocks[0][0];
}

function assertOneExactLine(text, line, location) {
  const matches = text.match(new RegExp(`^${escapeRegularExpression(line)}\\s*$`, "gmu")) ?? [];
  if (matches.length !== 1) fail("OCI_COMPOSE_REFERENCE_MISMATCH", location);
}

export function validatePolicyDocuments({
  targetsDocument,
  exceptionsDocument,
  composeText,
  nodeDockerfileText,
  dotnetDockerfileText,
  spdxSchemaBytes,
  asOf = new Date()
}) {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    fail("OCI_AS_OF_INVALID", "asOf");
  }
  assertExactKeys(
    targetsDocument,
    ["schemaVersion", "classification", "policy", "targets"],
    "targets"
  );
  if (targetsDocument.schemaVersion !== targetSchemaVersion) {
    fail("OCI_TARGET_SCHEMA_INVALID", "targets.schemaVersion");
  }
  if (targetsDocument.classification !== precursorClassification) {
    fail("OCI_CLASSIFICATION_INVALID", "targets.classification");
  }
  const policy = targetsDocument.policy;
  assertExactKeys(
    policy,
    [
      "platform",
      "minimumBlockedSeverity",
      "blockUnknownSeverity",
      "maximumEvidenceAgeHours",
      "maximumScannerDatabaseAgeHours",
      "maximumExceptionLifetimeDays",
      "sbomFormat",
      "sbomProfile",
      "sbomSchema",
      "scanFormat",
      "attestationPredicateType"
    ],
    "targets.policy"
  );
  if (
    policy.platform !== "linux/amd64" ||
    policy.minimumBlockedSeverity !== "MEDIUM" ||
    policy.blockUnknownSeverity !== true ||
    policy.sbomFormat !== "spdx-2.3-json" ||
    policy.sbomProfile !== spdxOciPackageProfile ||
    policy.scanFormat !== scanSchemaVersion ||
    policy.attestationPredicateType !== "urn:shiftflow:attestation:oci-supply-chain:v1"
  ) {
    fail("OCI_POLICY_VALUE_INVALID", "targets.policy");
  }
  assertExactKeys(
    policy.sbomSchema,
    ["path", "sha256", "source", "sourceSha256", "normalisation"],
    "targets.policy.sbomSchema"
  );
  if (
    policy.sbomSchema.path !== spdxSchemaPath ||
    policy.sbomSchema.sha256 !== spdxSchemaSha256 ||
    policy.sbomSchema.source !== spdxSchemaSource ||
    policy.sbomSchema.sourceSha256 !== spdxSchemaSourceSha256 ||
    policy.sbomSchema.normalisation !== "terminal-lf-appended"
  ) {
    fail("OCI_SBOM_SCHEMA_DESCRIPTOR_INVALID", "targets.policy.sbomSchema");
  }
  if (!Buffer.isBuffer(spdxSchemaBytes) || sha256(spdxSchemaBytes) !== spdxSchemaSha256) {
    fail("OCI_SBOM_SCHEMA_HASH_MISMATCH", "spdx-schema");
  }
  const spdxSchemaDocument = parseStrictJson(spdxSchemaBytes, "spdx-schema");
  if (
    spdxSchemaDocument.$schema !== "http://json-schema.org/draft-07/schema#" ||
    spdxSchemaDocument.$id !== "http://spdx.org/rdf/terms/2.3" ||
    spdxSchemaDocument.title !== "SPDX 2.3"
  ) {
    fail("OCI_SBOM_SCHEMA_IDENTITY_INVALID", "spdx-schema");
  }
  let validateSpdxDocument;
  try {
    validateSpdxDocument = new Ajv({
      allErrors: false,
      coerceTypes: false,
      jsonPointers: true,
      logger: false,
      ownProperties: true,
      removeAdditional: false,
      schemaId: "auto",
      strictDefaults: true,
      strictKeywords: true,
      strictNumbers: true,
      useDefaults: false,
      validateSchema: true
    }).compile(spdxSchemaDocument);
  } catch {
    fail("OCI_SBOM_SCHEMA_INVALID", "spdx-schema");
  }
  assertInteger(policy.maximumEvidenceAgeHours, "targets.policy.maximumEvidenceAgeHours", 1, 168);
  assertInteger(
    policy.maximumScannerDatabaseAgeHours,
    "targets.policy.maximumScannerDatabaseAgeHours",
    1,
    168
  );
  assertInteger(
    policy.maximumExceptionLifetimeDays,
    "targets.policy.maximumExceptionLifetimeDays",
    1,
    30
  );
  if (
    policy.maximumEvidenceAgeHours !== 24 ||
    policy.maximumScannerDatabaseAgeHours !== 24 ||
    policy.maximumExceptionLifetimeDays !== 30
  ) {
    fail("OCI_POLICY_VALUE_INVALID", "targets.policy");
  }

  if (!Array.isArray(targetsDocument.targets)) fail("OCI_TARGETS_INVALID", "targets.targets");
  targetsDocument.targets.forEach((target, index) =>
    assertRecord(target, `targets.targets[${index}]`)
  );
  assertSortedUnique(targetsDocument.targets, (target) => target.id, "targets.targets");
  const observedTargetIds = targetsDocument.targets.map((target) => target.id);
  if (
    observedTargetIds.length !== exactTargetIds.length ||
    observedTargetIds.some((id, index) => id !== exactTargetIds[index])
  ) {
    fail("OCI_TARGET_SET_INVALID", "targets.targets");
  }
  const targetsById = new Map();
  for (const [index, target] of targetsDocument.targets.entries()) {
    const location = `targets.targets[${index}]`;
    assertRecord(target, location);
    assertString(target.id, `${location}.id`, { pattern: safeIdentifierPattern, maximum: 128 });
    assertString(target.composeService, `${location}.composeService`, {
      pattern: safeIdentifierPattern,
      maximum: 128
    });
    const serviceBlock = composeServiceBlock(composeText, target.composeService);
    if (target.sourceKind === "registry") {
      assertExactKeys(target, ["id", "composeService", "sourceKind", "image"], location);
      const expectedImage = expectedRegistryImages.get(target.id);
      if (
        !expectedImage ||
        target.composeService !== target.id ||
        target.image !== expectedImage ||
        !digestPattern.test(target.image.slice(-71))
      ) {
        fail("OCI_REGISTRY_REFERENCE_INVALID", `${location}.image`);
      }
      if ((serviceBlock.match(/^ {4}image:\s+\S+\s*$/gmu) ?? []).length !== 1) {
        fail("OCI_COMPOSE_REFERENCE_MISMATCH", location);
      }
      if (/^ {4}build(?:\s*:|\s*$)/mu.test(serviceBlock)) {
        fail("OCI_COMPOSE_REFERENCE_MISMATCH", location);
      }
      assertOneExactLine(serviceBlock, `    image: ${target.image}`, location);
    } else if (target.sourceKind === "build") {
      assertExactKeys(
        target,
        ["id", "composeService", "sourceKind", "context", "dockerfile", "target"],
        location
      );
      const expected = expectedBuildTargets.get(target.id);
      if (
        !expected ||
        target.composeService !== expected.composeService ||
        target.context !== "." ||
        target.dockerfile !== expected.dockerfile ||
        target.target !== expected.target
      ) {
        fail("OCI_BUILD_TARGET_INVALID", location);
      }
      assertSafeRelativePath(target.dockerfile, `${location}.dockerfile`);
      if (/^ {4}image\s*:/mu.test(serviceBlock)) {
        fail("OCI_COMPOSE_BUILD_MISMATCH", location);
      }
      const buildBlock = composeMappingBlock(serviceBlock, 4, "build", location);
      if (
        (buildBlock.match(/^ {6}context:\s+\S+\s*$/gmu) ?? []).length !== 1 ||
        (buildBlock.match(/^ {6}dockerfile:\s+\S+\s*$/gmu) ?? []).length !== 1
      ) {
        fail("OCI_COMPOSE_BUILD_MISMATCH", location);
      }
      assertOneExactLine(buildBlock, "      context: .", location);
      assertOneExactLine(buildBlock, `      dockerfile: ${target.dockerfile}`, location);
      const dockerfileText = target.dockerfile.startsWith("apps/api-dotnet/")
        ? dotnetDockerfileText
        : nodeDockerfileText;
      const stagePattern = new RegExp(`^FROM .+ AS ${target.target}\\s*$`, "mu");
      if (!stagePattern.test(dockerfileText)) fail("OCI_DOCKERFILE_TARGET_MISSING", location);
      const composeTargetLines = buildBlock.match(/^ {6}target:\s+\S+\s*$/gmu) ?? [];
      if (composeTargetLines.length !== 1) {
        fail("OCI_COMPOSE_BUILD_MISMATCH", location);
      }
      assertOneExactLine(buildBlock, `      target: ${target.target}`, location);
    } else {
      fail("OCI_SOURCE_KIND_INVALID", `${location}.sourceKind`);
    }
    targetsById.set(target.id, target);
  }

  assertExactKeys(exceptionsDocument, ["schemaVersion", "exceptions"], "exceptions");
  if (exceptionsDocument.schemaVersion !== exceptionSchemaVersion) {
    fail("OCI_EXCEPTION_SCHEMA_INVALID", "exceptions.schemaVersion");
  }
  if (!Array.isArray(exceptionsDocument.exceptions)) {
    fail("OCI_EXCEPTIONS_INVALID", "exceptions.exceptions");
  }
  exceptionsDocument.exceptions.forEach((exception, index) =>
    assertRecord(exception, `exceptions.exceptions[${index}]`)
  );
  assertSortedUnique(
    exceptionsDocument.exceptions,
    (exception) => exception.exceptionId,
    "exceptions.exceptions"
  );
  const exceptionTuples = new Set();
  const exceptions = [];
  for (const [index, exception] of exceptionsDocument.exceptions.entries()) {
    const location = `exceptions.exceptions[${index}]`;
    assertExactKeys(
      exception,
      [
        "exceptionId",
        "targetId",
        "subjectDigest",
        "cveId",
        "packagePurl",
        "severity",
        "justification",
        "compensatingControl",
        "createdAt",
        "expiresAt",
        "decisionRef"
      ],
      location
    );
    for (const field of [
      "exceptionId",
      "targetId",
      "subjectDigest",
      "cveId",
      "severity",
      "justification",
      "compensatingControl",
      "decisionRef"
    ]) {
      assertString(exception[field], `${location}.${field}`, { maximum: 2048 });
      assertNoWildcards(exception[field], `${location}.${field}`);
    }
    assertString(exception.packagePurl, `${location}.packagePurl`, { maximum: 512 });
    if (!/^OCI-CVE-[A-Z0-9][A-Z0-9-]{2,63}$/u.test(exception.exceptionId)) {
      fail("OCI_EXCEPTION_ID_INVALID", `${location}.exceptionId`);
    }
    if (!targetsById.has(exception.targetId)) fail("OCI_EXCEPTION_TARGET_INVALID", location);
    assertDigest(exception.subjectDigest, `${location}.subjectDigest`);
    if (!cvePattern.test(exception.cveId)) fail("OCI_CVE_ID_INVALID", `${location}.cveId`);
    assertPackagePurl(exception.packagePurl, `${location}.packagePurl`);
    if (!blockedSeverities.has(exception.severity) || exception.severity === "UNKNOWN") {
      fail("OCI_EXCEPTION_SEVERITY_INVALID", `${location}.severity`);
    }
    if (exception.justification.length < 20 || exception.compensatingControl.length < 20) {
      fail("OCI_EXCEPTION_RATIONALE_INVALID", location);
    }
    if (
      exception.justification.trim() !== exception.justification ||
      exception.compensatingControl.trim() !== exception.compensatingControl ||
      !/^[A-Z][A-Z0-9._/-]{2,127}$/u.test(exception.decisionRef)
    ) {
      fail("OCI_EXCEPTION_RATIONALE_INVALID", location);
    }
    const createdAt = assertIsoInstant(exception.createdAt, `${location}.createdAt`);
    const expiresAt = assertIsoInstant(exception.expiresAt, `${location}.expiresAt`);
    const lifetime = expiresAt.getTime() - createdAt.getTime();
    if (
      createdAt > asOf ||
      expiresAt <= asOf ||
      lifetime <= 0 ||
      lifetime > policy.maximumExceptionLifetimeDays * 86_400_000
    ) {
      fail("OCI_EXCEPTION_WINDOW_INVALID", location);
    }
    const tuple = [
      exception.targetId,
      exception.subjectDigest,
      exception.cveId,
      exception.packagePurl,
      exception.severity
    ].join("\u0000");
    if (exceptionTuples.has(tuple)) fail("OCI_EXCEPTION_DUPLICATE", location);
    exceptionTuples.add(tuple);
    exceptions.push({ ...exception, tuple });
  }

  const frozenPolicy = Object.freeze({ ...policy });
  const internalTargetsById = new Map(
    [...targetsById].map(([targetId, target]) => [targetId, Object.freeze({ ...target })])
  );
  const internalExceptions = exceptions.map((exception) =>
    Object.freeze({
      ...exception,
      createdAtMilliseconds: new Date(exception.createdAt).getTime(),
      expiresAtMilliseconds: new Date(exception.expiresAt).getTime()
    })
  );
  const sourceDefinitions = Object.freeze({
    composeSha256: sha256(Buffer.from(composeText, "utf8")),
    dotnetDockerfileSha256: sha256(Buffer.from(dotnetDockerfileText, "utf8")),
    nodeDockerfileSha256: sha256(Buffer.from(nodeDockerfileText, "utf8")),
    spdxSchemaSha256
  });
  const manifestSha256 = sha256(
    canonicalJson({
      exceptions: exceptionsDocument,
      sourceDefinitions,
      targets: targetsDocument
    })
  );
  const publicState = Object.freeze({
    classification: precursorClassification,
    manifestSha256,
    policy: frozenPolicy,
    targetsById: new Map(internalTargetsById),
    exceptions: Object.freeze(exceptions.map((exception) => Object.freeze({ ...exception })))
  });
  policyStateSnapshots.set(
    publicState,
    Object.freeze({
      classification: precursorClassification,
      manifestSha256,
      policy: frozenPolicy,
      targetsById: internalTargetsById,
      exceptions: Object.freeze(internalExceptions),
      validateSpdxDocument,
      exceptionsByTuple: new Map(
        internalExceptions.map((exception) => [exception.tuple, exception])
      )
    })
  );
  return publicState;
}

function isContainedPath(root, candidate) {
  const relation = relative(root, candidate);
  return (
    relation === "" ||
    (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))
  );
}

function normaliseComparablePath(path) {
  const normalised = resolve(path);
  return process.platform === "win32" ? normalised.toLowerCase() : normalised;
}

function readStableRegularFile(path, location, byteLimit = maximumJsonBytes) {
  const initial = lstatSync(path, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1n) {
    fail("OCI_ARTIFACT_NOT_ORDINARY", location);
  }
  const realPath = realpathSync(path);
  if (normaliseComparablePath(realPath) !== normaliseComparablePath(path)) {
    fail("OCI_ARTIFACT_REPARSE_FORBIDDEN", location);
  }
  const descriptor = openSync(path, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.dev !== initial.dev ||
      before.ino !== initial.ino
    ) {
      fail("OCI_ARTIFACT_CHANGED", location);
    }
    if (before.size > BigInt(byteLimit)) fail("OCI_ARTIFACT_TOO_LARGE", location);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      BigInt(bytes.length) !== before.size ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.nlink !== after.nlink
    ) {
      fail("OCI_ARTIFACT_CHANGED", location);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function readEvidenceArtifact(
  evidenceRoot,
  relativePath,
  expectedDigest,
  location,
  { byteLimit = maximumJsonBytes, tokenLimit = maximumJsonTokens } = {}
) {
  assertSafeRelativePath(relativePath, `${location}.path`);
  assertDigest(expectedDigest, `${location}.sha256`);
  const root = realpathSync(evidenceRoot);
  const candidate = resolve(root, relativePath);
  if (!isContainedPath(root, candidate)) fail("OCI_PATH_ESCAPE", location);
  const bytes = readStableRegularFile(candidate, location, byteLimit);
  if (sha256(bytes) !== expectedDigest) fail("OCI_ARTIFACT_HASH_MISMATCH", location);
  return parseStrictJson(bytes, location, { byteLimit, tokenLimit });
}

function validateDescriptor(descriptor, expectedFormat, location) {
  assertExactKeys(descriptor, ["path", "sha256", "format"], location);
  assertSafeRelativePath(descriptor.path, `${location}.path`);
  assertDigest(descriptor.sha256, `${location}.sha256`);
  if (descriptor.format !== expectedFormat)
    fail("OCI_ARTIFACT_FORMAT_INVALID", `${location}.format`);
}

function assertFresh(instant, asOf, maximumAgeHours, location) {
  if (instant > asOf || asOf.getTime() - instant.getTime() > maximumAgeHours * 3_600_000) {
    fail("OCI_EVIDENCE_STALE", location);
  }
}

export function validateEvidence({ policyState, evidence, evidenceRoot, asOf = new Date() }) {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    fail("OCI_AS_OF_INVALID", "asOf");
  }
  const policySnapshot = policyStateSnapshots.get(policyState);
  if (!policySnapshot) fail("OCI_POLICY_STATE_INVALID", "policyState");
  policyState = policySnapshot;
  for (const exception of policyState.exceptions) {
    if (
      exception.createdAtMilliseconds > asOf.getTime() ||
      exception.expiresAtMilliseconds <= asOf.getTime()
    ) {
      fail("OCI_EXCEPTION_WINDOW_INVALID", "exceptions.exceptions");
    }
  }
  assertExactKeys(
    evidence,
    [
      "schemaVersion",
      "classification",
      "sbomProfile",
      "sourceCommit",
      "sourceTree",
      "policyManifestSha256",
      "observedAt",
      "platform",
      "subjects"
    ],
    "evidence"
  );
  if (evidence.schemaVersion !== evidenceSchemaVersion) {
    fail("OCI_EVIDENCE_SCHEMA_INVALID", "evidence.schemaVersion");
  }
  if (evidence.classification !== precursorClassification) {
    fail("OCI_CLASSIFICATION_INVALID", "evidence.classification");
  }
  if (evidence.sbomProfile !== policyState.policy.sbomProfile) {
    fail("OCI_SBOM_PROFILE_INVALID", "evidence.sbomProfile");
  }
  assertString(evidence.sourceCommit, "evidence.sourceCommit", {
    pattern: gitObjectPattern,
    maximum: 40
  });
  assertString(evidence.sourceTree, "evidence.sourceTree", {
    pattern: gitObjectPattern,
    maximum: 40
  });
  if (evidence.policyManifestSha256 !== policyState.manifestSha256) {
    fail("OCI_POLICY_MANIFEST_MISMATCH", "evidence.policyManifestSha256");
  }
  if (evidence.platform !== policyState.policy.platform) {
    fail("OCI_PLATFORM_MISMATCH", "evidence.platform");
  }
  const observedAt = assertIsoInstant(evidence.observedAt, "evidence.observedAt");
  assertFresh(observedAt, asOf, policyState.policy.maximumEvidenceAgeHours, "evidence.observedAt");
  if (!Array.isArray(evidence.subjects)) fail("OCI_SUBJECTS_INVALID", "evidence.subjects");
  evidence.subjects.forEach((subject, index) =>
    assertRecord(subject, `evidence.subjects[${index}]`)
  );
  assertSortedUnique(evidence.subjects, (subject) => subject.targetId, "evidence.subjects");
  const subjectIds = evidence.subjects.map((subject) => subject.targetId);
  if (
    subjectIds.length !== exactTargetIds.length ||
    subjectIds.some((id, index) => id !== exactTargetIds[index])
  ) {
    fail("OCI_SUBJECT_SET_INVALID", "evidence.subjects");
  }

  const usedExceptions = new Set();
  for (const [index, subject] of evidence.subjects.entries()) {
    const location = `evidence.subjects[${index}]`;
    assertExactKeys(
      subject,
      ["targetId", "subjectDigest", "sourceReferenceDigest", "sbom", "scan", "attestation"],
      location
    );
    const target = policyState.targetsById.get(subject.targetId);
    if (!target) fail("OCI_SUBJECT_TARGET_INVALID", `${location}.targetId`);
    assertDigest(subject.subjectDigest, `${location}.subjectDigest`);
    const expectedSourceDigest =
      target.sourceKind === "registry" ? target.image.slice(target.image.indexOf("sha256:")) : null;
    if (subject.sourceReferenceDigest !== expectedSourceDigest) {
      fail("OCI_SOURCE_DIGEST_MISMATCH", `${location}.sourceReferenceDigest`);
    }

    validateDescriptor(subject.sbom, policyState.policy.sbomFormat, `${location}.sbom`);
    const sbom = readEvidenceArtifact(
      evidenceRoot,
      subject.sbom.path,
      subject.sbom.sha256,
      `${location}.sbom`,
      { byteLimit: maximumSbomJsonBytes, tokenLimit: maximumSbomJsonTokens }
    );
    assertRecord(sbom, `${location}.sbom.document`);
    if (!policyState.validateSpdxDocument(sbom)) {
      fail(
        "OCI_SBOM_SCHEMA_INVALID",
        ajvFailureLocation(`${location}.sbom`, policyState.validateSpdxDocument)
      );
    }
    if (
      sbom.spdxVersion !== "SPDX-2.3" ||
      sbom.SPDXID !== "SPDXRef-DOCUMENT" ||
      sbom.dataLicense !== "CC0-1.0" ||
      sbom.name !== `shiftflow:${subject.targetId}@${subject.subjectDigest}` ||
      typeof sbom.documentNamespace !== "string" ||
      !Array.isArray(sbom.documentDescribes) ||
      sbom.documentDescribes.length === 0 ||
      !Array.isArray(sbom.packages) ||
      sbom.packages.length === 0
    ) {
      fail("OCI_SBOM_INVALID", `${location}.sbom`);
    }
    assertString(sbom.documentNamespace, `${location}.sbom.documentNamespace`, {
      maximum: 2048
    });
    try {
      const namespace = new URL(sbom.documentNamespace);
      if (
        !["http:", "https:", "urn:"].includes(namespace.protocol) ||
        sbom.documentNamespace.includes("#")
      ) {
        fail("OCI_SBOM_INVALID", `${location}.sbom.documentNamespace`);
      }
    } catch (error) {
      if (error instanceof OciSupplyChainPolicyError) throw error;
      fail("OCI_SBOM_INVALID", `${location}.sbom.documentNamespace`);
    }
    const sbomCreatedAt = assertIsoInstant(
      sbom.creationInfo.created,
      `${location}.sbom.creationInfo.created`
    );
    for (const [creatorIndex, creator] of sbom.creationInfo.creators.entries()) {
      assertString(creator, `${location}.sbom.creationInfo.creators[${creatorIndex}]`, {
        maximum: 512
      });
    }
    if ((sbom.externalDocumentRefs?.length ?? 0) !== 0) {
      fail("OCI_SBOM_EXTERNAL_REFERENCE_UNSUPPORTED", `${location}.sbom.externalDocumentRefs`);
    }
    const sbomPackagePurls = new Set();
    const sbomElementIds = new Set([sbom.SPDXID]);
    const sbomPackageIds = new Set();
    const sbomPackageFilesAnalysed = new Map();
    const sbomFileIds = new Set();
    const sbomSnippetIds = new Set();
    const sbomPackages = sbom.packages;
    const sbomFiles = sbom.files ?? [];
    const sbomSnippets = sbom.snippets ?? [];
    for (const [packageIndex, packageEntry] of sbomPackages.entries()) {
      const packageLocation = `${location}.sbom.packages[${packageIndex}]`;
      assertRecord(packageEntry, packageLocation);
      assertString(packageEntry.name, `${packageLocation}.name`, { maximum: 512 });
      const packageId = registerSpdxElementId(
        packageEntry.SPDXID,
        `${packageLocation}.SPDXID`,
        sbomElementIds
      );
      sbomPackageIds.add(packageId);
      sbomPackageFilesAnalysed.set(packageId, packageEntry.filesAnalyzed !== false);
      if (packageEntry.externalRefs === undefined) continue;
      if (!Array.isArray(packageEntry.externalRefs)) {
        fail("OCI_SBOM_INVALID", `${packageLocation}.externalRefs`);
      }
      for (const [referenceIndex, reference] of packageEntry.externalRefs.entries()) {
        const referenceLocation = `${packageLocation}.externalRefs[${referenceIndex}]`;
        assertRecord(reference, referenceLocation);
        if (reference.referenceType !== "purl") continue;
        if (reference.referenceCategory !== "PACKAGE-MANAGER") {
          fail("OCI_SBOM_PURL_CATEGORY_INVALID", `${referenceLocation}.referenceCategory`);
        }
        assertPackagePurl(reference.referenceLocator, `${referenceLocation}.referenceLocator`);
        sbomPackagePurls.add(reference.referenceLocator);
      }
    }
    for (const [fileIndex, fileEntry] of sbomFiles.entries()) {
      const fileLocation = `${location}.sbom.files[${fileIndex}]`;
      assertRecord(fileEntry, fileLocation);
      sbomFileIds.add(
        registerSpdxElementId(fileEntry.SPDXID, `${fileLocation}.SPDXID`, sbomElementIds)
      );
    }
    for (const [snippetIndex, snippetEntry] of sbomSnippets.entries()) {
      const snippetLocation = `${location}.sbom.snippets[${snippetIndex}]`;
      assertRecord(snippetEntry, snippetLocation);
      sbomSnippetIds.add(
        registerSpdxElementId(snippetEntry.SPDXID, `${snippetLocation}.SPDXID`, sbomElementIds)
      );
    }

    const describedElementIds = new Set([...sbomPackageIds, ...sbomFileIds, ...sbomSnippetIds]);
    const observedDescribedIds = new Set();
    let describesPackage = false;
    for (const [describedIndex, describedId] of sbom.documentDescribes.entries()) {
      const describedLocation = `${location}.sbom.documentDescribes[${describedIndex}]`;
      const resolvedId = assertLocalSpdxReference(
        describedId,
        describedLocation,
        describedElementIds
      );
      if (observedDescribedIds.has(resolvedId)) {
        fail("OCI_SBOM_DESCRIBES_INVALID", describedLocation);
      }
      observedDescribedIds.add(resolvedId);
      describesPackage ||= sbomPackageIds.has(resolvedId);
    }
    if (!describesPackage) {
      fail("OCI_SBOM_PROFILE_INVALID", `${location}.sbom.documentDescribes`);
    }

    for (const [packageIndex, packageEntry] of sbomPackages.entries()) {
      const packageFiles = packageEntry.hasFiles ?? [];
      if (packageEntry.filesAnalyzed === false && packageFiles.length > 0) {
        fail(
          "OCI_SBOM_FILES_ANALYSIS_INVALID",
          `${location}.sbom.packages[${packageIndex}].filesAnalyzed`
        );
      }
      for (const [fileIndex, fileId] of packageFiles.entries()) {
        assertLocalSpdxReference(
          fileId,
          `${location}.sbom.packages[${packageIndex}].hasFiles[${fileIndex}]`,
          sbomFileIds
        );
      }
    }
    for (const [fileIndex, fileEntry] of sbomFiles.entries()) {
      for (const [dependencyIndex, dependencyId] of (fileEntry.fileDependencies ?? []).entries()) {
        assertLocalSpdxReference(
          dependencyId,
          `${location}.sbom.files[${fileIndex}].fileDependencies[${dependencyIndex}]`,
          sbomFileIds
        );
      }
    }
    for (const [snippetIndex, snippetEntry] of sbomSnippets.entries()) {
      const snippetLocation = `${location}.sbom.snippets[${snippetIndex}]`;
      const sourceFileId = assertLocalSpdxReference(
        snippetEntry.snippetFromFile,
        `${snippetLocation}.snippetFromFile`,
        sbomFileIds
      );
      for (const [rangeIndex, range] of snippetEntry.ranges.entries()) {
        for (const pointerName of ["startPointer", "endPointer"]) {
          const pointerLocation = `${snippetLocation}.ranges[${rangeIndex}].${pointerName}.reference`;
          const pointerFileId = assertLocalSpdxReference(
            range[pointerName].reference,
            pointerLocation,
            sbomFileIds
          );
          if (pointerFileId !== sourceFileId) {
            fail("OCI_SBOM_REFERENCE_INVALID", pointerLocation);
          }
        }
      }
    }
    for (const [relationshipIndex, relationship] of (sbom.relationships ?? []).entries()) {
      const relationshipLocation = `${location}.sbom.relationships[${relationshipIndex}]`;
      assertResolvableSpdxReference(
        relationship.spdxElementId,
        `${relationshipLocation}.spdxElementId`,
        { elementIds: sbomElementIds }
      );
      assertResolvableSpdxReference(
        relationship.relatedSpdxElement,
        `${relationshipLocation}.relatedSpdxElement`,
        { elementIds: sbomElementIds, allowSpecial: true }
      );
      const unanalyzedPackageContainsFile =
        relationship.relationshipType === "CONTAINS" &&
        sbomPackageFilesAnalysed.get(relationship.spdxElementId) === false &&
        sbomFileIds.has(relationship.relatedSpdxElement);
      const fileIsContainedByUnanalyzedPackage =
        relationship.relationshipType === "CONTAINED_BY" &&
        sbomFileIds.has(relationship.spdxElementId) &&
        sbomPackageFilesAnalysed.get(relationship.relatedSpdxElement) === false;
      if (unanalyzedPackageContainsFile || fileIsContainedByUnanalyzedPackage) {
        fail("OCI_SBOM_FILES_ANALYSIS_INVALID", relationshipLocation);
      }
    }

    validateDescriptor(subject.scan, policyState.policy.scanFormat, `${location}.scan`);
    const scan = readEvidenceArtifact(
      evidenceRoot,
      subject.scan.path,
      subject.scan.sha256,
      `${location}.scan`,
      { byteLimit: maximumScanJsonBytes, tokenLimit: maximumScanJsonTokens }
    );
    assertExactKeys(
      scan,
      [
        "schemaVersion",
        "targetId",
        "subjectDigest",
        "scanner",
        "database",
        "observedAt",
        "findings"
      ],
      `${location}.scan.document`
    );
    if (
      scan.schemaVersion !== scanSchemaVersion ||
      scan.targetId !== subject.targetId ||
      scan.subjectDigest !== subject.subjectDigest
    ) {
      fail("OCI_SCAN_BINDING_INVALID", `${location}.scan`);
    }
    assertExactKeys(scan.scanner, ["name", "version", "binarySha256"], `${location}.scan.scanner`);
    assertString(scan.scanner.name, `${location}.scan.scanner.name`, {
      pattern: safeIdentifierPattern,
      maximum: 128
    });
    assertString(scan.scanner.version, `${location}.scan.scanner.version`, { maximum: 128 });
    assertNoWildcards(scan.scanner.version, `${location}.scan.scanner.version`);
    assertDigest(scan.scanner.binarySha256, `${location}.scan.scanner.binarySha256`);
    assertExactKeys(scan.database, ["digest", "updatedAt"], `${location}.scan.database`);
    assertDigest(scan.database.digest, `${location}.scan.database.digest`);
    const databaseUpdatedAt = assertIsoInstant(
      scan.database.updatedAt,
      `${location}.scan.database.updatedAt`
    );
    assertFresh(
      databaseUpdatedAt,
      asOf,
      policyState.policy.maximumScannerDatabaseAgeHours,
      `${location}.scan.database.updatedAt`
    );
    const scanObservedAt = assertIsoInstant(scan.observedAt, `${location}.scan.observedAt`);
    assertFresh(
      scanObservedAt,
      asOf,
      policyState.policy.maximumEvidenceAgeHours,
      `${location}.scan.observedAt`
    );
    if (databaseUpdatedAt > scanObservedAt || scanObservedAt > observedAt) {
      fail("OCI_EVIDENCE_TIME_ORDER_INVALID", `${location}.scan`);
    }
    if (sbomCreatedAt > scanObservedAt) {
      fail("OCI_EVIDENCE_TIME_ORDER_INVALID", `${location}.sbom.creationInfo.created`);
    }
    if (!Array.isArray(scan.findings)) fail("OCI_FINDINGS_INVALID", `${location}.scan.findings`);
    scan.findings.forEach((finding, findingIndex) =>
      assertRecord(finding, `${location}.scan.findings[${findingIndex}]`)
    );
    assertSortedUnique(
      scan.findings,
      (finding) => `${finding.cveId}\u0000${finding.packagePurl}`,
      `${location}.scan.findings`
    );
    for (const [findingIndex, finding] of scan.findings.entries()) {
      const findingLocation = `${location}.scan.findings[${findingIndex}]`;
      assertExactKeys(finding, ["cveId", "packagePurl", "severity"], findingLocation);
      if (!cvePattern.test(finding.cveId)) fail("OCI_CVE_ID_INVALID", `${findingLocation}.cveId`);
      assertPackagePurl(finding.packagePurl, `${findingLocation}.packagePurl`);
      if (!sbomPackagePurls.has(finding.packagePurl)) {
        fail("OCI_FINDING_NOT_IN_SBOM", `${findingLocation}.packagePurl`);
      }
      if (!["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"].includes(finding.severity)) {
        fail("OCI_SEVERITY_INVALID", `${findingLocation}.severity`);
      }
      if (!blockedSeverities.has(finding.severity)) continue;
      if (finding.severity === "UNKNOWN") fail("OCI_UNKNOWN_SEVERITY_BLOCKED", findingLocation);
      const tuple = [
        subject.targetId,
        subject.subjectDigest,
        finding.cveId,
        finding.packagePurl,
        finding.severity
      ].join("\u0000");
      const exception = policyState.exceptionsByTuple.get(tuple);
      if (!exception) fail("OCI_VULNERABILITY_BLOCKED", findingLocation);
      if (exception.createdAtMilliseconds > observedAt.getTime()) {
        fail("OCI_EXCEPTION_POSTDATES_EVIDENCE", findingLocation);
      }
      usedExceptions.add(exception.exceptionId);
    }

    validateDescriptor(subject.attestation, "in-toto-statement-v1", `${location}.attestation`);
    const statement = readEvidenceArtifact(
      evidenceRoot,
      subject.attestation.path,
      subject.attestation.sha256,
      `${location}.attestation`
    );
    assertExactKeys(
      statement,
      ["_type", "subject", "predicateType", "predicate"],
      `${location}.attestation.document`
    );
    if (
      statement._type !== inTotoStatementType ||
      statement.predicateType !== policyState.policy.attestationPredicateType ||
      !Array.isArray(statement.subject) ||
      statement.subject.length !== 1
    ) {
      fail("OCI_ATTESTATION_INVALID", `${location}.attestation`);
    }
    const attestationSubject = statement.subject[0];
    assertExactKeys(attestationSubject, ["name", "digest"], `${location}.attestation.subject`);
    assertExactKeys(
      attestationSubject.digest,
      ["sha256"],
      `${location}.attestation.subject.digest`
    );
    if (
      attestationSubject.name !== subject.targetId ||
      `sha256:${attestationSubject.digest.sha256}` !== subject.subjectDigest
    ) {
      fail("OCI_ATTESTATION_SUBJECT_MISMATCH", `${location}.attestation.subject`);
    }
    assertExactKeys(
      statement.predicate,
      [
        "classification",
        "sbomProfile",
        "sourceCommit",
        "sourceTree",
        "platform",
        "sourceReferenceDigest",
        "evidenceObservedAt",
        "policyManifestSha256",
        "sbomSha256",
        "scanSha256",
        "attestationMode"
      ],
      `${location}.attestation.predicate`
    );
    if (
      statement.predicate.classification !== precursorClassification ||
      statement.predicate.sbomProfile !== policyState.policy.sbomProfile ||
      statement.predicate.sourceCommit !== evidence.sourceCommit ||
      statement.predicate.sourceTree !== evidence.sourceTree ||
      statement.predicate.platform !== evidence.platform ||
      statement.predicate.sourceReferenceDigest !== subject.sourceReferenceDigest ||
      statement.predicate.evidenceObservedAt !== evidence.observedAt ||
      statement.predicate.policyManifestSha256 !== evidence.policyManifestSha256 ||
      statement.predicate.sbomSha256 !== subject.sbom.sha256 ||
      statement.predicate.scanSha256 !== subject.scan.sha256 ||
      statement.predicate.attestationMode !== "UNSIGNED_STRUCTURAL"
    ) {
      fail("OCI_ATTESTATION_BINDING_MISMATCH", `${location}.attestation.predicate`);
    }
  }

  const unused = policyState.exceptions.find(
    (exception) => !usedExceptions.has(exception.exceptionId)
  );
  if (unused) fail("OCI_EXCEPTION_UNUSED", "exceptions.exceptions");
  return {
    result: "UNSIGNED_EVIDENCE_STRUCTURALLY_VALID",
    classification: precursorClassification,
    sbomProfile: policyState.policy.sbomProfile,
    trust: "UNVERIFIED_LOCAL_INPUT",
    targetCount: evidence.subjects.length,
    manifestSha256: policyState.manifestSha256
  };
}

function readPolicyFile(path, location) {
  const bytes = readStableRegularFile(path, location);
  return parseStrictJson(bytes, location);
}

function readStableUtf8File(path, location) {
  const bytes = readStableRegularFile(path, location);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("OCI_UTF8_INVALID", location);
  return text;
}

function parseArguments(argumentsList) {
  const values = new Map();
  let policyOnly = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--policy-only") {
      if (policyOnly) fail("OCI_ARGUMENT_DUPLICATE", "arguments.--policy-only");
      policyOnly = true;
      continue;
    }
    if (!["--targets", "--exceptions", "--evidence", "--evidence-root"].includes(argument)) {
      fail("OCI_ARGUMENT_INVALID", "arguments");
    }
    if (values.has(argument) || !argumentsList[index + 1]) {
      fail("OCI_ARGUMENT_INVALID", `arguments.${argument}`);
    }
    values.set(argument, argumentsList[index + 1]);
    index += 1;
  }
  if (!values.has("--targets") || !values.has("--exceptions")) {
    fail("OCI_ARGUMENT_REQUIRED", "arguments");
  }
  const evidenceMode = values.has("--evidence") || values.has("--evidence-root");
  if (policyOnly === evidenceMode || (evidenceMode && values.size !== 4)) {
    fail("OCI_ARGUMENT_MODE_INVALID", "arguments");
  }
  return { policyOnly, values };
}

export function runCli(
  argumentsList,
  {
    cwd = process.cwd(),
    asOf = new Date(),
    stdout = (line) => console.log(line),
    stderr = (line) => console.error(line)
  } = {}
) {
  try {
    const { policyOnly, values } = parseArguments(argumentsList);
    const targetsPath = resolve(cwd, values.get("--targets"));
    const exceptionsPath = resolve(cwd, values.get("--exceptions"));
    const targetsDocument = readPolicyFile(targetsPath, "targets");
    const exceptionsDocument = readPolicyFile(exceptionsPath, "exceptions");
    const repositoryRoot = resolve(dirname(targetsPath), "..");
    if (targetsDocument?.policy?.sbomSchema?.path !== spdxSchemaPath) {
      fail("OCI_SBOM_SCHEMA_DESCRIPTOR_INVALID", "targets.policy.sbomSchema");
    }
    const policyState = validatePolicyDocuments({
      targetsDocument,
      exceptionsDocument,
      composeText: readStableUtf8File(
        resolve(repositoryRoot, "docker-compose.yml"),
        "docker-compose"
      ),
      nodeDockerfileText: readStableUtf8File(
        resolve(repositoryRoot, "infra/docker/node.Dockerfile"),
        "node-dockerfile"
      ),
      dotnetDockerfileText: readStableUtf8File(
        resolve(repositoryRoot, "apps/api-dotnet/Dockerfile"),
        "dotnet-dockerfile"
      ),
      spdxSchemaBytes: readStableRegularFile(
        resolve(repositoryRoot, spdxSchemaPath),
        "spdx-schema"
      ),
      asOf
    });
    const result = policyOnly
      ? {
          result: "POLICY_VALID",
          classification: precursorClassification,
          sbomProfile: policyState.policy.sbomProfile,
          evidenceStatus: "NOT_EVALUATED",
          targetCount: exactTargetIds.length,
          manifestSha256: policyState.manifestSha256
        }
      : validateEvidence({
          policyState,
          evidence: readPolicyFile(resolve(cwd, values.get("--evidence")), "evidence"),
          evidenceRoot: resolve(cwd, values.get("--evidence-root")),
          asOf
        });
    stdout(JSON.stringify(result));
    return 0;
  } catch (error) {
    const failure =
      error instanceof OciSupplyChainPolicyError
        ? { status: "failed", code: error.code, location: error.location }
        : { status: "failed", code: "OCI_UNEXPECTED_FAILURE", location: "internal" };
    stderr(JSON.stringify(failure));
    return 1;
  }
}

const isDirectExecution =
  process.argv[1] &&
  normaliseComparablePath(realpathSync(process.argv[1])) ===
    normaliseComparablePath(realpathSync(fileURLToPath(import.meta.url)));
if (isDirectExecution) {
  process.exitCode = runCli(process.argv.slice(2));
}
