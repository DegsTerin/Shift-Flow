# Project Snapshot

## Operational state

- Project: ShiftFlow
- Current state: `STATE-08 PRODUCTION_RELEASE`
- Prompt-system version: `2.0.0`
- Active prompt files: 17
- Snapshot date: `2026-07-11`

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
- Gates: `../core/Quality-Gates.md`.
- Runtime truth for local services: `scripts/status.ps1` plus HTTP health checks.
- Governance index: `../../docs/governance-index.md`.

## Active risks and external dependencies

- Remote Git configuration and external deployment targets depend on environment information outside this repository.
- Local E2E and load checks require seeded data, valid runtime credentials, and available services/ports.
- Remote environments must receive locally approved migrations through their deployment pipeline.
- Physical-device and real-TV visual checks remain environment-dependent.
- Attachment storage and distributed rate limiting require production infrastructure choices when scaling beyond the current deployment model.

## Prompt-system consolidation evidence

- The former 75-file active corpus was consolidated into 17 active files.
- Full pre-consolidation audit, delivery, state, snapshot, and version material is preserved under `../../docs/history/`.
- No project state transition resulted from the documentation reorganisation.
- The 17-file manifest and migration map are recorded in `../Start-Here.md`, `Prompt-System-Change-Log.md`, and `../../docs/governance-index.md`.

## Update rule

Keep this snapshot limited to current facts, risks, blockers, and evidence pointers. Put chronological narratives in the changelog, transition log, or `docs/history/`.
