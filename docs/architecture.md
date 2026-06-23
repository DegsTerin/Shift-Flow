# ShiftFlow Architecture

## Overview

ShiftFlow uses a modular monorepo layout. Product surfaces live under `apps/`, infrastructure and database assets live under `prisma/`, reusable operational knowledge lives under `docs/`, and automated validation lives under `tests/` and `.github/workflows/`.

## Runtime Components

- `apps/web`: Next.js UI that communicates with the API through `NEXT_PUBLIC_API_BASE_URL`.
- `apps/api`: Express API with modules grouped by business capability.
- `prisma`: PostgreSQL schema, migrations, and deterministic seed scripts.
- `tests/e2e`: Playwright tests for homologation, accessibility, and load-oriented flows.

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
- `middlewares`: authentication, authorization, validation, tenant, request context, error handling, request logging.
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

## Delivery Flow

The release gate workflow validates Prisma, migrations, dependency security, formatting, linting, type safety, unit tests, build, end-to-end tests, and load stress checks before changes reach `main`.
