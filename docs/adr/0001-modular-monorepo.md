# ADR 0001: Modular Monorepo

## Status

Accepted

## Context

ShiftFlow currently contains a web application, API, database schema, seed scripts, end-to-end tests, and operational documentation. The project benefits from shared tooling and a single release gate, but each runtime surface needs clear internal boundaries.

## Decision

Use a modular monorepo:

- `apps/web` owns the Next.js user interface.
- `apps/api` owns the Express API.
- `apps/api/src/modules` owns business capabilities.
- `apps/api/src/shared` owns cross-cutting API infrastructure.
- `prisma` owns schema, migrations, and deterministic seed scripts.
- `tests/e2e` owns Playwright validation.
- `docs` owns architecture, governance, operations, and roadmap material.

## Consequences

- Local development and CI use one dependency graph.
- Module boundaries must be enforced by review and documented conventions.
- Future extraction to separate services remains possible if load or ownership requires it.
