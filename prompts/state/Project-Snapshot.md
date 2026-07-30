# Project Snapshot

## Operational state

- Project: ShiftFlow
- Current state: `STATE-08 PRODUCTION_RELEASE`
- Prompt-system version: `5.0.0`
- Active prompt files: 17
- Snapshot date: `2026-07-30`

## Current architecture

- Modular monorepo with Next.js web, Express API, PostgreSQL, and Prisma.
- Backend modules use route, controller, validator, service, repository, and DTO boundaries.
- Authentication uses JWT access tokens and refresh-token rotation.
- RBAC and tenant/company scope are enforced by middleware and services.
- Structured request logging and readiness/liveness endpoints are present.
- Canonical architecture: `../../docs/architecture.md`.

## Implemented operating capabilities

- Authentication, users, teams, clients, shifts, activities, comments, notifications, reports, audit, RBAC, dashboard, and operational Kanban.
- Internal activity task boards and immutable operational history.
- Responsive web interface, i18n, light/dark themes, and TV-oriented views where implemented.
- Release, E2E, accessibility, load, security, source-comment, and quality scripts documented by the repository.

## Current controls

- Prompt entrypoint: `../Start-Here.md`.
- State authority: `../core/Official-State-Machine.md`.
- Global constraints: `../core/Governance.md`.
- Owner communication and project-owned artefact language: `../core/Governance.md#language-policy`.
- Gates: `../core/Quality-Gates.md`.
- Conversation coordination and safe parallel work: `../core/Execution-Protocol.md`.
- Repository routing adapter: `../../AGENTS.md`.
- Historical governance-adoption sources: `../../docs/history/sources/`.
- Runtime truth for local services: `scripts/status.ps1` plus HTTP health checks.
- Governance index: `../../docs/governance-index.md`.

## Active risks and external dependencies

- Remote Git configuration and external deployment targets depend on environment information outside this repository.
- Only the primary worktree is present and no parallel branch/worktree workflow is authorised; simultaneous work is read-only and file writing remains sequential in the coordinating conversation.
- Language governance does not determine or change interface locale, translation catalogues, microcopy, or user-visible error language.
- Local E2E and load checks require seeded data, valid runtime credentials, and available services/ports.
- Remote environments must receive locally approved migrations through their deployment pipeline.
- Physical-device and real-TV visual checks remain environment-dependent.
- Attachment storage and distributed rate limiting require production infrastructure choices when scaling beyond the current deployment model.

## Prompt-system consolidation evidence

- The former 75-file active corpus was consolidated into 17 active files.
- Version 3.0.0 adds repository routing and safe-concurrency governance without adding an 18th active prompt.
- Version 4.0.0 centralises language governance in `Governance.md`, requires `pt-BR` owner delivery with a next step and copy-ready message, and archives adoption sources without adding an 18th active prompt.
- Version 4.1.0 adds advisory reasoning recommendations for each new or resumed conversation, governed handoff, and worker start message while preserving the existing authority, isolation, and parallel-work rules.
- Version 5.0.0 replaces unconditional continuation fields with action-based delivery: ordinary responses omit inapplicable fields, while governed handoffs preserve their complete contract.
- Full pre-consolidation audit, delivery, state, snapshot, and version material is preserved under `../../docs/history/`.
- No project state transition resulted from the documentation reorganisation.
- The 17-file manifest and migration map are recorded in `../Start-Here.md`, `Prompt-System-Change-Log.md`, and `../../docs/governance-index.md`.

## Update rule

Keep this snapshot limited to current facts, risks, blockers, and evidence pointers. Put chronological narratives in the changelog, transition log, or `docs/history/`.
