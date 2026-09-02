// en-GB: Proves the unsigned local OCI precursor is strict, deterministic and fail-closed.
/* global Buffer, process, structuredClone */
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseStrictJson,
  runCli,
  sha256,
  validateEvidence,
  validatePolicyDocuments
} from "./verify-oci-supply-chain.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const asOf = new Date("2026-09-02T12:00:00.000Z");
const observedAt = "2026-09-02T11:30:00.000Z";
const scanObservedAt = "2026-09-02T11:00:00.000Z";
const databaseUpdatedAt = "2026-09-02T10:00:00.000Z";
const targetPath = join(repositoryRoot, "eng", "oci-targets.json");
const exceptionPath = join(repositoryRoot, "eng", "oci-cve-exceptions.json");
const spdxSchemaBytes = readFileSync(join(repositoryRoot, "eng", "spdx-2.3-schema.json"));
const targetDocument = parseStrictJson(readFileSync(targetPath), "targets");
const emptyExceptionDocument = parseStrictJson(readFileSync(exceptionPath), "exceptions");
const composeText = readFileSync(join(repositoryRoot, "docker-compose.yml"), "utf8");
const nodeDockerfileText = readFileSync(
  join(repositoryRoot, "infra", "docker", "node.Dockerfile"),
  "utf8"
);
const dotnetDockerfileText = readFileSync(
  join(repositoryRoot, "apps", "api-dotnet", "Dockerfile"),
  "utf8"
);
const temporaryRoots = new Set();

afterEach(() => {
  for (const root of temporaryRoots) {
    const normalisedRoot = resolve(root);
    const normalisedTemporaryDirectory = resolve(tmpdir());
    const relation = relative(normalisedTemporaryDirectory, normalisedRoot);
    if (
      relation !== "" &&
      relation !== ".." &&
      !relation.startsWith(`..${sep}`) &&
      !isAbsolute(relation)
    ) {
      rmSync(normalisedRoot, { force: true, recursive: true });
    }
  }
  temporaryRoots.clear();
});

function clone(value) {
  return structuredClone(value);
}

function capturePolicyError(action) {
  let observed;
  try {
    action();
  } catch (error) {
    observed = error;
  }
  expect(observed).toBeDefined();
  return observed;
}

function expectPolicyError(action, code) {
  expect(capturePolicyError(action)).toMatchObject({ code });
}

function validatePolicy(exceptionsDocument = emptyExceptionDocument, referenceTime = asOf) {
  return validatePolicyDocuments({
    targetsDocument: targetDocument,
    exceptionsDocument,
    composeText,
    nodeDockerfileText,
    dotnetDockerfileText,
    spdxSchemaBytes,
    asOf: referenceTime
  });
}

function subjectDigest(targetId) {
  return sha256(Buffer.from(`image:${targetId}`, "utf8"));
}

function packagePurl(targetId) {
  return `pkg:generic/${targetId}@1.0.0`;
}

function createException({
  targetId = "api-dotnet",
  digest = subjectDigest(targetId),
  cveId = "CVE-2026-1000",
  purl = packagePurl(targetId),
  severity = "MEDIUM"
} = {}) {
  return {
    exceptionId: "OCI-CVE-APPROVED-001",
    targetId,
    subjectDigest: digest,
    cveId,
    packagePurl: purl,
    severity,
    justification: "The local exposure is bounded while the package upgrade is prepared.",
    compensatingControl:
      "The affected feature remains disabled in the local precursor environment.",
    createdAt: "2026-09-01T12:00:00.000Z",
    expiresAt: "2026-09-30T12:00:00.000Z",
    decisionRef: "SEC-2026-001"
  };
}

function exceptionDocument(exceptions) {
  return {
    schemaVersion: "shiftflow.oci-cve-exceptions/v1",
    exceptions
  };
}

function writeArtifact(root, fileName, document, format) {
  const bytes = Buffer.from(JSON.stringify(document), "utf8");
  writeFileSync(join(root, fileName), bytes);
  return { path: fileName, sha256: sha256(bytes), format };
}

function addConnectedSpdxGraph(sbom, targetId) {
  const packageId = `SPDXRef-Package-${targetId}`;
  const sourceFileId = `SPDXRef-File-${targetId}-source`;
  const dependencyFileId = `SPDXRef-File-${targetId}-dependency`;
  const snippetId = `SPDXRef-Snippet-${targetId}`;
  sbom.packages[0].filesAnalyzed = true;
  sbom.packages[0].hasFiles = [sourceFileId, dependencyFileId];
  sbom.packages[0].externalRefs.push({
    referenceCategory: "SECURITY",
    referenceType: "cpe23Type",
    referenceLocator: `cpe:2.3:a:shiftflow:${targetId}:1.0.0:*:*:*:*:*:*:*`
  });
  sbom.files = [
    {
      SPDXID: sourceFileId,
      fileName: `./${targetId}/source.js`,
      checksums: [{ algorithm: "SHA256", checksumValue: "1".repeat(64) }],
      fileDependencies: [dependencyFileId]
    },
    {
      SPDXID: dependencyFileId,
      fileName: `./${targetId}/dependency.js`,
      checksums: [{ algorithm: "SHA256", checksumValue: "2".repeat(64) }]
    }
  ];
  sbom.snippets = [
    {
      SPDXID: snippetId,
      name: `${targetId}-snippet`,
      snippetFromFile: sourceFileId,
      ranges: [
        {
          startPointer: { reference: sourceFileId, lineNumber: 1 },
          endPointer: { reference: sourceFileId, lineNumber: 2 }
        }
      ]
    }
  ];
  sbom.documentDescribes = [packageId, sourceFileId, snippetId];
  sbom.relationships = [
    {
      spdxElementId: packageId,
      relatedSpdxElement: sourceFileId,
      relationshipType: "CONTAINS"
    },
    {
      spdxElementId: snippetId,
      relatedSpdxElement: "NOASSERTION",
      relationshipType: "OTHER"
    }
  ];
}

