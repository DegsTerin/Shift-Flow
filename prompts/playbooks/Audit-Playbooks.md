# Audit Playbooks

Select one audit mode. An audit request authorises inspection and reporting; implementation requires explicit correction/execution authority.

## Mode A - Full project audit

### Objective

Compare current requirements and canonical documentation with the actual repository and runtime behaviour.

### Method

1. Inventory current requirements and relevant historical context.
2. Locate the implementation for each requirement.
3. Classify it as implemented, partial, missing, incorrect, conflicting, obsolete, or unverifiable.
4. Inspect architecture, database, backend, frontend, APIs, integrations, auth/RBAC, tenant scope, tests, release, security, UI/UX, and operations as applicable.
5. Check for overwritten requirements, dead paths, duplicate implementations, and abandoned flows.
6. Validate important behaviour with code, tests, database/runtime checks, and rendered UI rather than documentation alone.

### Required report

- Implemented requirements.
- Partial or missing requirements.
- Incorrect/conflicting/obsolete implementation.
- Bugs and severity.
- Evidence by file, command, runtime, or visual inspection.
- Recommended correction and affected layer/state.
- Residual risks and open questions.

## Mode B - Human CI deep inspection

Use for line-by-line or judgement-heavy review.

Inspect:

- Architecture, coupling, duplication, maintainability, and failure paths.
- Schema integrity, migrations, tenancy, deletion, audit, and concurrency.
- API validation, errors, auth, RBAC, secret handling, and observability.
- UI flows, accessibility, responsiveness, feedback, and data correctness.
- Tests, CI, scripts, runtime operations, release, and documentation accuracy.

Every finding includes file/line or scope, description, real impact, severity, technical/business risk, recommended correction, ideal correction, and verifiable evidence.

## Mode C - Prompt-system audit

Run after a structural/version change or before declaring the corpus conflict-free.

Validate:

- Exactly 17 active `.md` files match the manifest in `../Start-Here.md`.
- Current state, snapshot, version, and changelog agree.
- Authority is declared only in canonical core files.
- Relative links resolve and no active file references removed legacy paths.
- Phase, module, tooling, gate, and post-release rules do not conflict.
- Historical documents clearly state that they are not current authority.
- Active files use real Markdown headings and descriptive names.
- No repeated global policy block has reappeared in phase/module/playbook files.
- Additions and removals have an explicit migration mapping.

## Severity

- Critical: data/security/state/release integrity failure or unusable core flow.
- High: major functional, tenant, permission, migration, or operational failure.
- Medium: meaningful defect with bounded workaround or maintainability risk.
- Low: local quality, clarity, or consistency issue with low immediate impact.

## Execution and correction

- Diagnostic request: report only.
- “Execute”, “fix”, or equivalent explicit authority: correct objective findings within scope, validate proportionally, update current evidence, and commit.
- A finding requiring broader product decisions remains a recommendation until the user authorises the expansion.

## Approval

An audit is approved only when the requested scope was actually inspected, critical claims have evidence, limitations are explicit, and unresolved critical/high findings are not presented as success.
