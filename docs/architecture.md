# ShiftFlow Architecture

## Overview

ShiftFlow uses a modular monorepo layout. Product surfaces live under `apps/`, infrastructure and database assets live under `prisma/`, reusable operational knowledge lives under `docs/`, and automated validation lives under `tests/` and `.github/workflows/`.

## Runtime Components

- `apps/web`: Next.js UI that communicates with the API through `NEXT_PUBLIC_API_BASE_URL`.
- `apps/api`: Express API with modules grouped by business capability.
- `prisma`: PostgreSQL schema, migrations, and deterministic seed scripts.
- `tests/e2e`: Playwright tests for homologation, accessibility, and load-oriented flows.

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
- Refresh sessions retain company context and support rotation/revocation.
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

## API Module Pattern

Each API capability follows the same internal structure:

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

## Boundaries

- Controllers must not contain business rules.
- Services must not read raw Express response objects.
- Repositories must not perform authorization decisions.
- Shared helpers must stay framework-light unless their purpose is explicitly HTTP middleware.
- Cross-company access must go through tenant and scope checks.

## Observability

The API emits structured JSON logs. Each request gets a `requestId`, returned as `x-request-id`, and request completion logs include status code and duration. Error logs include normalized error metadata and hide stack traces in production.

## Security Controls

- Authentication uses JWT access tokens and refresh-token rotation.
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
- Production startup requires explicit CORS origin and JWT secrets.

## Delivery Flow

The release gate workflow validates Prisma, migrations, dependency security, formatting, linting, type safety, unit tests, build, end-to-end tests, and load stress checks before changes reach `main`.
