# Audit Playbooks

Select one audit mode. An audit request authorises inspection and reporting; implementation requires explicit correction/execution authority. Owner-facing audit communication uses `pt-BR` and applies the conditional continuation rule from `../core/Execution-Protocol.md`. A newly persisted project report uses `en-GB` and is accompanied by a `pt-BR` owner summary.

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
- `AGENTS.md` and `Start-Here.md` route conversation coordination to the single authority in `core/Execution-Protocol.md`.
- `AGENTS.md` and `Start-Here.md` route language rules to the single authority in `core/Governance.md`; archived adoption sources are historical provenance only.
- Specialised standards and playbooks reference the canonical language policy without recreating it as a competing authority.
- Owner-facing labels, reports, handoffs, next steps, and ready-to-copy messages use `pt-BR`, while necessary literal identifiers and enums remain technically stable.
- Ordinary deliveries omit continuation fields when no owner action is required, include only a concrete next action when that is sufficient, and add a ready-to-copy message only when it materially helps; governed handoffs retain both canonical fields.
- No delivery manufactures waiting, no-authority, or no-further-action filler merely to populate a continuation template.
- New project-owned artefacts use `en-GB`; limited amendments preserve the existing file's language and dialect without opportunistic translation or spelling normalisation.
- Language-policy adoption does not rename existing identifiers or contracts, rewrite history, perform bulk translation, or infer an interface locale, catalogue, microcopy, or user-visible error language.
- Conversation and parallel-work enums, non-empty handoff fields, and real-message placeholder rules are consistent with authority, positive scope, negative scope, baseline, and routing action.
- New and resumed conversations, governed handoffs, and worker start messages use one supported owner-facing reasoning recommendation with a concrete rationale, and the recommendation follows the selection matrix in `Execution-Protocol.md`.
- `Máximo` remains the deepest substantially single-threaded recommendation, while `Ultra` is reserved for materially useful independent lanes and never bypasses delegation, ownership, isolation, or gate requirements.
- Reasoning-field uniqueness is enforced per conversation-level contract; separately delimited worker messages retain their own destination-specific recommendation without being treated as duplicates in the enclosing handoff.
- The common handoff, worker-start contract, non-recursive worker-return payload, and phase extension compose without duplicate or contradictory values.
- Internal environment identifiers are not presented as owner-confirmed user-visible conversation titles.
- No plan permits concurrent writers on the same path, logical artefact, or mutable resource.
- Stop conditions and the sequential fallback are complete, and `GATE-05` applies criteria according to `SEQUENTIAL_ONLY`, sequential delegation, parallel read-only lanes, or parallel writing.
- Parallel work remains free of every file, logical-artefact, runtime, cache, database, external-resource, or other mutation unless the authorised Git, branch, worktree, ownership, and resource-isolation prerequisites all hold.
- State, snapshot, history, changelog, ADR records, gate reports, integration, and Human Gates remain under coordinating-conversation custody and their canonical authorities.

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
