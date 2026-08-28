# ShiftFlow

ShiftFlow is an operational workforce management platform for companies that need shift, team, activity, notification, audit, RBAC, reporting, and dashboard workflows.

## Stack

- Web: Next.js, React, TypeScript.
- API: Express/TypeScript plus a modular ASP.NET Core compatibility host; REST
  remains canonical during the strangler migration.
- Data: PostgreSQL, with Prisma as the sole migration owner and Npgsql for
  migrated read paths.
- Cache and sessions: Redis-backed ASP.NET Core distributed cache, session,
  readiness and global rate limiting.
- Identity: the current JWT contract is validated by both hosts; OAuth 2.0 and
  OpenID Connect remain deferred until an identity provider is selected.
- Edge and runtime: non-root Linux containers behind an allowlisted Nginx
  same-origin proxy.
- Quality: ESLint, Prettier, TypeScript strict mode, Vitest, MSTest and
  Playwright.
- Delivery: GitHub Actions core, .NET and disposable runtime gates.

GraphQL is not part of the current public surface. It will be introduced only
if a measured dashboard or reporting use case is better served by a composed
read contract than by REST. Azure and AWS remain deployment candidates; no
provider has been selected or encoded as infrastructure authority.

## Repository Layout

```text
apps/
  api/        Express API organized by modules and shared infrastructure.
  api-dotnet/ ASP.NET Core compatibility host, modules and focused tests.
  web/        Next.js application.
docs/         Architecture, operations, governance, and delivery documentation.
eng/          Reproducible development entry point, canonical core gate, and policy tests.
infra/        Linux container and reversible Nginx edge definitions.
prisma/       Schema, migrations, and seed scripts.
PLANS.md      Non-authoritative executable plan and current implementation evidence.
scripts/      Maintenance and quality scripts.
tests/e2e/    Playwright end-to-end, accessibility, and load checks.
```

## Development Workflow

Use the single development entry point before starting the runtime:

```powershell
./eng/development.ps1 Doctor
./eng/development.ps1 Setup
./eng/development.ps1 Quick
```

`Doctor` is read-only. `Setup` performs locked npm and NuGet restores plus
Prisma client generation without migrations or seeds. `Quick` is explicitly
`NON_GATE` and provides fast Node.js and .NET quality, unit-test and build
feedback. Run the canonical core gate with:

```powershell
./eng/development.ps1 Full
```

Use `-PlanOnly` to inspect any exact plan without executing it, and `-Offline`
with `Setup` or `Full` when registry access is unavailable. An offline
dependency audit is reported as `NOT_RUN`; `Full -Offline` finishes non-zero as
`INCOMPLETE_NON_GATE`, not as a pass. See
[Project Setup and Development Workflow](docs/PROJECT-SETUP.md) for the
toolchain, credential boundary and gate interpretation.

## Local Setup

Quick start on Windows PowerShell:

```powershell
npm start
```

Stop everything:

```powershell
npm stop
```

The development workflow prepares dependencies. The remaining steps configure
an explicit local runtime and are outside the runtime-credential-free core gate.

1. If the workflow was not used, install dependencies and generate the client:

```bash
npm ci
npm run prisma:generate
```

2. Copy `.env.example` to `.env` and set local infrastructure secrets. `POSTGRES_PASSWORD` must match the password embedded in `DATABASE_URL`. Do not store end-user passwords in `.env`.

3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Apply migrations:

```bash
npx prisma migrate deploy
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

To exercise the complete migration topology, run its canonical disposable gate:

```powershell
npm run test:runtime:strangler
```

The gate generates independent process-local credentials, builds the immutable
image inputs, applies only the approved Prisma migrations, seeds deterministic
fixtures, exercises the routed security and persistence contracts, and removes
its containers and volumes even after failure. The profile is a disposable local
validation environment, not a production manifest. Nginx exposes
`http://localhost:8080`, routes only `/api/audit` and `/openapi/` to ASP.NET Core,
and leaves all other API traffic on Express. The `platform:*` scripts and
`npm stop` manage only the ordinary Windows Express/Web platform; they do not
stop or remove this Compose profile.

## Platform Control

Use these scripts to manage the local development platform:

```bash
npm run platform:start
npm run platform:stop
npm run platform:restart
npm run platform:status
```

The platform commands release the terminal when the action finishes. Start and restart do not wait for readiness unless you pass `-Wait`; with that switch, API `/ready` and Web must respond successfully or the partial launch is stopped and the command fails.

