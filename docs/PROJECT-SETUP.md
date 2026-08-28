<!-- Purpose: Defines the reproducible ShiftFlow development preparation and validation workflow. -->

# Project setup and development workflow

## Supported toolchain

- PowerShell 7 or later.
- Git available on `PATH`.
- Node.js 22 LTS is the repository baseline. Use Node.js 22.12 or later on the
  22.x line; Node.js 24.x is also supported. Node.js 23 is not supported by the
  locked Prisma toolchain.
- npm 10 or 11.
- .NET SDK 10.0.400, selected by `global.json`; later patches in the same
  feature band are accepted.
- Docker Engine with Compose v2 for disposable PostgreSQL, Redis, Linux
  containers and the Nginx migration topology.

The checked-in `.nvmrc`, `package.json` engines, `package-lock.json`,
`global.json`, central package versions and NuGet lock files are the toolchain
and dependency contract. Do not replace locked restores with unbounded
installs.

## One entry point

`eng/development.ps1` is the public development entry point. Its tasks and
planning switch are:

| Mode        | Contract                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `Doctor`    | Read-only diagnosis of repository identity, Node/.NET tools, lock metadata and prepared dependencies |
| `Setup`     | Locked npm/NuGet restores plus Prisma generation; no migration, seed or database connection          |
| `Quick`     | Fast Node.js and .NET quality, unit-test and build feedback; explicitly `NON_GATE`                   |
| `Full`      | Delegates exactly once to the canonical runtime-credential-free repository gate in `eng/ci.ps1`      |
| `-PlanOnly` | Prints the exact deterministic plan for the selected task without executing it                       |

Start a new checkout with:

```powershell
./eng/development.ps1 Doctor
./eng/development.ps1 Setup
./eng/development.ps1 Quick
```

Use the npm aliases when preferred:

```powershell
npm run dev:doctor
npm run dev:setup
npm run dev:quick
npm run dev:full
```

Offline preparation and validation are explicit:

```powershell
./eng/development.ps1 Setup -Offline
./eng/development.ps1 Full -Offline
```

Offline mode requires the relevant npm and NuGet artefacts plus the prepared
.NET restore graph to be available locally. `Full -Offline` runs the available
checks, reports registry-backed dependency audits as `NOT_RUN`, and exits
non-zero as `INCOMPLETE_NON_GATE`; it cannot be consumed as an online audit
pass.

Inspect a plan without installing or validating anything:

```powershell
./eng/development.ps1 Doctor -PlanOnly
./eng/development.ps1 Setup -Offline -PlanOnly
./eng/development.ps1 Quick -PlanOnly
./eng/development.ps1 Full -PlanOnly
```

## Credential and database boundary

Executable tasks run in an isolated child process. Known caller-provided
project runtime configuration and database, JWT, seed and E2E credentials are
removed without being read. This includes build inputs such as
`NEXT_PUBLIC_API_BASE_URL`, so the core result does not depend on exported
project settings in the caller's shell. A checked-in non-secret configuration
in `eng/workflow.env` supplies a
synthetic loopback database URL so Prisma configuration can be parsed and
the client can be generated without connecting to a database. Dotenv is
directed to that file during the workflow, so the repository's local `.env` is
not loaded by these checks.

The core gate does not start services, deploy migrations, seed data, run a
browser, execute E2E/load tests or deploy the product. Those runtime checks
need their own disposable database and explicit credentials. GitHub Actions
keeps them as visible stages after the core gate and uses a fixed local service
database rather than an arbitrary secret-provided `DATABASE_URL`. Its
disposable E2E, PostgreSQL and JWT values are generated afresh for each
applicable run and are not stored as repository or GitHub secrets.

## Gate interpretation

`Quick` is development feedback only. A passing result must never be reported
as the canonical gate.

`Full` runs the reproducible core repository gate: workflow policy, locked
preparation, online npm/NuGet dependency audits, Node.js and .NET quality, unit
tests, builds and candidate diff hygiene. Local runs inspect both the worktree
and index; remote runs also inspect the complete base-to-HEAD range. The remote
core matrix and .NET lane must pass before the existing disposable product
runtime gate; the ASP.NET Core strangler Compose gate then runs sequentially.
None of these results is deployment evidence or a replacement for a Human Gate
or lifecycle decision.

