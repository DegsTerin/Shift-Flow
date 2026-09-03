// en-GB: Verifies that ephemeral OCI evidence is bound to its image and blocks policy findings.
import { describe, expect, it } from "vitest";
import {
  OciRuntimeEvidenceError,
  validateRuntimeEvidence
} from "./verify-oci-runtime-evidence.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const configDigest = `sha256:${"b".repeat(64)}`;
const subjectRef = `shiftflow-local/api-dotnet:${"c".repeat(40)}`;

function fixture() {
  return {
    targets: {
      policy: { minimumBlockedSeverity: "MEDIUM", blockUnknownSeverity: true },
      targets: [{ id: "api-dotnet", sourceKind: "build" }]
    },
    targetId: "api-dotnet",
    sourceKind: "build",
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
    scan: { SchemaVersion: 2, ArtifactName: subjectRef, ArtifactID: configDigest, Results: [] },
    provenance: {
      "buildx.build.provenance": {
        _type: "https://in-toto.io/Statement/v0.1",
        predicateType: "https://slsa.dev/provenance/v0.2",
        subject: [{ digest: { sha256: digest.slice("sha256:".length) } }],
        predicate: { buildType: "https://mobyproject.org/buildkit@v1" }
      },
      "containerimage.config.digest": configDigest,
      "containerimage.digest": digest,
      "containerimage.descriptor": { digest }
    }
  };
}

describe("OCI runtime evidence", () => {
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
    evidence.scan.ArtifactID = `sha256:${"d".repeat(64)}`;

    expect(() => validateRuntimeEvidence(evidence)).toThrowError(OciRuntimeEvidenceError);
    expect(() => validateRuntimeEvidence(evidence)).toThrowError("OCI_RUNTIME_PROVENANCE_INVALID");
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
    delete evidence.provenance;

    expect(validateRuntimeEvidence(evidence)).toMatchObject({
      result: "RUNTIME_EVIDENCE_VALID",
      targetId: "nginx",
      sourceKind: "registry",
      subjectRef: registrySubject
    });
  });
});
