# ShiftFlow

ShiftFlow is an operational workforce management platform for companies that need shift, team, activity, notification, audit, RBAC, reporting, and dashboard workflows.

## Stack

- Web: Next.js, React, TypeScript.
- API: Express, TypeScript, JWT authentication.
- Data: PostgreSQL, Prisma migrations and generated client.
- Quality: ESLint, Prettier, TypeScript strict mode, Vitest, Playwright.
- Delivery: GitHub Actions release gates.

## Repository Layout

```text
apps/
  api/        Express API organized by modules and shared infrastructure.
  web/        Next.js application.
docs/         Architecture, operations, governance, and delivery documentation.
prisma/       Schema, migrations, and seed scripts.
scripts/      Maintenance and quality scripts.
tests/e2e/    Playwright end-to-end, accessibility, and load checks.
```

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Copy `.env.example` to `.env` and set local secrets.

3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Apply migrations and generate Prisma client:

```bash
npx prisma migrate deploy
npm run prisma:generate
```

5. Seed local data when needed:

```bash
npm run seed:integration
npm run homologation:seed
```

6. Run the applications:

```bash
npm run dev:api
npm run dev:web
```

## Quality Gates

Run the standard local gate before opening a pull request:

```bash
npm run quality
npm run test:unit
npm run build
```

Additional checks:

```bash
npm run test:e2e
npm run test:a11y
npm run test:load
npm run security:audit
```

## API Operations

- Liveness: `GET /health`
- Readiness: `GET /ready`
- Request correlation: every response includes `x-request-id`.
- Logs: API logs are structured JSON and include `requestId`, HTTP method, path, status, latency, user, and company context when available.

## Documentation

- [Architecture](docs/architecture.md)
- [Development Standards](docs/development-standards.md)
- [Production Runbook](docs/production-runbook.md)
- [Systematization Report](docs/systematization-report.md)
- [Technical Roadmap](docs/technical-roadmap.md)
