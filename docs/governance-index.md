# Governance Index

This index is the canonical map for ShiftFlow governance, delivery, and control documents.
Prefer updating the documents listed here instead of creating new root-level control files.

## Canonical Documents

- `README.md`: onboarding, local setup, platform control, and quality gates.
- `PLANS.md`: current executable plan, baseline, scope, increments and evidence
  for broad work; never authority, state or a gate decision.
- `CONTRIBUTING.md`: contribution flow and review expectations.
- `SECURITY.md`: vulnerability handling and security policy.
- `docs/architecture.md`: runtime architecture, module boundaries, observability, and security controls.
- `docs/development-standards.md`: engineering standards, naming, checks, review, versioning, and documentation rules.
- `docs/PROJECT-SETUP.md`: supported toolchain and the executable
  `Doctor`, `Setup`, `Quick`, `Full` and `PlanOnly` development contract.
- `docs/source-commenting-manifest.md`: source-comment coverage, placement, syntax exceptions, immutable-file rules, and automated enforcement; language selection remains in the canonical Governance policy.
- `docs/production-runbook.md`: production operations and incident handling.
- `docs/technical-roadmap.md`: planned technical evolution.
- `docs/attachment-storage-strategy.md`: approved boundary and remaining infrastructure decisions for attachment persistence.
- `docs/systematization-report.md`: systematization baseline, decisions, and remaining risks.
- `docs/adr/`: architecture decision records.
- `prompts/`: the 17 active, controlled Codex instruction artifacts.
- `docs/history/`: closed prompt-system, phase-validation, delivery, and state-transition evidence; never current instruction authority.

## Repository Instruction Routing

- `AGENTS.md`: repository-level routing adapter that requires `prompts/Start-Here.md` and points to the applicable canonical authorities.
- `prompts/core/Governance.md#language-policy`: single thematic authority for owner communication and project-owned artefact language.
- `prompts/core/Execution-Protocol.md`: single thematic authority for conversation routing, handoff, delegated lanes, ownership, isolation, and safe parallel work.
- `eng/development.ps1`, `eng/ci.ps1`, `eng/build.ps1`, and
  `eng/test-development-workflow.ps1`: executable development entry point,
  canonical runtime-credential-free core gate, metadata-preserving build
  wrapper and anti-drift policy test; these implement the canonical protocol
  but do not create authority.
- `docs/history/sources/language-policy.md`: preserved historical source for the version 4.0.0 language-policy adoption.
- `docs/history/sources/conversation-coordination-prompt.md`: preserved historical source for the version 3.0.0 coordination adoption.

The routing adapter and historical sources sit outside the 17-file active prompt corpus. Historical sources are not operational instructions, independent authorities, or automatic task authorisation. They must not duplicate or override canonical state, governance, gate, phase, module, or playbook authority.

## Prompt Control Files

The active prompt corpus is declared by `prompts/Start-Here.md` and contains exactly 17 Markdown files organised under `core/`, `state/`, `phases/`, `modules/`, and `playbooks/`. These files are controlled process artifacts and should remain stable unless a phase, state machine, audit process, or prompt protocol explicitly changes.

Load current instructions from `prompts/`. Consult `docs/history/` only when a task needs historical evidence. Historical files may quote superseded rules and paths and must not override the active corpus.

When a prompt control file is still required, keep it in the active manifest and reference it from the relevant canonical document. When a control becomes obsolete, consolidate it under `docs/history/` through a dedicated documentation-only change that records its replacement and impact.

## Change Rules

- Do not create another control document when an existing canonical document can be updated.
- Do not move or delete prompt control files without an impact review for references and automation.
- Keep phase/state/protocol changes separate from functional code changes.
- Record durable architectural decisions as ADRs under `docs/adr/`.
- Update this index whenever a governance source of truth changes.

## Prompt System Layout