Logs and ownership-bound PID state are written under `dist/runtime`. Start, stop,
restart and cleanup share an exclusive repository operation lock. Stop acts only
on processes whose repository root, PID start time, process name and encoded
launch command match that state. Cleanup refuses to run while the managed
runtime, an unverifiable recorded process, a ShiftFlow port listener or a
reparse point is present. An occupied port is reported as a conflict and is
never authority to terminate an unrelated process. Readiness is accepted only
when each listener belongs to the corresponding managed process tree and the
API identifies itself as `shiftflow-api`. Stopping ShiftFlow does not close
Docker Desktop.

PowerShell options are available directly:

```powershell
.\scripts\start.ps1 -SkipInstall -SkipSeed
.\scripts\stop.ps1 -KeepDatabase
.\scripts\restart.ps1 -SkipInstall -SkipSeed -KeepDatabase
```

The scripts do not open a browser by default. Use `-OpenBrowser` with `start.ps1` or `restart.ps1` only when you want that behavior.

Use `-Attach` with `start.ps1` or `restart.ps1` only when you want the script to stay attached and stream logs.

Use `-Wait` with `start.ps1` or `restart.ps1` only when you want the script to wait until Web and API respond.

The integration seed requires `E2E_EMAIL` and `E2E_PASSWORD` at runtime, hashes the password with bcrypt before storage, and does not print credentials in logs. Provide these values only through a local shell, per-run CI generation, or, only when unavoidable, a CI secret for a persistent external test identity; do not commit them to `.env` or `.env.example`. New or changed user passwords must be at least 12 characters and include lowercase, uppercase, numeric, and symbol characters.

The realistic seed deletes all data in its target. It therefore accepts only a loopback PostgreSQL database named `shiftflow` or `shiftflow_<purpose>`, rejects `NODE_ENV=production`, requires a runtime password, and requires the explicit per-shell confirmation `SHIFTFLOW_DESTRUCTIVE_SEED_CONFIRMATION=DELETE_CONFIRMED_LOCAL_SHIFTFLOW_DATA`. The confirmation and password must never be committed. Use a disposable database only.

`npm start` is reserved for the compiled API (`dist/api/server.js`). After `npm run build`, run the Web production artefact separately with `npm run start:web`. Neither production command applies migrations or seeds; deployment orchestration remains environment-specific.

## Quality Gates

Run fast feedback while developing, then the canonical core gate before
opening a pull request:

```powershell
npm run dev:quick
npm run dev:full
```

Additional checks:

```bash
npm run comments:verify
npm run platform:workflow:test
npm run test:e2e
npm run test:a11y
npm run test:load
npm run test:dotnet
npm run test:runtime:strangler
npm run security:audit
npm run clean:artifacts
```

The focused routed-behaviour probe is internal to the canonical runtime gate.
The wrapper is the only supported entry point because it establishes the local
Docker authority, disposable project identity, credentials and cleanup boundary.

`npm run clean:artifacts` removes local Next/Playwright build outputs such as `.next` and `dist`. These directories are ignored by Git and excluded from gitleaks because they contain generated runtime material, including ephemeral Next keys.

## API Operations

- Edge/legacy liveness: `GET /health`; edge process liveness: `GET /edge-health`.
- Public compatibility readiness: `GET /ready` currently remains on Express.
  The migration-profile Docker healthcheck additionally requires ASP.NET Core
  PostgreSQL, Redis and data-protection readiness plus Web availability.
- Migrated contract: `GET /api/audit`, `GET /api/audit/{id}` and
  `GET /openapi/v1.json` through Nginx.
- Request correlation: every response includes `x-request-id`.
- Rate limiting: migrated business traffic uses Redis and fails closed when it
  is unavailable; legacy traffic still uses the existing process-local store.
- Authentication lockout: failed logins are tracked by hashed e-mail/IP metadata and lock after `AUTH_LOCKOUT_MAX_ATTEMPTS` within the configured lockout window.
- Logs: API logs are structured JSON and include `requestId`, HTTP method, path, status, latency, user, and company context when available.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Architecture](docs/architecture.md)
- [Development Standards](docs/development-standards.md)
- [Project Setup and Development Workflow](docs/PROJECT-SETUP.md)
- [Source Commenting Manifest](docs/source-commenting-manifest.md)
- [Governance Index](docs/governance-index.md)
- [Production Runbook](docs/production-runbook.md)
- [Systematization Report](docs/systematization-report.md)
- [Technical Roadmap](docs/technical-roadmap.md)