function mutateApiDotnetGraph(mutation = () => {}) {
  return (sbom, targetId) => {
    if (targetId !== "api-dotnet") return;
    addConnectedSpdxGraph(sbom, targetId);
    mutation(sbom);
  };
}

function createEvidenceFixture({
  findingsByTarget = new Map(),
  exceptions = [],
  packagePurlsByTarget = new Map(),
  mutateSbom,
  mutateAttestation,
  scanTime = scanObservedAt,
  databaseTime = databaseUpdatedAt
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "shiftflow-oci-policy-"));
  temporaryRoots.add(root);
  const exceptionsDocument = exceptionDocument(exceptions);
  const policyState = validatePolicy(exceptionsDocument);
  const subjects = [];

  for (const target of targetDocument.targets) {
    const digest = subjectDigest(target.id);
    const purl = packagePurlsByTarget.get(target.id) ?? packagePurl(target.id);
    const sourceReferenceDigest =
      target.sourceKind === "registry" ? target.image.slice(target.image.indexOf("sha256:")) : null;
    const sbom = {
      spdxVersion: "SPDX-2.3",
      SPDXID: "SPDXRef-DOCUMENT",
      dataLicense: "CC0-1.0",
      name: `shiftflow:${target.id}@${digest}`,
      documentNamespace: `https://shiftflow.local/spdx/${target.id}/${digest}`,
      creationInfo: {
        created: "2026-09-02T10:30:00.000Z",
        creators: ["Tool: shiftflow-fixture-generator-1.0.0"]
      },
      documentDescribes: [`SPDXRef-Package-${target.id}`],
      packages: [
        {
          SPDXID: `SPDXRef-Package-${target.id}`,
          name: target.id,
          versionInfo: "1.0.0",
          downloadLocation: "NOASSERTION",
          filesAnalyzed: false,
          externalRefs: [
            {
              referenceCategory: "PACKAGE-MANAGER",
              referenceType: "purl",
              referenceLocator: purl
            }
          ]
        }
      ]
    };
    mutateSbom?.(sbom, target.id);
    const sbomDescriptor = writeArtifact(root, `${target.id}.spdx.json`, sbom, "spdx-2.3-json");
    const scan = {
      schemaVersion: "shiftflow.oci-scan/v1",
      targetId: target.id,
      subjectDigest: digest,
      scanner: {
        name: "fixture-scanner",
        version: "1.0.0",
        binarySha256: sha256(Buffer.from("fixture-scanner", "utf8"))
      },
      database: {
        digest: sha256(Buffer.from("fixture-database", "utf8")),
        updatedAt: databaseTime
      },
      observedAt: scanTime,
      findings: findingsByTarget.get(target.id) ?? []
    };
    const scanDescriptor = writeArtifact(
      root,
      `${target.id}.scan.json`,
      scan,
      "shiftflow.oci-scan/v1"
    );
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: target.id, digest: { sha256: digest.slice("sha256:".length) } }],
      predicateType: "urn:shiftflow:attestation:oci-supply-chain:v1",
      predicate: {
        classification: "LOCAL_UNSIGNED_PRECURSOR",
        sbomProfile: "shiftflow.spdx-2.3-oci-package-profile/v1",
        sourceCommit: "a".repeat(40),
        sourceTree: "b".repeat(40),
        platform: "linux/amd64",
        sourceReferenceDigest,
        evidenceObservedAt: observedAt,
        policyManifestSha256: policyState.manifestSha256,
        sbomSha256: sbomDescriptor.sha256,
        scanSha256: scanDescriptor.sha256,
        attestationMode: "UNSIGNED_STRUCTURAL"
      }
    };
    mutateAttestation?.(statement, target.id);
    const attestationDescriptor = writeArtifact(
      root,
      `${target.id}.attestation.json`,
      statement,
      "in-toto-statement-v1"
    );
    subjects.push({
      targetId: target.id,
      subjectDigest: digest,
      sourceReferenceDigest,
      sbom: sbomDescriptor,
      scan: scanDescriptor,
      attestation: attestationDescriptor
    });
  }

  return {
    root,
    policyState,
    evidence: {
      schemaVersion: "shiftflow.oci-evidence/v1",
      classification: "LOCAL_UNSIGNED_PRECURSOR",
      sbomProfile: "shiftflow.spdx-2.3-oci-package-profile/v1",
      sourceCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      policyManifestSha256: policyState.manifestSha256,
      observedAt,
      platform: "linux/amd64",
      subjects
    }
  };
}