`npm run build` uses `eng/build.ps1` to preserve the caller's exact
`apps/web/next-env.d.ts` state around the Next.js production build. This keeps
generated development/build metadata from leaking into the worktree, including
when a build fails. The raw API and Web build sequence is private to
`npm run build:application` and should not be used as the development gate.

The policy contract itself can be checked without builds or network access:

```powershell
npm run dev:workflow:test
npm run platform:workflow:test
```

The platform workflow test does not start services, touch application ports or
invoke Docker. It checks fail-closed process ownership, shared operation locking,
listener-to-process binding, local-only Docker endpoints, restart composition
and cleanup boundaries, including descendant reparse points.

## Disposable ASP.NET Core migration profile

The `migration` Compose profile is an integration topology, not the ordinary
Windows development platform or a production manifest. It builds non-root
Linux images for Express, ASP.NET Core and Next.js, adds PostgreSQL and Redis,
and exposes Nginx as the only application edge on `http://localhost:8080`.
PostgreSQL and Redis are loopback-published only for disposable inspection.
Prisma deploys the approved migrations before either API starts. Nginx routes
only `/api/audit` and `/openapi/` to ASP.NET Core.

Run the canonical disposable gate:

```powershell
npm run test:runtime:strangler
```

The gate creates fresh, independent process-scoped credentials; it never reads a
repository `.env`. It verifies the routed Web, OpenAPI and legacy-JWT contracts,
positive and cross-company Audit access, recursive response sanitisation, live
RBAC, credential-version invalidation/restoration and token revocation, Redis
counter persistence, fail-closed behaviour and explicit dependency plus routed
traffic recovery after Redis restarts, the Nginx Host allowlist, non-root
identities, and the ability to unprotect a pre-recreation Data Protection
payload after ASP.NET Core container recreation. It always removes the isolated
containers and volumes. Public `/ready` remains the Express
compatibility endpoint; Compose health explicitly checks Express, ASP.NET Core
dependencies/key ring and Web before it accepts the Nginx service as healthy.

The profile deliberately uses fixed loopback ports and a fixed private edge
subnet because the governed runtime workflow is sequential. Do not run two
instances concurrently on one Docker host or assume compatibility with every
VPN address pool. A shared or concurrent runner requires an approved dynamic
port/subnet design and corresponding proxy-trust evidence first.

## Local platform and destructive data boundary

The Windows platform scripts under `scripts/` are development orchestration,
not production startup. Use `npm run platform:start`, `platform:stop`,
`platform:restart` and `platform:status`. Passing `-Wait` to the PowerShell start
or restart script makes readiness mandatory and rolls back a partial process
launch on failure. PID, start time, process name, repository root and launch
command must all match before stop can terminate a process. Mutating platform
commands share one repository lock. Cleanup performs a complete preflight and
refuses to remove generated trees while runtime ownership, relevant listeners
or reparse points are present. The active Docker context must resolve to an
explicitly local endpoint. Readiness also requires the API and Web listeners to
belong to their recorded managed process trees.

These scripts manage only the ordinary Express and Next.js Windows runtime.
They do not start, inspect, stop or remove the ASP.NET Core, Redis or Nginx
services in the `migration` Compose profile.

`npm start` runs only the compiled API and `npm run start:web` runs the compiled
Next.js application. Build, migration and seed remain separate operations.

`seed:realistic` and `db:reset:realistic` are destructive. They reject
production, remote hosts, non-ShiftFlow database names, absent runtime passwords
and absent explicit confirmation. Run them only against a newly provisioned
loopback disposable database and provide
`SHIFTFLOW_DESTRUCTIVE_SEED_CONFIRMATION=DELETE_CONFIRMED_LOCAL_SHIFTFLOW_DATA`
in that process environment. The confirmation is not durable authority and must
not be placed in a committed environment file.

## Executable plan

Broad or multi-step implementation work keeps `PLANS.md` current with its
baseline, authority, positive and negative scope, increments, evidence,
blockers and remaining work. The plan records execution; it never grants
authority, changes `STATE-08` or replaces the canonical prompt system.