- `prompts/Start-Here.md`: entrypoint, active manifest, version, and loading rules.
- `prompts/core/`: authority, state machine, execution protocol including conversation coordination and safe parallel work, and quality gates.
- `prompts/state/`: current state, current snapshot, rolling transition log, and prompt-system changelog.
- `prompts/phases/`: foundation, implementation, and delivery instructions.
- `prompts/modules/Modules.md`: canonical module catalogue and phase matrix.
- `prompts/playbooks/`: audit, security/access, maintenance/product, and UI/UX workflows.
- `docs/history/phase-validation-history.md`: consolidated Automatic Review, Human CI, and former prompt-system audit evidence.
- `docs/history/phase-delivery-history.md`: consolidated architecture, data-model, handoff, integration, homologation, and release evidence.
- `docs/history/state-transitions-2026.md`: consolidated pre-2.0 state, snapshot, transition, and version history.
- `docs/history/sources/`: preserved source texts that have already been incorporated into canonical governance and have no operational authority.

## Version 5.1 Governed Development Workflow

- Added `PLANS.md` as non-authoritative executable planning and evidence for
  broad or multi-step work without changing the 17-file active prompt corpus.
- Adopted the iterative audit, prioritisation, root-cause correction,
  regression, integration, measurement, documentation and retrospective loop.
- Added deterministic `Doctor`, `Setup`, `Quick`, `Full` and `PlanOnly`
  contracts with one runtime-credential-free core gate shared by local and remote CI.
- Added fail-closed worktree/index/candidate diff checks, Node.js 22/24 core
  lanes and per-run credentials for the separate disposable runtime job.
- Kept `Quick` explicitly `NON_GATE` and kept database, seed, runtime, E2E,
  load, browser, deployment, Human Gate and lifecycle evidence separate.
- Preserved `STATE-08 PRODUCTION_RELEASE`, existing authority, conditional
  owner delivery, writer isolation and automatic local-commit policy.

## Version 5.0.1 Automatic Local Commit Completion

- Clarified that authority for a repository file change includes its automatic, narrowly scoped local commit after validation.
- No separate commit request is required, and validated changes are not deferred to another task.
- Analysis-only work and activities with no file changes do not create empty commits; failed or blocked validation prevents completion and commit.
- Local-commit authority does not imply push, remote branch creation, pull request, release, deployment, or another external action.
- Preserved `STATE-08 PRODUCTION_RELEASE`, the 17-file active corpus, and all existing quality, language, reasoning, routing, and isolation boundaries.

## Version 5.0 Conditional Owner Continuation

- Superseded the version 4.0 unconditional continuation-field rule without changing the `pt-BR` owner-language authority.
- Ordinary deliveries omit continuation fields when no owner action is required.
- A concrete next action appears only when the owner must act; ready-to-copy text appears only when it materially helps that action.
- Governed handoffs retain both canonical continuation fields because they transfer context and require owner navigation or another explicit action.
- Filler messages about waiting, absent authority, or no further action are prohibited.
- Preserved `STATE-08 PRODUCTION_RELEASE`, the 17-file active corpus, reasoning-level guidance, interface-language boundaries, and all closed history.

## Version 4.0 Language-Policy Adoption

- Incorporated owner communication and project-owned artefact language into the existing `prompts/core/Governance.md` authority.
- Required every owner-facing delivery to use `pt-BR`, state the next step, and provide a complete ready-to-copy message.
- Preserved technical identifiers and external conventions without permitting avoidable English in owner communication.
- Kept new project-owned artefacts in `en-GB` while protecting the established language and dialect of existing files.
- Kept interface language and locale as separate product decisions.
- Moved the language-policy and conversation-coordination adoption sources from the repository root to `docs/history/sources/`.
- Preserved `STATE-08 PRODUCTION_RELEASE`, the 17-file active prompt corpus, ADR authority, Human Gates, and all closed history.

## Version 3.0 Coordination Adoption

- Added the repository `AGENTS.md` routing adapter without adding an 18th active prompt.
- Retained `Conversation-Coordination-Prompt.md` in place as governed adoption provenance.
- Assigned conversation coordination and safe parallel work to the existing `prompts/core/Execution-Protocol.md` authority.
- Preserved the State Machine, authority hierarchy, 17-file active manifest, ADR process, and Human Gate boundaries.
- Required parallel work to remain read-only unless an explicitly authorised, non-overlapping branch/worktree and mutable-resource isolation plan exists.

## Version 2.0 Legacy Mapping

The 75-file corpus was migrated as follows:

