# ShiftFlow Architecture

## Overview

ShiftFlow uses a modular monorepo layout. Product surfaces live under `apps/`, infrastructure and database assets live under `prisma/`, reusable operational knowledge lives under `docs/`, and automated validation lives under `tests/` and `.github/workflows/`.

## Runtime Components

- `apps/web`: Next.js UI that communicates with the API through `NEXT_PUBLIC_API_BASE_URL`.
- `apps/api`: incumbent Express API with modules grouped by business capability.
- `apps/api-dotnet`: .NET 10 ASP.NET Core compatibility host with domain,
  application, infrastructure, API and test projects.
- `prisma`: PostgreSQL schema, migrations, and deterministic seed scripts.
- `infra/nginx`: same-origin edge that promotes only an explicit route
  allowlist to ASP.NET Core and sends all other traffic to Express or Next.js.
- `infra/render`: native Node.js demonstration entry point that serves the
  incumbent Express and Next.js applications from one provider-assigned HTTPS
  origin.
- Redis: distributed cache/session infrastructure, dependency readiness and
  fail-closed rate-limit state for migrated business traffic.
- `tests/e2e`: Playwright tests for homologation, accessibility, and load-oriented flows.

## Public Demonstration Runtime

The public Render demonstration is intentionally narrower than the controlled
strangler profile. A single Node.js listener routes `/api`, `/health` and
`/ready` to the compiled Express application and sends every other request to
the production Next.js handler. Managed PostgreSQL is its only runtime
dependency. This preserves the host-scoped refresh cookie, readable CSRF cookie
and canonical-origin checks without introducing a split Web/API hostname.

The demonstration does not run ASP.NET Core, Redis or Nginx and therefore does
not provide deployment evidence for the migrated Audit slice. Those components
remain governed by the disposable local/CI migration profile until a separate
production topology is approved. Prisma remains the only migration owner in
both shapes, and the application start command never applies migrations or
seeds.

## Incremental Backend Migration

The backend follows the strangler decision in
[`ADR-0002`](adr/0002-aspnet-core-strangler.md). Express remains responsible for
authentication and every business route except the read-only Audit slice.
Nginx routes `GET /api/audit`, `GET /api/audit/{id}` and `/openapi/` to ASP.NET
Core through an explicit allowlist; removing that allowlist returns traffic to
Express without a data migration.

The ASP.NET Core host preserves the existing REST envelopes, error codes,
pagination, request correlation and tenant isolation. Its current boundaries
are:

- `ShiftFlow.Domain`: framework-independent Audit records.
- `ShiftFlow.Application`: use-case contracts and page/filter models.
- `ShiftFlow.Infrastructure`: literal reads of the existing PostgreSQL schema,
  live principal/RBAC validation, Redis infrastructure and readiness probes.
- `ShiftFlow.Api`: HTTP, JWT compatibility, authorisation, OpenAPI, session,
  rate-limit and health composition.

Prisma remains the only owner of schema and forward migrations. Npgsql may read
the approved schema but must not introduce a second migration history. REST is
the canonical API style. GraphQL is deferred until measurements identify a
specific composed dashboard/reporting read model that improves on REST without
moving commands or authentication into a second public contract.

The current HS256 JWT is a temporary compatibility bridge, not the target
identity architecture. OAuth 2.0/OpenID Connect requires an explicit identity
provider decision, an account-linking migration and a separate BFF-versus-SPA
decision. The implementation remains provider-neutral between Azure and AWS;
neither cloud is selected and no local container evidence is deployment
evidence.

## Activity Task Boards

Activities can own an internal task board that is independent from the main operational Kanban. The main Kanban continues to move `Activity` records across `ActivityStatus` values, while the internal board stores task-level workflow under the activity:

- `ActivityTaskColumn`: activity-scoped columns with persisted order and optional color.
- `ActivityTask`: task cards linked to an activity and column, with assignee, priority, labels, attachment references, archived/completed timestamps, and persisted order.
- `ActivityTaskHistory`: movement and lifecycle history for task changes.

The API exposes the board through nested activity routes under `/api/activities/:id/task-board`. This keeps ownership and tenant scoping in the activities module and avoids creating a disconnected task module.

## Data Model Invariants