describe("strict OCI policy JSON", () => {
  it("rejects duplicate keys, BOMs and unsafe numbers", () => {
    expectPolicyError(() => parseStrictJson('{"value":1,"value":2}'), "OCI_JSON_DUPLICATE_KEY");
    expectPolicyError(
      () => parseStrictJson(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
      "OCI_JSON_BOM_FORBIDDEN"
    );
    expectPolicyError(() => parseStrictJson('{"value":9007199254740992}'), "OCI_NUMBER_UNSAFE");
    expectPolicyError(
      () => parseStrictJson(`${"[".repeat(66)}0${"]".repeat(66)}`),
      "OCI_JSON_DEPTH_INVALID"
    );
    expectPolicyError(() => parseStrictJson('{"value":"\\ud800"}'), "OCI_STRING_SURROGATE_INVALID");
    expectPolicyError(
      () => parseStrictJson(`[${Array.from({ length: 250_001 }, () => "0").join(",")}]`),
      "OCI_JSON_TOKEN_LIMIT"
    );
  });

  it("canonicalises object keys deterministically", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"z":1}');
  });
});

describe("OCI policy documents", () => {
  it("accepts the exact seven repository targets and empty exception list", () => {
    const state = validatePolicy();

    expect([...state.targetsById.keys()]).toEqual([
      "api-dotnet",
      "legacy-api",
      "migration",
      "nginx",
      "postgres",
      "redis",
      "web"
    ]);
    expect(state.exceptions).toEqual([]);
  });

  it("rejects target reordering, policy drift and Compose reference drift", () => {
    const nullTarget = clone(targetDocument);
    nullTarget.targets[0] = null;
    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: nullTarget,
          exceptionsDocument: emptyExceptionDocument,
          composeText,
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes,
          asOf
        }),
      "OCI_OBJECT_REQUIRED"
    );

    const reordered = clone(targetDocument);
    reordered.targets.reverse();
    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: reordered,
          exceptionsDocument: emptyExceptionDocument,
          composeText,
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes,
          asOf
        }),
      "OCI_ARRAY_ORDER_INVALID"
    );

    const relaxed = clone(targetDocument);
    relaxed.policy.maximumEvidenceAgeHours = 25;
    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: relaxed,
          exceptionsDocument: emptyExceptionDocument,
          composeText,
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes,
          asOf
        }),
      "OCI_POLICY_VALUE_INVALID"
    );

    const profileDrift = clone(targetDocument);
    profileDrift.policy.sbomProfile = "shiftflow.spdx-2.3-unrestricted/v1";
    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: profileDrift,
          exceptionsDocument: emptyExceptionDocument,
          composeText,
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes,
          asOf
        }),
      "OCI_POLICY_VALUE_INVALID"
    );

    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: targetDocument,
          exceptionsDocument: emptyExceptionDocument,
          composeText: composeText.replace(
            "postgres:16-alpine@sha256:",
            "postgres:latest # sha256:"
          ),
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes,
          asOf
        }),
      "OCI_COMPOSE_REFERENCE_MISMATCH"
    );

    const spoofedBuild = composeText.replace(
      /^ {4}build:\r?\n {6}context: [.]\r?\n {6}dockerfile: apps\/api-dotnet\/Dockerfile\s*$/mu,
      [
        "    build: ./untrusted-context",
        "    x-oci-proof:",
        "      context: .",
        "      dockerfile: apps/api-dotnet/Dockerfile"
      ].join("\n")
    );
    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: targetDocument,
          exceptionsDocument: emptyExceptionDocument,
          composeText: spoofedBuild,
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes,
          asOf
        }),
      "OCI_COMPOSE_BUILD_MISMATCH"
    );
  });

  it("binds the manifest hash to both targets and exceptions", () => {
    const emptyState = validatePolicy();
    const exceptionState = validatePolicy(exceptionDocument([createException()]));

    expect(exceptionState.manifestSha256).not.toBe(emptyState.manifestSha256);
  });

  it("rejects a schema whose bytes do not match the pinned SPDX 2.3 copy", () => {
    expectPolicyError(
      () =>
        validatePolicyDocuments({
          targetsDocument: targetDocument,
          exceptionsDocument: emptyExceptionDocument,
          composeText,
          nodeDockerfileText,
          dotnetDockerfileText,
          spdxSchemaBytes: Buffer.from("{}", "utf8"),
          asOf
        }),
      "OCI_SBOM_SCHEMA_HASH_MISMATCH"
    );
  });

  it("rejects wildcard, UNKNOWN and overlong exceptions", () => {
    const wildcard = createException();
    wildcard.decisionRef = "SEC-*";
    expectPolicyError(
      () => validatePolicy(exceptionDocument([wildcard])),
      "OCI_WILDCARD_FORBIDDEN"
    );

    const unknown = createException({ severity: "UNKNOWN" });
    expectPolicyError(
      () => validatePolicy(exceptionDocument([unknown])),
      "OCI_EXCEPTION_SEVERITY_INVALID"
    );

    const overlong = createException();
    overlong.expiresAt = "2026-10-02T12:00:00.000Z";
    expectPolicyError(
      () => validatePolicy(exceptionDocument([overlong])),
      "OCI_EXCEPTION_WINDOW_INVALID"
    );

    const padded = createException();
    padded.justification = ` ${padded.justification}`;
    expectPolicyError(
      () => validatePolicy(exceptionDocument([padded])),
      "OCI_EXCEPTION_RATIONALE_INVALID"
    );
  });

  it("enforces the lexical PURL profile while accepting optional versions", () => {
    const qualified = createException({
      purl: "pkg:apk/alpine/libssl3@3.5.4-r0?arch=x86_64&distro=alpine-3.22.1#usr/lib"
    });
    expect(() => validatePolicy(exceptionDocument([qualified]))).not.toThrow();

    const versionless = createException({ purl: "pkg:generic/shiftflow-runtime" });
    expect(() => validatePolicy(exceptionDocument([versionless]))).not.toThrow();

    const versionlessQualified = createException({
      purl: "pkg:apk/alpine/libssl3?arch=x86_64&distro=alpine-3.22.1#usr/lib"
    });
    expect(() => validatePolicy(exceptionDocument([versionlessQualified]))).not.toThrow();

    const encodedNamespace = createException({ purl: "pkg:npm/%40angular/core" });
    expect(() => validatePolicy(exceptionDocument([encodedNamespace]))).not.toThrow();

    const malformed = createException({ purl: "pkg:apk/alpine/libssl3@3.5.4-r0?arch=%zz" });
    expectPolicyError(
      () => validatePolicy(exceptionDocument([malformed])),
      "OCI_PACKAGE_PURL_INVALID"
    );

    const unordered = createException({
      purl: "pkg:apk/alpine/libssl3@3.5.4-r0?distro=alpine-3.22.1&arch=x86_64"
    });
    expectPolicyError(
      () => validatePolicy(exceptionDocument([unordered])),
      "OCI_PACKAGE_PURL_INVALID"
    );

    const emptyVersion = createException({ purl: "pkg:generic/shiftflow-runtime@" });
    expectPolicyError(
      () => validatePolicy(exceptionDocument([emptyVersion])),
      "OCI_PACKAGE_PURL_INVALID"
    );

    for (const purl of [
      "pkg:generic/@1.0.0",
      "pkg:npm/@angular/core",
      "pkg:generic/api@beta@1.0.0"
    ]) {
      expectPolicyError(
        () => validatePolicy(exceptionDocument([createException({ purl })])),
        "OCI_PACKAGE_PURL_INVALID"
      );
    }
  });
});

