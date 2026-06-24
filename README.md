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

Quick start on Windows PowerShell:

```powershell
npm start
```

Stop everything:

```powershell
npm stop
```

1. Install dependencies:

```bash
npm ci
```

2. Copy `.env.example` to `.env` and set local infrastructure secrets. `POSTGRES_PASSWORD` must match the password embedded in `DATABASE_URL`. Do not store end-user passwords in `.env`.

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

## Platform Control

Use these scripts to manage the local platform:

```bash
npm run start
npm run stop
npm run restart
npm run status
```

`npm run start`, `npm run stop`, `npm run restart`, and `npm run status` release the terminal when the action finishes. Start and restart do not wait for health checks unless you pass `-Wait`.

Logs and PID state are written under `dist/runtime`.

PowerShell options are available directly:

```powershell
.\scripts\start.ps1 -SkipInstall -SkipSeed
.\scripts\stop.ps1 -KeepDatabase
.\scripts\restart.ps1 -SkipInstall -SkipSeed -KeepDatabase
```

The scripts do not open a browser by default. Use `-OpenBrowser` with `start.ps1` or `restart.ps1` only when you want that behavior.

Use `-Attach` with `start.ps1` or `restart.ps1` only when you want the script to stay attached and stream logs.

Use `-Wait` with `start.ps1` or `restart.ps1` only when you want the script to wait until Web and API respond.

The integration seed requires `E2E_EMAIL` and `E2E_PASSWORD` at runtime, hashes the password with bcrypt before storage, and does not print credentials in logs. Provide these values only through a local shell or CI secret for the seed command; do not commit them to `.env` or `.env.example`.

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
npm run clean:artifacts
```

`npm run clean:artifacts` removes local Next/Playwright build outputs such as `.next` and `dist`. These directories are ignored by Git and excluded from gitleaks because they contain generated runtime material, including ephemeral Next keys.

## API Operations

- Liveness: `GET /health`
- Readiness: `GET /ready`
- Request correlation: every response includes `x-request-id`.
- Rate limiting: every API response includes `x-rate-limit-*` headers.
- Logs: API logs are structured JSON and include `requestId`, HTTP method, path, status, latency, user, and company context when available.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Architecture](docs/architecture.md)
- [Development Standards](docs/development-standards.md)
- [Governance Index](docs/governance-index.md)
- [Production Runbook](docs/production-runbook.md)
- [Systematization Report](docs/systematization-report.md)
- [Technical Roadmap](docs/technical-roadmap.md)
