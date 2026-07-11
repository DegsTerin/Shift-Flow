# Foundation Phases

Use exactly one section according to the current state. Shared authority, execution, evidence, and closeout rules come from `../core/`.

## STATE-01 SETUP_PROJECT

Role: senior platform/setup engineer.

### Objective

Create the reproducible technical baseline. This is the only phase for project initialisation and setup tooling.

### Allowed

- Create the base monorepo and package configuration.
- Install approved baseline dependencies.
- Configure TypeScript, lint, formatting, tests, build, environment templates, Docker, and runtime scripts.
- Initialise the technical Prisma scaffold without domain models or domain migrations.

### Required baseline

- Web: Next.js, React, TypeScript, Tailwind, component/form/validation and HTTP foundations as approved.
- API: Node.js, Express, TypeScript, Prisma Client, PostgreSQL driver, validation, JWT/security middleware, and operational foundations.
- Quality: format, lint, typecheck, unit test, build, and security scripts.
- Environment: `.env.example`, Docker Compose where applicable, and documented startup.

### Prohibited

- Business rules, final product screens, functional APIs, domain schema, or domain migrations.

### Deliverables

Workspace structure, dependencies, baseline configuration, reproducible setup evidence, and architecture-phase dependencies.

## STATE-02 ARCHITECTURE

Role: senior software architect.

### Objective

Define the solution without implementing functional code.

### Required decisions

- Logical/runtime architecture and folder/module boundaries.
- Frontend, backend, database, API, and integration contracts.
- Authentication and RBAC flows.
- Multi-company, multi-client, multi-team, and multi-shift isolation.
- Audit, immutable history, soft delete, backup, observability, scalability, and deployment direction.
- i18n, light/dark theme, accessibility, responsive strategy, and TV/monitoring direction where applicable.
- ADRs for durable or high-impact decisions.

### Technology baseline

Next.js, TypeScript, Tailwind/component system, Node.js, Express, Prisma, PostgreSQL, unless an explicit architecture decision changes the stack.

### Prohibited

Functional code, setup tooling, schema implementation, backend implementation, or frontend implementation.

### Deliverables

Updated canonical architecture, diagrams where useful, ADRs, risks, and database-modelling dependencies.

## STATE-03 DATABASE_MODELING

Role: senior DBA/data architect.

### Objective

Define and implement the approved PostgreSQL domain model through Prisma.

### Required domain coverage

Companies, clients, teams, shifts, users, roles, permissions, activities, immutable activity history, comments, attachments, notifications, shift reports, and audit logs, plus approved supporting entities.

Activity modelling must support operational dossier fields, company/client/team/shift/responsible scope, status, priority, system/service, narrative fields, creation/update/delete audit, comments, attachments, and chronological history.

### Data rules

- Explicit foreign keys, tenant scope, indexes, constraints, and deletion semantics.
- Append-only operational/audit history with actor, timestamp, action, content, and before/after where applicable.
- Forward-only migrations with deployment and rollback notes.
- Indexes for real filters, dates, status, responsibility, tenant, and search patterns where justified.

### Allowed

Change `schema.prisma`, format/validate it with Prisma, create reviewed domain migrations, and explain relationships and migration strategy.

### Prohibited

Setup initialisation, applying migrations to final environments, unrelated runtime configuration, backend implementation, or frontend implementation.

### Deliverables

Formatted/validated schema, migration artefacts, relationship explanation, integrity evidence, and backend contract dependencies.