- Company scope is explicit for tenant-owned operational records and is revalidated by backend services.
- Activities are operational dossiers with client, system/service, responsibility, status, priority, lifecycle timestamps, comments, attachments, task boards, audit, and chronological history.
- Operational and audit history is append-only; mutable records use soft delete where deletion must not erase historical evidence.
- Roles, permissions, memberships, and assignments are company-aware. Inactive roles and memberships do not grant access.
- Refresh sessions retain an active company context and are consumed through a
  conditional single-use rotation. User, company, membership and credential
  lifecycle state is revalidated before a successor is issued. Route
  authorisation independently queries current RBAC assignments.
- Teams and clients use active-record uniqueness rules where names or codes may be reused after logical deletion; user e-mail uniqueness follows the authentication contract.
- Migrations are forward-only. Applied migration files remain immutable and remote environments receive approved migrations through deployment pipelines.

## RBAC Profile Management

Profiles are represented by `Role` records and remain enforced by backend RBAC
checks. Role management supports profile colour, active/inactive state,
permission assignment, duplication and guarded deletion. Tenant and system
identity fields are derived by the server and are not mutable through public
profile or permission contracts. System profiles cannot be edited, duplicated,
deleted or have their permissions changed through ordinary tenant endpoints.
Global scope remains reserved for controlled system/bootstrap records. A
profile with active assignments cannot change scope without first resolving
those assignments.
Roles with active user assignments cannot be deleted; assignments that have not
started, have expired, belong to an inactive tenant lifecycle or reference an
inactive role do not grant permissions.

The current product interface creates and mutates company-scoped profiles only.
System profiles and existing client- or team-scoped profiles are read-only in
that interface. Limited profiles remain API-level capabilities that are not
product-homologated until routes can derive trustworthy resource context and a
dedicated assignment editor can model limited and time-bounded assignments.
The simple user editor changes only a current, permanent and unscoped company
assignment. Existing limited, future, expired and time-bounded assignments are
preserved. User creation requires an explicit profile choice. Delegation is
preflighted against current company-wide `users:write` authority and cannot
grant permissions that the actor does not currently hold; this is a security
floor rather than the final product hierarchy. Missing resource context
continues to fail closed.

## API Module Patterns

Each Express capability follows the same internal structure:

- `*.routes.ts`: route registration and middleware composition.
- `*.controller.ts`: HTTP boundary, request extraction, and response mapping.
- `*.validators.ts`: input validation.
- `*.service.ts`: business orchestration and authorization-sensitive behavior.
- `*.repository.ts`: persistence access.
- `*.dto.ts`: shared request and response shapes.

Shared infrastructure is kept in `apps/api/src/shared`:

- `errors`: application error contract.
- `http`: server factory, response helpers, pagination, params, async handlers.
- `lib`: Prisma access.
- `middlewares`: authentication, authorization, validation, tenant, request context, rate limiting, error handling, request logging.
- `observability`: structured logger.
- `repositories` and `services`: reusable persistence and service primitives.

Migrated ASP.NET Core capabilities keep domain and application contracts free
from HTTP, Npgsql and Redis types. API endpoints depend on application-owned
interfaces; infrastructure implements them. Route migration must move one
complete vertical slice and add differential or compatibility evidence before
the Nginx allowlist changes.

## Boundaries

- Controllers must not contain business rules.
- Services must not read raw Express response objects.
- Repositories must not perform authorization decisions.
- Shared helpers must stay framework-light unless their purpose is explicitly HTTP middleware.
- Cross-company access must go through tenant and scope checks.
- Prisma is the sole schema/migration owner during coexistence; .NET projects
  must not create Entity Framework or parallel migration artefacts.
- Nginx may promote only reviewed literal paths. A prefix-wide or default
  backend cutover is not an acceptable migration step.

## Observability

Express and ASP.NET Core emit structured JSON logs, while Nginx emits a bounded
JSON edge access record without query strings. Each request gets a `requestId`,
returned as `x-request-id`; completion telemetry includes method, path, status
and duration. Application error output hides stack traces in production and
response sanitisation prevents historical credential-shaped Audit fields from
crossing the .NET HTTP boundary.

## Security Controls

