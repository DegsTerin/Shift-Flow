# Project Snapshot

## Operational state

- Project: ShiftFlow
- Current state: `STATE-08 PRODUCTION_RELEASE`
- Prompt-system version: `6.0.0`
- Active prompt files: 17
- Snapshot date: `2026-08-28`

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
- One executable development entry point provides read-only diagnosis, locked
  setup, `NON_GATE` quick feedback, deterministic plans and a canonical
  runtime-credential-free core gate shared with GitHub Actions.
- The whole-project corrective audit is locally complete at implementation
  commit `7e7fcdb5a0a75d1fbda3d9528d86f76f20f7a92e`. Tenant/global identity and RBAC
  mutation boundaries, transactional activity/task-board/dashboard evidence,
  remote-reference pagination, session-epoch UI guards, accessibility and
  runtime-test isolation have focused regression coverage.

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
- Executable plan: `../../PLANS.md`, which records active work and evidence but
  has no authority to change state or gates.
- Development contract: `../../docs/PROJECT-SETUP.md` and `../../eng/`.

## Active risks and external dependencies

- Remote Git configuration and external deployment targets depend on environment information outside this repository.
- Only the primary worktree is present and no parallel branch/worktree workflow is authorised; simultaneous work is read-only and file writing remains sequential in the coordinating conversation.
- Language governance does not determine or change interface locale, translation catalogues, microcopy, or user-visible error language.
- Local E2E and load checks require a freshly provisioned disposable database,
  ephemeral runtime credentials, an available local Chrome executable and free
  isolated ports; they must not reuse developer data or services.
- Remote environments must receive locally approved migrations through their deployment pipeline.
- Physical-device and real-TV visual checks remain environment-dependent.
- Attachment storage and distributed rate limiting require production infrastructure choices when scaling beyond the current deployment model.
- The corrective audit's local gates and disposable PostgreSQL/browser envelope
  passed, but that evidence is not production approval, deployment evidence, a
  Human Gate decision or a lifecycle transition.
- Prisma `relationJoins` preview support is enabled for the filtered Activity
  graph so one PostgreSQL query replaces relation fan-out on a single
  transaction connection. It must remain regression-tested and be reassessed
  when Prisma changes or stabilises the feature.
- `deepmerge-ts` is pinned to patched version `8.0.0` through a focused npm
  override because Prisma 7.10 still pins the vulnerable 7.x line. Keep the
  override regression-tested and remove it when Prisma adopts a patched
  compatible dependency.

## Prompt-system consolidation evidence

- The former 75-file active corpus was consolidated into 17 active files.
- Version 3.0.0 adds repository routing and safe-concurrency governance without adding an 18th active prompt.
- Version 4.0.0 centralises language governance in `Governance.md`, requires `pt-BR` owner delivery with a next step and copy-ready message, and archives adoption sources without adding an 18th active prompt.
- Version 4.1.0 adds advisory reasoning recommendations for each new or resumed conversation, governed handoff, and worker start message while preserving the existing authority, isolation, and parallel-work rules.
- Version 5.0.0 replaces unconditional continuation fields with action-based delivery: ordinary responses omit inapplicable fields, while governed handoffs preserve their complete contract.
- Version 5.0.1 clarifies that every authorised file-changing activity ends with an automatic scoped local commit after validation, without a second request or implied remote action.
- Version 5.1.0 adopts an executable-plan and development-loop capability with
  `Doctor`, `Setup`, `Quick`, `Full` and `PlanOnly`, while preserving the
  17-file corpus, `STATE-08` and separate runtime/lifecycle evidence.
- Version 6.0.0 replaces only the governed hand-off's extended routing contract
  with the compact RAG-Challenge structure: a result summary followed by the
  uninterrupted conversation, copy-ready title, reasoning, parallelism and
  copy-ready payload sequence. Ordinary-delivery triggers, worker controls,
  lifecycle authority and the 17-file corpus remain unchanged.
- Full pre-consolidation audit, delivery, state, snapshot, and version material is preserved under `../../docs/history/`.
- No project state transition resulted from the documentation reorganisation.
- The 17-file manifest and migration map are recorded in `../Start-Here.md`, `Prompt-System-Change-Log.md`, and `../../docs/governance-index.md`.

## Update rule

Keep this snapshot limited to current facts, risks, blockers, and evidence pointers. Put chronological narratives in the changelog, transition log, or `docs/history/`.