- `prompts/Start-Here.md`: absorbed `Start-Here.md`, `Prompt-System-Readme.md`, `Prompt-Index.md`, `Prompt-System-Version.md`, and `Prompt-System-Versioning-Policy.md`.
- `prompts/core/Governance.md`: absorbed `System-Guard-Rails.md`, `Conflict-Resolution-Policy.md`, `Controlled-Rollback-Policy.md`, and `Blocked-State-Protocol.md`.
- `prompts/core/Official-State-Machine.md`: absorbed `Official-State-Machine.md`, `Controlled-Phase-Execution-System.md`, `Canonical-State-And-Module-IDs.md`, and the authority/phase rules from `Module-Phase-Matrix.md`.
- `prompts/core/Execution-Protocol.md`: absorbed `Execution-Protocol.md`, `Allowed-Commands-By-State.md`, `Project-Memory-System.md`, the reusable part of `Phase-Handoff-Template.md`, and `Engineering-Multi-Agent-System.md`.
- `prompts/core/Quality-Gates.md`: absorbed `Acceptance-Criteria-By-State.md`, `Global-Definition-Of-Done.md`, `Evidence-Standard.md`, `Human-Gate-Validation-Checklist.md`, and `Automatic-Review-Audit.md`.
- `prompts/phases/Foundation-Phases.md`: absorbed `Project-Setup-Phase.md`, `Solution-Architecture-Phase.md`, and `Database-Modelling-Phase.md`.
- `prompts/phases/Implementation-Phases.md`: absorbed `Backend-Phase.md` and `Frontend-Phase.md`.
- `prompts/phases/Delivery-Phases.md`: absorbed `Integration-Phase.md`, `Testing-And-Homologation-Phase.md`, and `Production-Release-Phase.md`.
- `prompts/modules/Modules.md`: absorbed `Executive-Dashboard-Module.md`, `Operational-Kanban-Module.md`, `RBAC-Module.md`, `Shift-Management-Module.md`, `Team-Management-Module.md`, and the detailed module matrix.
- `prompts/playbooks/Audit-Playbooks.md`: absorbed `Prompt-Audit-Full.md`, `Prompt-Audit-Human-CI.md`, and the reusable checklist from `Prompt-System-Audit.md`.
- `prompts/playbooks/Security-Access-Playbooks.md`: absorbed `Prompt-Auth.md`, `Prompt-Password.md`, and `Prompt-Security.md`.
- `prompts/playbooks/Maintenance-Playbooks.md`: absorbed `Prompt-Adjustments.md`, `Prompt-Dashboard.md`, `Prompt-Systematization.md`, `Revision-Prompt.md`, and `Restructuring-Prompt.md`.
- `prompts/playbooks/Prompt-Interface-UI-UX.md`: preserved and moved `Prompt-Interface-UI-UX.md` while centralising shared policy.
- `prompts/state/`: focused and relocated `Current-State.md`, `Project-Snapshot.md`, `State-Transition-Log.md`, and `Prompt-System-Change-Log.md`.
- `docs/history/phase-validation-history.md`: preserves the eight `Automatic-Review-Audit-<Phase>.md` results, nine `Human-CI-Validation-<Phase>.md` results, and the original `Prompt-System-Audit.md`.
- `docs/history/phase-delivery-history.md`: preserves `Database-Modelling-Document.md`, `Solution-Architecture-Document.md`, `Integration-Execution-Report.md`, `Testing-Homologation-Report.md`, `Production-Release-Report.md`, and the original handoff file.
- `docs/history/state-transitions-2026.md`: preserves the original state, snapshot, transition, version, and prompt changelog records.
- `System-Reorganisation-Codex-Prompt.md`: removed after its reusable governance and normalisation rules were absorbed by the active corpus.

## Ownership Domains

- API and backend behavior: `apps/api`, `prisma`, API-related tests, and API operations docs.
- Web experience: `apps/web`, frontend tests, and UX-facing documentation.
- Delivery and operations: `.github`, `scripts`, `docker-compose.yml`, runbooks, and release gates.
- Governance: `docs`, `prompts`, ADRs, security, and contribution policy.

GitHub handle-based enforcement belongs in `.github/CODEOWNERS`. Keep the logical domains above aligned with CODEOWNERS as ownership changes.