describe("OCI evidence", () => {
  it("accepts complete, fresh and structurally bound evidence for all seven targets", () => {
    const fixture = createEvidenceFixture();

    expect(
      validateEvidence({
        policyState: fixture.policyState,
        evidence: fixture.evidence,
        evidenceRoot: fixture.root,
        asOf
      })
    ).toMatchObject({
      result: "UNSIGNED_EVIDENCE_STRUCTURALLY_VALID",
      classification: "LOCAL_UNSIGNED_PRECURSOR",
      sbomProfile: "shiftflow.spdx-2.3-oci-package-profile/v1",
      trust: "UNVERIFIED_LOCAL_INPUT",
      targetCount: 7
    });
  });

  it("rejects evidence whose declared SPDX profile drifts from policy", () => {
    const fixture = createEvidenceFixture();
    fixture.evidence.sbomProfile = "shiftflow.spdx-2.3-unrestricted/v1";

    expectPolicyError(
      () =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        }),
      "OCI_SBOM_PROFILE_INVALID"
    );
  });

  it.each([
    [
      "creation information",
      (sbom) => {
        delete sbom.creationInfo;
      },
      "OCI_SBOM_SCHEMA_INVALID"
    ],
    [
      "package download location",
      (sbom) => {
        delete sbom.packages[0].downloadLocation;
      },
      "OCI_SBOM_SCHEMA_INVALID"
    ],
    [
      "document namespace",
      (sbom) => {
        delete sbom.documentNamespace;
      },
      "OCI_SBOM_INVALID"
    ],
    [
      "document describes relationship",
      (sbom) => {
        delete sbom.documentDescribes;
      },
      "OCI_SBOM_INVALID"
    ]
  ])("rejects SPDX documents without %s", (_label, mutateSbom, expectedCode) => {
    const fixture = createEvidenceFixture({ mutateSbom });

    expectPolicyError(
      () =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        }),
      expectedCode
    );
  });

  it("reports the first schema keyword and JSON Pointer without echoing evidence values", () => {
    const fixture = createEvidenceFixture({
      mutateSbom: (sbom) => {
        delete sbom.packages[0].downloadLocation;
      }
    });

    expect(
      capturePolicyError(() =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        })
      )
    ).toMatchObject({
      code: "OCI_SBOM_SCHEMA_INVALID",
      location: "evidence.subjects[0].sbom/packages/0/downloadLocation#required"
    });
  });

  it.each([
    [
      "missing required property",
      (sbom) => {
        delete sbom.creationInfo;
      },
      "evidence.subjects[0].sbom/creationInfo#required"
    ],
    [
      "non-coercible field type",
      (sbom) => {
        sbom.packages[0].downloadLocation = 42;
      },
      "evidence.subjects[0].sbom/packages/0/downloadLocation#type"
    ],
    [
      "redacted additional property",
      (sbom) => {
        sbom.packages[0].SECRET_TOKEN_VALUE = "must-not-appear";
      },
      "evidence.subjects[0].sbom/packages/0#additionalProperties"
    ]
  ])("reports a deterministic, value-free location for a %s", (_label, mutateSbom, location) => {
    const fixture = createEvidenceFixture({ mutateSbom });
    const validate = () =>
      validateEvidence({
        policyState: fixture.policyState,
        evidence: fixture.evidence,
        evidenceRoot: fixture.root,
        asOf
      });

    const first = capturePolicyError(validate);
    const second = capturePolicyError(validate);
    expect(first).toMatchObject({ code: "OCI_SBOM_SCHEMA_INVALID", location });
    expect(second).toMatchObject({ code: first.code, location: first.location });
    expect(first.location).not.toContain("SECRET_TOKEN_VALUE");
    expect(first.location).not.toContain("must-not-appear");
  });

  it("accepts a closed local SPDX graph with typed file, snippet and relationship references", () => {
    const fixture = createEvidenceFixture({
      mutateSbom: mutateApiDotnetGraph((sbom) => {
        sbom.documentNamespace += "/%23component";
      })
    });

    expect(
      validateEvidence({
        policyState: fixture.policyState,
        evidence: fixture.evidence,
        evidenceRoot: fixture.root,
        asOf
      }).result
    ).toBe("UNSIGNED_EVIDENCE_STRUCTURALLY_VALID");
  });

  it.each([
    [
      "document description",
      (sbom) => {
        sbom.documentDescribes[1] = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.documentDescribes[1]"
    ],
    [
      "package file",
      (sbom) => {
        sbom.packages[0].hasFiles[0] = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.packages[0].hasFiles[0]"
    ],
    [
      "package-as-file type mismatch",
      (sbom) => {
        sbom.packages[0].hasFiles[0] = sbom.packages[0].SPDXID;
      },
      "evidence.subjects[0].sbom.packages[0].hasFiles[0]"
    ],
    [
      "file dependency",
      (sbom) => {
        sbom.files[0].fileDependencies[0] = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.files[0].fileDependencies[0]"
    ],
    [
      "snippet source",
      (sbom) => {
        sbom.snippets[0].snippetFromFile = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.snippets[0].snippetFromFile"
    ],
    [
      "package-as-snippet-source type mismatch",
      (sbom) => {
        sbom.snippets[0].snippetFromFile = sbom.packages[0].SPDXID;
      },
      "evidence.subjects[0].sbom.snippets[0].snippetFromFile"
    ],
    [
      "range start",
      (sbom) => {
        sbom.snippets[0].ranges[0].startPointer.reference = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.snippets[0].ranges[0].startPointer.reference"
    ],
    [
      "range end",
      (sbom) => {
        sbom.snippets[0].ranges[0].endPointer.reference = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.snippets[0].ranges[0].endPointer.reference"
    ],
    [
      "range pointer to a different file",
      (sbom) => {
        sbom.snippets[0].ranges[0].endPointer.reference = sbom.files[1].SPDXID;
      },
      "evidence.subjects[0].sbom.snippets[0].ranges[0].endPointer.reference"
    ],
    [
      "relationship source",
      (sbom) => {
        sbom.relationships[0].spdxElementId = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.relationships[0].spdxElementId"
    ],
    [
      "relationship target",
      (sbom) => {
        sbom.relationships[0].relatedSpdxElement = "SPDXRef-Missing";
      },
      "evidence.subjects[0].sbom.relationships[0].relatedSpdxElement"
    ]
  ])(
    "rejects an unresolved or mistyped local SPDX %s reference",
    (_label, mutation, expectedLocation) => {
      const fixture = createEvidenceFixture({ mutateSbom: mutateApiDotnetGraph(mutation) });

      expect(
        capturePolicyError(() =>
          validateEvidence({
            policyState: fixture.policyState,
            evidence: fixture.evidence,
            evidenceRoot: fixture.root,
            asOf
          })
        )
      ).toMatchObject({ code: "OCI_SBOM_REFERENCE_INVALID", location: expectedLocation });
    }
  );

  it.each([
    [
      "duplicate cross-type element ID",
      (sbom) => {
        sbom.files[0].SPDXID = sbom.packages[0].SPDXID;
      },
      "OCI_SBOM_DUPLICATE_ID",
      "evidence.subjects[0].sbom.files[0].SPDXID"
    ],
    [
      "duplicate described element",
      (sbom) => {
        sbom.documentDescribes.push(sbom.documentDescribes[0]);
      },
      "OCI_SBOM_DESCRIBES_INVALID",
      "evidence.subjects[0].sbom.documentDescribes[3]"
    ],
    [
      "profile without a described package",
      (sbom) => {
        sbom.documentDescribes = [sbom.files[0].SPDXID];
      },
      "OCI_SBOM_PROFILE_INVALID",
      "evidence.subjects[0].sbom.documentDescribes"
    ],
    [
      "files attached to an unanalyzed package",
      (sbom) => {
        sbom.packages[0].filesAnalyzed = false;
      },
      "OCI_SBOM_FILES_ANALYSIS_INVALID",
      "evidence.subjects[0].sbom.packages[0].filesAnalyzed"
    ],
    [
      "file containment relationship from an unanalyzed package",
      (sbom) => {
        sbom.packages[0].filesAnalyzed = false;
        delete sbom.packages[0].hasFiles;
      },
      "OCI_SBOM_FILES_ANALYSIS_INVALID",
      "evidence.subjects[0].sbom.relationships[0]"
    ],
    [
      "file containment relationship into an unanalyzed package",
      (sbom) => {
        sbom.packages[0].filesAnalyzed = false;
        delete sbom.packages[0].hasFiles;
        sbom.relationships[0] = {
          spdxElementId: sbom.files[0].SPDXID,
          relatedSpdxElement: sbom.packages[0].SPDXID,
          relationshipType: "CONTAINED_BY"
        };
      },
      "OCI_SBOM_FILES_ANALYSIS_INVALID",
      "evidence.subjects[0].sbom.relationships[0]"
    ],
    [
      "external relationship reference",
      (sbom) => {
        sbom.relationships[0].relatedSpdxElement = "DocumentRef-foreign:SPDXRef-Package";
      },
      "OCI_SBOM_EXTERNAL_REFERENCE_UNSUPPORTED",
      "evidence.subjects[0].sbom.relationships[0].relatedSpdxElement"
    ],
    [
      "sentinel relationship source",
      (sbom) => {
        sbom.relationships[0].spdxElementId = "NOASSERTION";
      },
      "OCI_SBOM_REFERENCE_INVALID",
      "evidence.subjects[0].sbom.relationships[0].spdxElementId"
    ]
  ])("rejects %s", (_label, mutation, code, location) => {
    const fixture = createEvidenceFixture({ mutateSbom: mutateApiDotnetGraph(mutation) });

    expect(
      capturePolicyError(() =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        })
      )
    ).toMatchObject({ code, location });
  });

  it.each([
    [
      "empty namespace fragment",
      (sbom) => {
        sbom.documentNamespace += "#";
      },
      "OCI_SBOM_INVALID",
      "evidence.subjects[0].sbom.documentNamespace"
    ],
    [
      "fragment-bearing namespace",
      (sbom) => {
        sbom.documentNamespace += "#fragment";
      },
      "OCI_SBOM_INVALID",
      "evidence.subjects[0].sbom.documentNamespace"
    ],
    [
      "PURL outside PACKAGE-MANAGER",
      (sbom) => {
        sbom.packages[0].externalRefs[0].referenceCategory = "SECURITY";
      },
      "OCI_SBOM_PURL_CATEGORY_INVALID",
      "evidence.subjects[0].sbom.packages[0].externalRefs[0].referenceCategory"
    ],
    [
      "external document declaration",
      (sbom) => {
        sbom.externalDocumentRefs = [
          {
            externalDocumentId: "DocumentRef-foreign",
            spdxDocument: "https://example.invalid/foreign.spdx.json",
            checksum: { algorithm: "SHA256", checksumValue: "3".repeat(64) }
          }
        ];
      },
      "OCI_SBOM_EXTERNAL_REFERENCE_UNSUPPORTED",
      "evidence.subjects[0].sbom.externalDocumentRefs"
    ]
  ])("rejects a profile-incompatible %s", (_label, mutation, code, location) => {
    const fixture = createEvidenceFixture({
      mutateSbom: (sbom, targetId) => {
        if (targetId === "api-dotnet") mutation(sbom);
      }
    });

    expect(
      capturePolicyError(() =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        })
      )
    ).toMatchObject({ code, location });
  });

  it("accepts a schema-valid SBOM above the narrow policy-file limit", () => {
    const fixture = createEvidenceFixture({
      mutateSbom: (sbom, targetId) => {
        if (targetId === "api-dotnet") sbom.comment = "x".repeat(5 * 1024 * 1024);
      }
    });

    expect(
      validateEvidence({
        policyState: fixture.policyState,
        evidence: fixture.evidence,
        evidenceRoot: fixture.root,
        asOf
      }).result
    ).toBe("UNSIGNED_EVIDENCE_STRUCTURALLY_VALID");
  });

  it("rejects tampered artefacts and path traversal before parsing", () => {
    const tampered = createEvidenceFixture();
    writeFileSync(
      join(tampered.root, tampered.evidence.subjects[0].sbom.path),
      Buffer.from("{}", "utf8")
    );
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: tampered.policyState,
          evidence: tampered.evidence,
          evidenceRoot: tampered.root,
          asOf
        }),
      "OCI_ARTIFACT_HASH_MISMATCH"
    );

    const traversal = createEvidenceFixture();
    traversal.evidence.subjects[0].sbom.path = "../outside.json";
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: traversal.policyState,
          evidence: traversal.evidence,
          evidenceRoot: traversal.root,
          asOf
        }),
      "OCI_PATH_INVALID"
    );

    const alternateDataStream = createEvidenceFixture();
    alternateDataStream.evidence.subjects[0].sbom.path = "evidence.json:payload";
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: alternateDataStream.policyState,
          evidence: alternateDataStream.evidence,
          evidenceRoot: alternateDataStream.root,
          asOf
        }),
      "OCI_PATH_INVALID"
    );
  });

  it("blocks MEDIUM findings unless one exact, live exception is consumed", () => {
    const finding = {
      cveId: "CVE-2026-1000",
      packagePurl: packagePurl("api-dotnet"),
      severity: "MEDIUM"
    };
    const findings = new Map([["api-dotnet", [finding]]]);
    const blocked = createEvidenceFixture({ findingsByTarget: findings });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: blocked.policyState,
          evidence: blocked.evidence,
          evidenceRoot: blocked.root,
          asOf
        }),
      "OCI_VULNERABILITY_BLOCKED"
    );

    const permitted = createEvidenceFixture({
      findingsByTarget: findings,
      exceptions: [createException()]
    });
    expect(
      validateEvidence({
        policyState: permitted.policyState,
        evidence: permitted.evidence,
        evidenceRoot: permitted.root,
        asOf
      }).result
    ).toBe("UNSIGNED_EVIDENCE_STRUCTURALLY_VALID");
  });

  it("binds versionless PURLs exactly across SBOM, scan and exception evidence", () => {
    const versionlessPurl = "pkg:generic/api-dotnet";
    const versionlessFinding = {
      cveId: "CVE-2026-1000",
      packagePurl: versionlessPurl,
      severity: "MEDIUM"
    };
    const permitted = createEvidenceFixture({
      findingsByTarget: new Map([["api-dotnet", [versionlessFinding]]]),
      exceptions: [createException({ purl: versionlessPurl })],
      packagePurlsByTarget: new Map([["api-dotnet", versionlessPurl]])
    });
    expect(
      validateEvidence({
        policyState: permitted.policyState,
        evidence: permitted.evidence,
        evidenceRoot: permitted.root,
        asOf
      }).result
    ).toBe("UNSIGNED_EVIDENCE_STRUCTURALLY_VALID");

    const versionedFinding = {
      ...versionlessFinding,
      packagePurl: packagePurl("api-dotnet")
    };
    const mismatch = createEvidenceFixture({
      findingsByTarget: new Map([["api-dotnet", [versionedFinding]]]),
      exceptions: [createException({ purl: versionlessPurl })]
    });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: mismatch.policyState,
          evidence: mismatch.evidence,
          evidenceRoot: mismatch.root,
          asOf
        }),
      "OCI_VULNERABILITY_BLOCKED"
    );

    const identityMismatch = createEvidenceFixture({
      findingsByTarget: new Map([["api-dotnet", [versionedFinding]]]),
      packagePurlsByTarget: new Map([["api-dotnet", versionlessPurl]])
    });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: identityMismatch.policyState,
          evidence: identityMismatch.evidence,
          evidenceRoot: identityMismatch.root,
          asOf
        }),
      "OCI_FINDING_NOT_IN_SBOM"
    );
  });

  it("always blocks UNKNOWN severity and rejects unused exceptions", () => {
    const unknown = createEvidenceFixture({
      findingsByTarget: new Map([
        [
          "api-dotnet",
          [
            {
              cveId: "CVE-2026-1000",
              packagePurl: packagePurl("api-dotnet"),
              severity: "UNKNOWN"
            }
          ]
        ]
      ])
    });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: unknown.policyState,
          evidence: unknown.evidence,
          evidenceRoot: unknown.root,
          asOf
        }),
      "OCI_UNKNOWN_SEVERITY_BLOCKED"
    );

    const unused = createEvidenceFixture({ exceptions: [createException()] });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: unused.policyState,
          evidence: unused.evidence,
          evidenceRoot: unused.root,
          asOf
        }),
      "OCI_EXCEPTION_UNUSED"
    );
  });

  it("rejects broken attestation and evidence time bindings", () => {
    const attestation = createEvidenceFixture({
      mutateAttestation: (statement, targetId) => {
        if (targetId === "api-dotnet") statement.predicate.sourceTree = "c".repeat(40);
      }
    });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: attestation.policyState,
          evidence: attestation.evidence,
          evidenceRoot: attestation.root,
          asOf
        }),
      "OCI_ATTESTATION_BINDING_MISMATCH"
    );

    const profile = createEvidenceFixture({
      mutateAttestation: (statement, targetId) => {
        if (targetId === "api-dotnet") {
          statement.predicate.sbomProfile = "shiftflow.spdx-2.3-unrestricted/v1";
        }
      }
    });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: profile.policyState,
          evidence: profile.evidence,
          evidenceRoot: profile.root,
          asOf
        }),
      "OCI_ATTESTATION_BINDING_MISMATCH"
    );

    const timeOrder = createEvidenceFixture({
      scanTime: "2026-09-02T09:00:00.000Z",
      databaseTime: "2026-09-02T10:00:00.000Z"
    });
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: timeOrder.policyState,
          evidence: timeOrder.evidence,
          evidenceRoot: timeOrder.root,
          asOf
        }),
      "OCI_EVIDENCE_TIME_ORDER_INVALID"
    );
  });

  it("uses an internal policy snapshot and revalidates exception time windows", () => {
    const finding = {
      cveId: "CVE-2026-1000",
      packagePurl: packagePurl("api-dotnet"),
      severity: "MEDIUM"
    };
    const liveException = createException();
    const fixture = createEvidenceFixture({
      findingsByTarget: new Map([["api-dotnet", [finding]]]),
      exceptions: [liveException]
    });
    fixture.policyState.targetsById.clear();

    expect(
      validateEvidence({
        policyState: fixture.policyState,
        evidence: fixture.evidence,
        evidenceRoot: fixture.root,
        asOf
      }).result
    ).toBe("UNSIGNED_EVIDENCE_STRUCTURALLY_VALID");
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf: new Date("2026-10-01T12:00:00.000Z")
        }),
      "OCI_EXCEPTION_WINDOW_INVALID"
    );
    expectPolicyError(
      () =>
        validateEvidence({
          policyState: { ...fixture.policyState },
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        }),
      "OCI_POLICY_STATE_INVALID"
    );
  });

  it("rejects an exception decision created after its evidence envelope", () => {
    const lateException = createException();
    lateException.createdAt = "2026-09-02T11:45:00.000Z";
    const fixture = createEvidenceFixture({
      findingsByTarget: new Map([
        [
          "api-dotnet",
          [
            {
              cveId: "CVE-2026-1000",
              packagePurl: packagePurl("api-dotnet"),
              severity: "MEDIUM"
            }
          ]
        ]
      ]),
      exceptions: [lateException]
    });

    expectPolicyError(
      () =>
        validateEvidence({
          policyState: fixture.policyState,
          evidence: fixture.evidence,
          evidenceRoot: fixture.root,
          asOf
        }),
      "OCI_EXCEPTION_POSTDATES_EVIDENCE"
    );
  });
});

