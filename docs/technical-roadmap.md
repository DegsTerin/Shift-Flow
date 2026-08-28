# Technical Roadmap

## Corrective Baseline Completed on 2026-08-28

- User and Role aggregate mutations use explicit locks and transaction-owned
  audit evidence. Direct Role assignment shares the lock/revalidation protocol,
  with real PostgreSQL concurrency regressions.
- Generic reference mutations qualify write predicates by tenant, while their
  list contracts use stable bounded pagination.
- Activity, internal task-board and dashboard aggregate writes are atomic, while
  dashboard and activity list reads use deterministic transaction snapshots.
- The Web now uses paginated remote references, session-epoch request guards,
  queued dashboard persistence, truthful capability controls and focused
  keyboard/accessibility regressions.
- The development workflow, dedicated PostgreSQL suite and homologation seed
  enforce their bounded prerequisites. Final E2E release and representative
  load evidence ran only inside a separately preflighted disposable envelope.

## Near Term

- Extend service-level and PostgreSQL integration coverage to the remaining API
  modules that mutate tenant-scoped data.
- Move audit evidence for remaining generic reference writes into the same
  transaction as the domain mutation, with a defined lock-order contract.
- Define and persist transaction-owned audit evidence for direct RBAC assignment
  commands without duplicating the User aggregate's role-change evidence.
- Add Playwright coverage for pointer drag and drop, task editing and
  role-management flows on representative desktop and mobile viewports.
- Introduce a typed Prisma access layer that reduces `unknown` usage while preserving generated-client loading.
- Add OpenAPI documentation for public API contracts.
- Split `record-modal.tsx` into entity-specific form/detail components.
- Split `page.tsx` into session, data-loading, layout, and view-routing hooks/components.
- Add request body size and route-specific rate-limit policies per route group.
- Add production deployment manifests for the selected hosting target.
- Define canonical timezone semantics for filters, lifecycle timestamps, reports
  and user-entered local date/time values.
- Monitor Prisma `relationJoins` preview behaviour and remove the preview flag
  only after an equivalent stable query strategy is validated.

## Mid Term

- Add centralised metrics export for latency, error rate, and domain events.
- Add audit dashboards for RBAC and cross-company access attempts.
- Add contract tests between `apps/web` and `apps/api`.
- Add migration rollback playbooks for high-risk schema changes.
- Add a security review checklist for authentication, refresh tokens, cookies, CORS, and tenant headers.
- Move rate limiting to a shared external store for horizontally scaled API deployments.
- Decide whether dashboard endpoints require a bundled read model or an explicit
  `asOf` contract instead of eventual consistency across separate HTTP calls.
- Design session-family revocation and durable task-column classification before
  introducing the corresponding schema migrations.
- Evaluate composite tenant constraints and partial unique indexes through new,
  forward-only migrations rather than changes to applied migration history.

## Long Term

- Split deployment units for web, API, and background jobs if operational load requires it.
- Add event-driven processing for notifications and long-running operational workflows.
- Add feature flags for controlled rollout of high-impact behaviour.
- Add SLOs and alerting policies for core operational flows.
- Continue architecture decision records under `docs/adr/`.
- Validate physical-device and real-TV behaviour against an authorised visual
  baseline before making Pixel Perfect or production-readiness claims.