- Express authentication uses short-lived JWT access tokens and hashed refresh tokens.
  Refresh rotation atomically consumes the current token before creating one
  successor; a concurrent loser fails closed and revokes active refresh tokens
  for that user and company. Session-family isolation would require a separately
  authorised data-model change, so this response is deliberately broader today.
- Every authenticated API request checks persistent access-token revocation and
  the current active user, company and membership. The access token carries the
  exact millisecond password credential version, so a password change invalidates
  existing access and refresh tokens without relying on second-resolution JWT
  issue time. Password persistence and refresh-token revocation share one
  transaction; login and rotation lock that user row and revalidate the exact
  credential version before issuing a token. Logout keeps an immediate
  process-local deny entry but reports a failure if durable revocation cannot be
  recorded, rather than claiming a cross-instance revocation that did not occur.
- Login failure counts use atomic database increments, reset after the configured
  attempt window and establish the lock from the persisted count rather than a
  stale application read.
- The frontend performs at most one shared refresh for concurrent `401`
  responses in one page and uses the browser-wide Web Locks API to serialise
  refresh-cookie consumption across tabs when that API is available. It retries
  each protected request once and never refreshes auth endpoints recursively.
  A refresh cannot change the current user/company identity, and responses that
  complete across a login/logout generation boundary are rejected. A failed
  refresh or logout intent clears all in-memory tenant data; a refresh completing
  after logout cannot reinstall the session.
- The refresh and CSRF cookies are host scoped. Web and API may use different
  ports but must share the same protocol and public hostname so the Web
  application can read the double-submit CSRF cookie. Production requires
  canonical HTTPS origins. The client rejects protocol/hostname incompatibility
  and non-HTTPS production requests before sending them. The production
  configuration gate additionally rejects non-canonical origins, credentials,
  paths, query strings and fragments.
- Authorization is enforced by RBAC middleware and module services. A client or
  team limit recorded on an assignment requires matching resource context;
  omitted context fails closed rather than widening access.
- Company selection is explicit through the request header and must match the
  authenticated company. Client, team and shift context is never trusted from
  caller-controlled headers; resource-aware services derive it from persisted
  records.
- Comment moderation resolves current scoped RBAC authority from the persisted
  activity context instead of trusting access-token permission claims.
- Notification reads, counts, read state and deletion are recipient-scoped by
  default; a company-wide administrative surface would require a separate
  explicit contract.
- Rate limiting is configurable through `API_RATE_LIMIT_WINDOW_MS` and `API_RATE_LIMIT_MAX`.
- ASP.NET Core applies its Redis-backed limiter before authentication and
  database work, hashes the client address used in the key, and fails migrated
  business traffic closed if Redis is unavailable. Liveness remains
  dependency-free.
- ASP.NET Core revalidates access-token revocation, the exact credential
  version, active user/company membership and current PostgreSQL RBAC rather
  than trusting permission claims in the compatibility token.
- Historical Audit JSON is recursively sanitised at the .NET response boundary
  so password, token, cookie, authorisation, credential and secret-shaped keys
  cannot be returned by migrated endpoints.
- The migration profile persists ASP.NET Core data-protection keys in a
  non-root-owned volume. A production deployment requires a protected shared
  key repository selected for the target platform.
- Redis-backed ASP.NET Core sessions are currently infrastructure substrate;
  login, refresh, logout, CSRF and refresh-token rotation remain owned by
  Express until the separately governed OIDC/BFF migration.
- Production startup requires explicit CORS origin and JWT secrets.

## Delivery Flow

The release workflow preserves the Node.js 22/24 core lanes, adds a locked .NET
10 gate, then runs the existing disposable PostgreSQL/Playwright runtime gate.
A final sequential container gate builds the migration profile, deploys only
approved Prisma migrations, seeds two-company fixtures and exercises the routed
OpenAPI/JWT/Audit flow through Nginx. It also proves Redis rate-limit use,
fail-closed loss and explicit readiness plus migrated-route recovery after a
restart, live RBAC, credential-version invalidation/restoration, token
revocation, non-root execution and data-protection key persistence across
ASP.NET Core container recreation before always removing the disposable
volumes. These are
local/CI candidate controls, not a Human Gate, cloud deployment or production
approval.