describe("OCI policy CLI", () => {
  it("emits one deterministic, non-production policy result", () => {
    const first = [];
    const second = [];
    const argumentsList = [
      "--policy-only",
      "--targets",
      "eng/oci-targets.json",
      "--exceptions",
      "eng/oci-cve-exceptions.json"
    ];

    expect(
      runCli(argumentsList, { cwd: repositoryRoot, asOf, stdout: (line) => first.push(line) })
    ).toBe(0);
    expect(
      runCli(argumentsList, { cwd: repositoryRoot, asOf, stdout: (line) => second.push(line) })
    ).toBe(0);
    expect(second).toEqual(first);
    expect(JSON.parse(first[0])).toMatchObject({
      result: "POLICY_VALID",
      classification: "LOCAL_UNSIGNED_PRECURSOR",
      sbomProfile: "shiftflow.spdx-2.3-oci-package-profile/v1",
      evidenceStatus: "NOT_EVALUATED",
      targetCount: 7
    });
  });

  it("runs the real Node entrypoint and emits exactly one policy result", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(repositoryRoot, "scripts", "verify-oci-supply-chain.mjs"),
        "--policy-only",
        "--targets",
        "eng/oci-targets.json",
        "--exceptions",
        "eng/oci-cve-exceptions.json"
      ],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    const outputLines = result.stdout.trim().split(/\r?\n/u);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(outputLines).toHaveLength(1);
    expect(JSON.parse(outputLines[0])).toMatchObject({
      result: "POLICY_VALID",
      evidenceStatus: "NOT_EVALUATED"
    });
  });

  it.skipIf(process.platform === "win32")(
    "runs through a symbolic-link entrypoint without silently skipping validation",
    () => {
      const root = mkdtempSync(join(tmpdir(), "shiftflow-oci-entrypoint-"));
      temporaryRoots.add(root);
      const linkedEntrypoint = join(root, "verify-oci-supply-chain.mjs");
      symlinkSync(join(repositoryRoot, "scripts", "verify-oci-supply-chain.mjs"), linkedEntrypoint);

      const result = spawnSync(
        process.execPath,
        [
          linkedEntrypoint,
          "--policy-only",
          "--targets",
          "eng/oci-targets.json",
          "--exceptions",
          "eng/oci-cve-exceptions.json"
        ],
        { cwd: repositoryRoot, encoding: "utf8" }
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({ result: "POLICY_VALID" });
    }
  );

  it("rejects an oversized policy file through the bounded reader", () => {
    const root = mkdtempSync(join(tmpdir(), "shiftflow-oci-oversized-"));
    temporaryRoots.add(root);
    const oversizedPath = join(root, "oversized.json");
    writeFileSync(oversizedPath, Buffer.alloc(5 * 1024 * 1024 + 1, 0x20));
    const errors = [];

    expect(
      runCli(["--policy-only", "--targets", oversizedPath, "--exceptions", exceptionPath], {
        cwd: repositoryRoot,
        asOf,
        stderr: (line) => errors.push(line)
      })
    ).toBe(1);
    expect(JSON.parse(errors[0])).toMatchObject({ code: "OCI_ARTIFACT_TOO_LARGE" });
  });

  it("redacts unexpected file failures", () => {
    const secretPath = "do-not-echo-this-sensitive-path.json";
    const errors = [];
    const exitCode = runCli(
      ["--policy-only", "--targets", secretPath, "--exceptions", "eng/oci-cve-exceptions.json"],
      { cwd: repositoryRoot, asOf, stderr: (line) => errors.push(line) }
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      JSON.stringify({ status: "failed", code: "OCI_UNEXPECTED_FAILURE", location: "internal" })
    ]);
    expect(errors[0]).not.toContain(secretPath);
  });
});
