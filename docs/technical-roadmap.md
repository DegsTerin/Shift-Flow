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
- The first ASP.NET Core strangler slice adds a locked .NET 10 modular host,
  tenant-scoped Audit reads through Npgsql, Redis-backed cache/session and
  fail-closed rate limiting, OpenAPI, non-root Linux images and a reversible
  Nginx allowlist. Prisma remains the sole migration owner and Express remains
  the authentication and fallback host.
- A disposable migration-profile smoke proves the real Nginx, JWT, PostgreSQL,
  Redis persistence, fail-closed loss and post-restart recovery, tenant
  isolation, sanitisation and data-protection container-recreation boundaries.
  This is local candidate evidence, not a cloud or production deployment.

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
- Extend the current migrated Audit OpenAPI document as each complete REST
  slice moves to ASP.NET Core, with compatibility tests before route promotion.
- Split `record-modal.tsx` into entity-specific form/detail components.
- Split `page.tsx` into session, data-loading, layout, and view-routing hooks/components.
- Add route-specific rate-limit policies per route group and move or retire the
  remaining Express process-local limiters before horizontal scaling.
- Select Azure or AWS, then add production deployment manifests, managed
  PostgreSQL/Redis, TLS/proxy trust, data-protection key storage and
  least-privilege runtime/migration identities for that target.
- Define canonical timezone semantics for filters, lifecycle timestamps, reports
  and user-entered local date/time values.
- Monitor Prisma `relationJoins` preview behaviour and remove the preview flag
  only after an equivalent stable query strategy is validated.

## Mid Term

- Add centralised metrics export for latency, error rate, and domain events.
- Add audit dashboards for RBAC and cross-company access attempts.
- Add contract tests between `apps/web` and `apps/api`.
- Add differential contract tests between Express and ASP.NET Core before each
  further Nginx allowlist promotion.
- Parameterise or allocate collision-safe host ports and edge subnets before
  allowing concurrent migration-profile runs on one Docker host. The current
  fixed loopback ports and trusted-proxy subnet are governed as sequential-only.
- Split root production dependencies by deployable workspace and adopt a
  minimal Next.js standalone runtime after measuring the resulting API/Web
  image contents and sizes. The current transition images intentionally favour
  compatibility and carry dependencies or source files not needed by each
  individual runtime.
- Add OCI vulnerability scanning, SBOM generation and attestation with an
  expiry-bound exception policy before treating the pinned PostgreSQL, Redis,
  Nginx, Node.js or ASP.NET Core images as production supply-chain evidence.
- Add migration rollback playbooks for high-risk schema changes.
- Add a security review checklist for authentication, refresh tokens, cookies, CORS, and tenant headers.
- Select an OAuth 2.0/OpenID Connect provider and approve forward-only external
  identity linking plus a BFF-versus-SPA session design before replacing the
  compatibility JWT bridge.
- Measure dashboard/reporting query composition and introduce GraphQL only if
  the observed read use case warrants a second API style; keep commands and
  authentication on REST.
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
