// en-GB: Verifies that ephemeral OCI evidence is bound to its image and blocks policy findings.
import { describe, expect, it } from "vitest";
import {
  OciRuntimeEvidenceError,
  validateRuntimeEvidence
} from "./verify-oci-runtime-evidence.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const analysisDigest = `sha256:${"b".repeat(64)}`;
const sourceCommit = "c".repeat(40);
const subjectRef = `shiftflow-local/api-dotnet:${sourceCommit}`;
const buildType = "https://mobyproject.org/buildkit@v1";

function fixture() {
  return {
    targets: {
      policy: {
        platform: "linux/amd64",
        minimumBlockedSeverity: "MEDIUM",
        blockUnknownSeverity: true
      },
      targets: [
        {
          id: "api-dotnet",
          sourceKind: "build",
          context: ".",
          dockerfile: "apps/api-dotnet/Dockerfile",
          target: "runtime"
        }
      ]
    },
    targetId: "api-dotnet",
    sourceKind: "build",
    sourceCommit,
    subjectRef,
    sbom: {
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      documentNamespace: "https://shiftflow.local/spdx/api-dotnet",
      creationInfo: { creators: ["Tool: trivy-0.74.0"] },
      packages: [
        {
          SPDXID: "SPDXRef-ContainerImage",
          primaryPackagePurpose: "CONTAINER",
          externalRefs: [
            {
              referenceCategory: "PACKAGE-MANAGER",
              referenceType: "purl",
              referenceLocator: `pkg:oci/api-dotnet@${encodeURIComponent(digest)}`
            }
          ]
        }
      ],
      relationships: [
        {
          spdxElementId: "SPDXRef-DOCUMENT",
          relatedSpdxElement: "SPDXRef-ContainerImage",
          relationshipType: "DESCRIBES"
        }
      ],
      SPDXID: "SPDXRef-DOCUMENT"
    },
    scan: {
      SchemaVersion: 2,
      ArtifactType: "container_image",
      ArtifactName: subjectRef,
      ArtifactID: analysisDigest,
      Metadata: {
        ImageID: digest,
        RepoDigests: [`shiftflow-local/api-dotnet@${digest}`],
        ImageConfig: { os: "linux", architecture: "amd64" }
      },
      Results: []
    },
    provenance: {
      // Normalised projection of native Buildx max metadata; no invented envelope or config digest.
      "buildx.build.provenance": {
        buildType,
        materials: [{ uri: "pkg:docker/dotnet/aspnet", digest: { sha256: "d".repeat(64) } }],
        buildConfig: { llbDefinition: [] },
        invocation: {
          configSource: { entryPoint: "Dockerfile" },
          parameters: { frontend: "dockerfile.v0", args: { target: "runtime" } },
          environment: { platform: "linux/amd64" }
        },
        metadata: {
          completeness: { parameters: true },
          [`${buildType}#metadata`]: {
            vcs: {
              revision: sourceCommit,
              source: "https://github.com/DegsTerin/Shift-Flow.git",
              "localdir:context": ".",
              "localdir:dockerfile": "apps/api-dotnet"
            }
          }
        }
      },
      "containerimage.digest": digest,
      "containerimage.descriptor": { digest, mediaType: "application/vnd.oci.image.index.v1+json" }
    }
  };
}

describe("OCI runtime evidence", () => {
  it.each([
    "https://github.com/DegsTerin/Shift-Flow",
    "https://github.com/DegsTerin/Shift-Flow.git"
  ])("accepts the exact canonical checkout origin %s", (source) => {
    const evidence = fixture();
    evidence.provenance["buildx.build.provenance"].metadata[`${buildType}#metadata`].vcs.source =
      source;
    expect(validateRuntimeEvidence(evidence).result).toBe("RUNTIME_EVIDENCE_VALID");
  });

  it.each([
    "https://github.com/other/Shift-Flow",
    "https://github.com/DegsTerin/other",
    "https://example.invalid/DegsTerin/Shift-Flow",
    "http://github.com/DegsTerin/Shift-Flow",
    "https://user@github.com/DegsTerin/Shift-Flow",
    "https://github.com/DegsTerin/Shift-Flow?x=1",
    "https://github.com/DegsTerin/Shift-Flow#x",
    "https://github.com/DegsTerin/Shift-Flow.git.extra",
    "https://github.com/DegsTerin/Shift-Flow/"
  ])("rejects non-canonical origin %s", (source) => {
    const evidence = fixture();
    evidence.provenance["buildx.build.provenance"].metadata[`${buildType}#metadata`].vcs.source =
      source;
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_PROVENANCE_INVALID");
  });

  it("accepts locally generated SBOM, scan and build provenance bound to one subject", () => {
    expect(validateRuntimeEvidence(fixture())).toEqual({
      result: "RUNTIME_EVIDENCE_VALID",
      targetId: "api-dotnet",
      sourceKind: "build",
      subjectRef,
      packageCount: 1
    });
  });

  it("blocks a medium vulnerability without returning package or advisory data", () => {
    const evidence = fixture();
    evidence.scan.Results = [{ Vulnerabilities: [{ Severity: "MEDIUM", VulnerabilityID: "X" }] }];

    expect(() => validateRuntimeEvidence(evidence)).toThrowError(
      expect.objectContaining({
        code: "OCI_RUNTIME_VULNERABILITY_BLOCKED",
        location: "scan.Results[0].Vulnerabilities[0]"
      })
    );
  });

  it("rejects provenance that is not bound to the scanned image", () => {
    const evidence = fixture();
    evidence.scan.Metadata.ImageID = `sha256:${"d".repeat(64)}`;

    expect(() => validateRuntimeEvidence(evidence)).toThrowError(OciRuntimeEvidenceError);
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_PROVENANCE_INVALID");
  });

  it("rejects a build tag that names a different commit", () => {
    const evidence = fixture();
    evidence.subjectRef = `shiftflow-local/api-dotnet:${"d".repeat(40)}`;
    evidence.scan.ArtifactName = evidence.subjectRef;

    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_SUBJECT_INVALID");
  });

  it("rejects build evidence without the workflow source commit", () => {
    const evidence = fixture();
    delete evidence.sourceCommit;

    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_SUBJECT_INVALID");
  });

  it("rejects an SPDX document describing a different image digest", () => {
    const evidence = fixture();
    evidence.sbom.packages[0].externalRefs[0].referenceLocator = `pkg:oci/api-dotnet@${encodeURIComponent(`sha256:${"e".repeat(64)}`)}`;

    expect(() => validateRuntimeEvidence(evidence)).toThrowError(
      "OCI_RUNTIME_SBOM_SUBJECT_INVALID"
    );
  });

  it("accepts a digest-pinned registry subject without build provenance", () => {
    const evidence = fixture();
    const registrySubject = `nginx:1.29.1-alpine@${digest}`;
    evidence.targets.targets = [{ id: "nginx", sourceKind: "registry", image: registrySubject }];
    evidence.targetId = "nginx";
    evidence.sourceKind = "registry";
    evidence.subjectRef = registrySubject;
    evidence.scan.ArtifactName = registrySubject;
    evidence.scan.Metadata.ImageID = `sha256:${"d".repeat(64)}`;
    evidence.scan.Metadata.RepoDigests = [`nginx@${digest}`];
    delete evidence.provenance;
    delete evidence.sourceCommit;

    expect(validateRuntimeEvidence(evidence)).toMatchObject({
      result: "RUNTIME_EVIDENCE_VALID",
      targetId: "nginx",
      sourceKind: "registry",
      subjectRef: registrySubject
    });
  });

  it("rejects a registry subject carrying a build-only source commit", () => {
    const evidence = fixture();
    const registrySubject = `nginx:1.29.1-alpine@${digest}`;
    evidence.targets.targets = [{ id: "nginx", sourceKind: "registry", image: registrySubject }];
    evidence.targetId = "nginx";
    evidence.sourceKind = "registry";
    evidence.subjectRef = registrySubject;
    evidence.scan.ArtifactName = registrySubject;
    delete evidence.provenance;

    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_SUBJECT_INVALID");
  });

  it.each(["UNKNOWN", "HIGH", "CRITICAL"])("blocks a %s vulnerability", (severity) => {
    const evidence = fixture();
    evidence.scan.Results = [{ Vulnerabilities: [{ Severity: severity }] }];
    expect(() => validateRuntimeEvidence(evidence)).toThrowError(
      "OCI_RUNTIME_VULNERABILITY_BLOCKED"
    );
  });

  it("does not confuse Trivy's analysis identity with the image identity", () => {
    const evidence = fixture();
    evidence.scan.ArtifactID = `sha256:${"f".repeat(64)}`;
    expect(validateRuntimeEvidence(evidence).result).toBe("RUNTIME_EVIDENCE_VALID");
  });

  it.each([undefined, "", "d".repeat(40), `${sourceCommit}-dirty`])(
    "rejects missing, mismatched or dirty source provenance (%s)",
    (revision) => {
      const evidence = fixture();
      evidence.provenance["buildx.build.provenance"].metadata[
        `${buildType}#metadata`
      ].vcs.revision = revision;
      expect(() => validateRuntimeEvidence(evidence)).toThrowError(
        "OCI_RUNTIME_PROVENANCE_INVALID"
      );
    }
  );

  it.each([
    [
      "empty predicate",
      (record) => {
        for (const key of Object.keys(record)) delete record[key];
      }
    ],
    [
      "wrong build type",
      (record) => {
        record.buildType = "https://example.invalid/build";
      }
    ],
    [
      "missing maximum build configuration",
      (record) => {
        delete record.buildConfig;
      }
    ],
    [
      "missing materials",
      (record) => {
        record.materials = [];
      }
    ],
    [
      "wrong platform",
      (record) => {
        record.invocation.environment.platform = "linux/arm64";
      }
    ],
    [
      "wrong target",
      (record) => {
        record.invocation.parameters.args.target = "migration";
      }
    ],
    [
      "wrong entry point",
      (record) => {
        record.invocation.configSource.entryPoint = "other.Dockerfile";
      }
    ],
    [
      "wrong repository",
      (record) => {
        record.metadata[`${buildType}#metadata`].vcs.source = "https://example.invalid/repo.git";
      }
    ],
    [
      "wrong Dockerfile directory",
      (record) => {
        record.metadata[`${buildType}#metadata`].vcs["localdir:dockerfile"] = "infra/docker";
      }
    ],
    [
      "wrong context",
      (record) => {
        record.metadata[`${buildType}#metadata`].vcs["localdir:context"] = "other";
      }
    ]
  ])("rejects raw provenance with %s", (_label, mutate) => {
    const evidence = fixture();
    mutate(evidence.provenance["buildx.build.provenance"]);
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_PROVENANCE_INVALID");
  });

  it("normalises native Windows Dockerfile paths without changing their identity", () => {
    const evidence = fixture();
    evidence.provenance["buildx.build.provenance"].metadata[`${buildType}#metadata`].vcs[
      "localdir:dockerfile"
    ] = "apps\\api-dotnet";
    expect(validateRuntimeEvidence(evidence).result).toBe("RUNTIME_EVIDENCE_VALID");
  });

  it("rejects the old fabricated in-toto-envelope shape", () => {
    const evidence = fixture();
    evidence.provenance["buildx.build.provenance"] = {
      _type: "https://in-toto.io/Statement/v0.1",
      predicate: evidence.provenance["buildx.build.provenance"]
    };
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_PROVENANCE_INVALID");
  });

  it("rejects a descriptor that does not identify the exported image", () => {
    const evidence = fixture();
    evidence.provenance["containerimage.descriptor"].digest = analysisDigest;
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_PROVENANCE_INVALID");
  });

  it.each([
    { references: [] },
    { references: [`shiftflow-local/other@${digest}`] },
    { references: [`shiftflow-local/api-dotnet@${analysisDigest}`] }
  ])("rejects missing or unrelated scan repository bindings ($references)", ({ references }) => {
    const evidence = fixture();
    evidence.scan.Metadata.RepoDigests = references;
    expect(() => validateRuntimeEvidence(evidence)).toThrowError(
      "OCI_RUNTIME_SCAN_SUBJECT_INVALID"
    );
  });

  it("rejects an SPDX container bound only to the Trivy analysis digest", () => {
    const evidence = fixture();
    evidence.sbom.packages[0].externalRefs[0].referenceLocator = `pkg:oci/api-dotnet@${analysisDigest}`;
    expect(() => validateRuntimeEvidence(evidence)).toThrowError(
      "OCI_RUNTIME_SBOM_SUBJECT_INVALID"
    );
  });

  it("rejects a scan of the wrong platform", () => {
    const evidence = fixture();
    evidence.scan.Metadata.ImageConfig.architecture = "arm64";
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_SCAN_INVALID");
  });

  it("rejects registry reports not bound to the policy's pinned image", () => {
    const evidence = fixture();
    const registrySubject = `nginx:1.29.1-alpine@${digest}`;
    evidence.targets.targets = [{ id: "nginx", sourceKind: "registry", image: registrySubject }];
    evidence.targetId = "nginx";
    evidence.sourceKind = "registry";
    evidence.subjectRef = registrySubject;
    evidence.scan.ArtifactName = registrySubject;
    evidence.scan.Metadata.RepoDigests = [`nginx@${analysisDigest}`];
    delete evidence.provenance;
    delete evidence.sourceCommit;
    expect(() => validateRuntimeEvidence(evidence)).toThrowError(
      "OCI_RUNTIME_SCAN_SUBJECT_INVALID"
    );
  });
});
