<!-- Purpose: Records the executable plan and current evidence for authorised ShiftFlow development work without creating project state or expanding task authority. -->

# ShiftFlow executable development plan

## Whole-project audit and corrective systematisation — 2026-08-27

### Control record

| Field            | Value                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan ID          | `PLAN-WHOLE-PROJECT-AUDIT-20260827-01`                                                                                                                                                                                                                                                                       |
| Status           | `IN_PROGRESS`                                                                                                                                                                                                                                                                                                |
| Baseline         | `main@4191ee6a5c87d157f933671333253ce3b4605e72`, tree `40a440d2d05b1b07cbadedf8c8a07b1945646cac`, clean before all audit lanes and reverified unchanged before integration                                                                                                                                   |
| Authority        | Owner request for an extremely detailed whole-project audit followed by organisation, cleanup and optimisation                                                                                                                                                                                               |
| Current state    | `STATE-08 PRODUCTION_RELEASE`; this corrective maintenance does not itself authorise a lifecycle transition                                                                                                                                                                                                  |
| Maintenance mode | `Mode B - Systematisation` under the active maintenance playbook                                                                                                                                                                                                                                             |
| Positive scope   | Read-only whole-project audit; root-cause corrections for confirmed security, tenant, session, data-shaping, API-contract, operational-safety, frontend-integrity, accessibility, performance, test, documentation and governance defects; proportional validation; local commits                            |
| Negative scope   | Product redesign; invented requirements; applied-migration edits; unapproved schema changes; local `.env` access; mutation of an existing database; deployment; publication; remote Git actions; secrets; Human Gate or lifecycle approval; removal of dependencies or artefacts without demonstrated safety |
| Parallel work    | Three frozen-input read-only audit lanes were reconciled; every write, validation, staging and commit is sequential in the coordinating worktree                                                                                                                                                             |

### Objective

Establish a factual, reproducible picture of the entire repository and correct
the highest-value defects without broadening product scope. The result must be
safer to operate, fail closed at tenant and session boundaries, preserve data
and evidence, expose truthful UI behaviour, reduce avoidable request and
maintenance cost, and leave explicit evidence for every validated or deferred
finding.

### Audit disposition

| Area                                     | Confirmed disposition before correction                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operational scripts                      | `HIGH`: restart exits after stop; stop/cleanup can terminate unrelated processes or global Docker; start can claim health after timeout; realistic seed lacks a destructive-target guard |
| Secrets and supply chain                 | `HIGH`: the local scanner can read ignored `.env` and print a detected secret-bearing line; historical scanning remains absent                                                           |
| RBAC and tenant isolation                | `HIGH`: scoped assignments fail open when sub-scope context is absent; role tenant/system fields are client-writable; system-role delegation is incomplete                               |
| Authentication and session lifecycle     | `HIGH`: refresh accepts invalid user/membership states and token rotation is not atomically single-use; claims can contain cross-company or stale permissions                            |
| Recipient and global-identity boundaries | `HIGH`: notification list/delete are company-wide rather than recipient-scoped; user administration mixes global identity with tenant authority                                          |
| Activity and evidence integrity          | `HIGH`: activity history recursively snapshots prior history; attachment `BigInt` is not JSON-safe; reads provision task columns; domain mutation and evidence writes are non-atomic     |
| API contracts and data access            | `MEDIUM/HIGH`: UUID/query validation and activity pagination are incomplete; lifecycle fields can bypass commands; dashboard and list queries have correctness and scale limits          |
| Frontend correctness                     | `HIGH`: server pagination is discarded, write/delete capabilities are not reflected, session refresh is mount-only, request races and duplicate Kanban drops are possible                |
| Accessibility and visual evidence        | `HIGH`: modal focus contract and keyboard alternatives are incomplete; the viewport, screenshot and Pixel Perfect evidence required for approval does not exist                          |
| Tests and documentation                  | `HIGH/MEDIUM`: critical modules lack regression coverage; runtime suites overlap; operational documentation and environment contracts contain objective drift                            |

### Acceptance criteria

1. Every mutation remains traceable to a confirmed audit finding and preserves
   the negative scope above.
2. Stop and restart terminate only processes proven to belong to the current
   ShiftFlow runtime; cleanup never terminates processes, refuses active or
   unverifiable runtime state, and preflights generated trees before removal.
   Port occupancy is diagnostic, never kill authority, and Docker Desktop is
   never stopped as a project side effect.
3. Startup fails closed on conflicts or readiness timeout, cleans up a partial
   launch, and reports `started`, `ready` and `degraded` states truthfully.
4. Destructive realistic data preparation rejects production, non-loopback and
   unconfirmed targets before a Prisma client can mutate data; generated or
   supplied passwords are never printed.
5. Secret scanning is limited to the Git candidate, ignores local environment
   files, refuses external links, and reports only rule/path/line metadata.
6. RBAC scope is fail closed, current assignment/membership/role/permission
   state is enforced, tenant/system-owned fields cannot be reassigned through
   generic DTOs, and corrected cases have negative regression tests.
7. Refresh rotation consumes a token atomically once and rejects inactive,
   locked, companyless or detached sessions. Server-side comment moderation
   uses current scoped policy rather than token claims.
8. Notifications are recipient-scoped by default. UUID, query and pagination
   failures produce bounded client errors, `BigInt` responses are JSON-safe,
   and activity history no longer embeds prior relational history.
9. Frontend requests renew a session once, avoid stale-result overwrite and
   excessive per-keystroke loading; logout clears local state even when remote
   revocation fails; detail-loading and incomplete controls are truthful.
10. Modal, table and Kanban interactions have usable keyboard semantics; one
    drop produces one move; permission-specific actions are not presented to
    users who cannot execute them.
11. Every implemented correction passes focused regressions, the non-gate
    Quick loop, the canonical online core gate and all applicable disposable
    runtime/browser checks. Existing local configuration or data is never used
    as the runtime-test target.
12. Documentation, snapshot, roadmap and this plan distinguish corrected,
    validated, deferred and unverified work without overstating production,
    visual, provider or lifecycle evidence.

### Execution plan

1. `COMPLETED` — freeze baseline and load repository authorities, current state,
   relevant documentation, prior evidence and the completed executable plan.
2. `COMPLETED` — run three isolated read-only audits covering backend/data/security,
   frontend/UI/UX and tooling/tests/docs; independently verify high-impact claims.
3. `COMPLETED` — consolidate findings, define the positive/negative boundary,
   acceptance criteria, correction order and validation envelope in this plan.
4. `COMPLETED` — harden platform lifecycle scripts, destructive-seed preflight and
   secret scanning; add side-effect-free regressions and reconcile operational docs.
5. `COMPLETED` — correct RBAC/tenant/session/recipient boundaries and add security
   regressions before any lower-priority refactoring.
6. `IN_PROGRESS` — correct response shaping, validation, pagination, activity evidence
   growth, lifecycle bypasses and safe query/performance defects without schema drift.
7. `PENDING` — correct frontend session/request lifecycle, capability guards,
   detail truthfulness, Kanban integrity and accessibility in focused slices.
8. `PENDING` — remove only demonstrably dead residue, reduce duplicated maintenance
   structures and reconcile tests, CI, documentation and current-state evidence.
9. `PENDING` — run focused tests after every slice, then Quick and the canonical
   online core gate; preserve the first factual failure and correct only by a
   separately evidenced successor run.
10. `PENDING` — use a newly provisioned disposable database and isolated ports for
    applicable E2E, accessibility and performance checks; perform browser visual
    review across representative viewports without touching existing local data.
11. `PENDING` — obtain independent read-only review of the final candidate, resolve
    verified findings sequentially, close this plan with exact evidence and create
    narrow local commits. No remote publication is authorised.

### Increment evidence

| Increment                                                                                   | Disposition                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operational safety, destructive-seed guard, secret scanner and runbook reconciliation       | `COMPLETED_CORE_GATE_PASS` | Side-effect-free platform workflow passed in Windows PowerShell 5.1 and PowerShell 7; focused scanner/seed tests passed; secret scan inspected 225 Git-candidate files without values; `dev:quick` and the online canonical `dev:full` gate passed with zero npm vulnerabilities, 9 test files, 40 tests and production builds; independent review reached `CANDIDATE` after all P1/P2 findings were corrected. Docker, application services, ports, seed and database were not invoked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Tenant RBAC, resource-aware comments, recipient notifications and simple user-role boundary | `COMPLETED_CORE_GATE_PASS` | Three independent read-only reviews reached `CANDIDATE` after all verified P1/P2 successors were corrected. Eleven focused files with 61 tests passed; the full non-gate Quick loop and the canonical online core gate passed formatting, source-comment and platform policies, lint, type checking, Prisma generation and validation, dependency overrides, production configuration, a redacted scan of 235 Git-candidate files, 19 unit-test files with 98 tests, both production builds and `npm audit` with zero vulnerabilities. Docker, application services, ports, database and browser were not invoked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Authentication, access/refresh lifecycle, atomic lockout and frontend session recovery      | `COMPLETED_CORE_GATE_PASS` | Refresh consumption and logout races use conditional writes with distinct expired/reused/conflict outcomes and recheck expiry after acquiring the token lock. Password changes calculate a strictly increasing credential version after locking the user and revoke refresh sessions in the same transaction; login and rotation use the same lock order and revalidate the exact credential before issuing a token. Inactive, deleted, companyless, detached and pre-password-change sessions fail closed; access requests revalidate persistent revocation plus live user/company membership, and route authorisation queries current RBAC state even when UI claims await refresh. Failed-login state is atomic; the browser uses bounded single-flight refresh, preserves a newer refresh from an older retry, settles deferred tenant operations only through the active session epoch and rejects protocol/host incompatibility or non-HTTPS production requests. The production gate separately enforces canonical origins without credentials, paths, queries or fragments. Eight focused files with 83 tests passed, and the full non-gate Quick loop plus the canonical online core gate passed formatting, source-comment and platform policies, lint, type checking, Prisma generation and validation, dependency overrides, production configuration, a redacted scan of 240 Git-candidate files, 23 unit-test files with 162 tests, both production builds and `npm audit` with zero vulnerabilities. Three independent review rounds correctly returned `NOT_CANDIDATE`; all three final successor reviews reached `CANDIDATE` with no P0-P3 finding. No service, port, browser, database, seed or local credential was used. |

### Deferred-by-authority or decision boundary

- Database constraints, composite relations, partial unique indexes and any new
  migration remain recommendations until separately justified and authorised.
- Refresh tokens do not yet carry a session-family identifier. Reuse, a lost
  refresh CAS or a concurrent logout therefore revokes every active refresh
  token for the user in that company. This is the current fail-closed response;
  narrower device/session revocation requires an authorised schema design and
  migration.
- Identity-global versus tenant-local user administration, RBAC delegation
  hierarchy, timezone semantics, attachment storage, full report/notification
  product surfaces and production deployment topology require explicit product
  or architecture decisions; corrective code must not invent them.
- Resource-aware authorisation remains required for routes that do not yet
  derive client or team scope from the persisted resource. Until that successor
  exists, limited assignments fail closed when the required scope is absent;
  client-selected headers are not accepted as proof of resource ownership.
- The current user editor models one permanent, unscoped company role and
  cannot safely create, display or edit multiple client/team/time-bounded
  assignments. Existing limited, future, expired and time-bounded assignments
  are preserved when the permanent company role changes. Those
  assignment-management journeys remain API-only and not frontend-homologated
  until an explicit product contract is approved. The product role-management
  interface therefore creates and mutates only company-scoped profiles;
  existing system and limited profiles remain read-only there. The implemented
  permission-subset delegation rule is a fail-closed security floor, not final
  approval of the deferred product hierarchy.
- Pixel Perfect approval requires an authorised reference baseline. Runtime
  screenshots can establish internal consistency and defects, but not equivalence
  to an absent design source.
- History scanning, SBOM generation, distributed rate limiting and immutable
  production artefacts may require new tools or infrastructure. Local controls
  must fail truthfully until those capabilities exist.

## Governed development workflow adoption — 2026-08-27

### Control record

| Field            | Value                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan ID          | `PLAN-DEVELOPMENT-WORKFLOW-20260827-01`                                                                                                                                                                                                                                                                  |
| Status           | `COMPLETED`                                                                                                                                                                                                                                                                                              |
| Baseline         | `main@418ca59f2ae7486a5b13208ac44ad241e4c80872`, tree `fb50a80ecc1522e26ef712111039cf12ce741d07`, initially clean                                                                                                                                                                                        |
| Authority        | Owner request to implement in ShiftFlow the same governed development method and flow used by RAG-Challenge                                                                                                                                                                                              |
| Current state    | `STATE-08 PRODUCTION_RELEASE`; this work is authorised post-release process maintenance and does not create a state transition                                                                                                                                                                           |
| Maintenance mode | `Mode B - Systematisation` under the active maintenance playbook                                                                                                                                                                                                                                         |
| Positive scope   | Executable planning, runtime-credential-free development preparation and validation, policy tests, local/remote gate reuse, minimal stable dependency remediation required by the new gate, documentation and current governance evidence                                                                |
| Negative scope   | Product behaviour, unrelated security defect remediation, direct major dependency upgrades, schema, migrations, seeds, local database mutation, runtime start, local E2E/load/browser execution, deployment, publication, provider use, secrets, remote Git actions, Human Gate and lifecycle transition |
| Parallel work    | Read-only comparison lanes were parallel; all ShiftFlow writes, validation, staging and commit remain sequential in the coordinating worktree                                                                                                                                                            |

### Objective

Adopt the stable and reusable RAG-Challenge development loop without copying
product-specific identities or its uncommitted workspace-cleanup work. ShiftFlow
will have one fail-closed entry point for diagnosis, dependency preparation,
fast feedback and the canonical runtime-credential-free gate, backed by
deterministic policy tests and a current executable plan.

### Source-to-target decisions

| RAG-Challenge method                                                           | ShiftFlow disposition                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `PLANS.md` records the current plan and evidence but grants no authority       | `ADOPT`, with the newest active plan first and historical plans preserved below it                                |
| `Doctor`, `Setup`, `Quick`, `Full` and `PlanOnly` share one entry point        | `ADOPT`, adapted to npm, Prisma, TypeScript, Vitest and Next.js                                                   |
| `Quick` is explicitly `NON_GATE`                                               | `ADOPT`; it excludes dependency audit, database mutation, E2E and load checks                                     |
| `Full` delegates exactly once to canonical CI                                  | `ADOPT`; the core gate remains runtime-credential-free and runtime gates stay separate                            |
| The development process strips provider credentials in an isolated child       | `ADAPT`; ShiftFlow runtime and test secrets are removed from the child without being read                         |
| Policy tests prevent drift between plan, entry point and CI                    | `ADOPT` with PowerShell contract tests                                                                            |
| Remote CI uses the same canonical core gate                                    | `ADOPT`; database preparation and Playwright remain explicit workflow stages                                      |
| Stage 0/1/2, RAG provider/corpus controls and current Temp workspace inventory | `REJECT_FOR_THIS_SCOPE`; these are product-specific or uncommitted work, not the stable development-loop contract |

### Acceptance criteria

1. `PLANS.md` is routed as executable evidence and explicitly remains
   non-authoritative.
2. `eng/development.ps1` exposes deterministic `Doctor`, `Setup`, `Quick`,
   `Full` and `PlanOnly` contracts.
3. `Doctor` is read-only; `Setup` performs only locked npm preparation and
   Prisma client generation.
4. `Quick` is labelled `NON_GATE`, requires prepared dependencies, runs the
   runtime-credential-free fast checks and contains no audit, migration, seed, E2E or
   load operation.
5. `Full` delegates exactly once to `eng/ci.ps1`; online mode includes the npm
   dependency audit and offline mode reports `NOT_RUN` before terminating
   non-zero as `INCOMPLETE_NON_GATE`.
6. Development checks execute in an isolated child with known project runtime
   configuration and secret-bearing caller values removed without being read or
   changing the caller's environment; Prisma receives only the fixed non-secret
   workflow value.
7. The GitHub release workflow invokes the same core CI entry point in Node.js
   22 and 24 lanes instead of duplicating its commands; database and browser
   stages remain visibly separate and use only disposable, per-run inputs.
8. Policy tests validate exact plans, credential boundaries, forbidden Quick
   operations, fail-closed candidate diff checks, generated Next metadata
   restoration and single CI delegation without restoring dependencies,
   building, testing or using the network.
9. README, setup, contribution, engineering standards and governance documents
   describe one coherent workflow.
10. Stable direct dependency updates within the existing major versions and a
    focused `deepmerge-ts` security override clear the online dependency gate;
    Prisma configuration, validation and client generation remain compatible.
11. The prompt corpus remains 17 files, advances compatibly to `5.1.0`, keeps
    `STATE-08`, and reconciles current evidence without claiming resolution of
    unrelated product risks.

### Execution plan

1. `COMPLETED` — reconcile both repository baselines, authorities, active work
   and the stable RAG-Challenge development-loop contract.
2. `COMPLETED` — define the reusable source-to-target mapping, positive scope,
   negative scope, acceptance criteria and protected boundaries.
3. `COMPLETED` — implement the executable plan, development entry point,
   canonical CI entry point and policy tests.
4. `COMPLETED` — apply the smallest stable dependency remediation required for
   the canonical online gate and run focused compatibility checks.
5. `COMPLETED` — align package scripts, remote CI and developer documentation.
6. `COMPLETED` — reconcile prompt-system routing, current evidence and version
   records without changing lifecycle state.
7. `COMPLETED` — run parse, policy, plan, Doctor, Quick and proportional project
   checks; preserve every factual failure and distinguish pre-existing blockers.
8. `COMPLETED` — independent review, narrow staging, successor staged gate and
   implementation commit were verified; close the plan in a separate
   evidence-only commit so the implementation identity remains factual.

### Current boundaries and preserved evidence

- The 2026-08-27 preflight found `npm audit` failing with 14 vulnerabilities
  (9 high and 5 moderate; production-only audit: 12 total, 8 high and
  4 moderate). The adoption batch now includes only the stable dependency
  remediation necessary to make the new online gate usable. The successor
  online audit passed with zero vulnerabilities; the baseline failure remains
  recorded here rather than being rewritten.
- Previously identified authentication, tenant-scope, response-shaping and
  operational defects remain outside this process-maintenance batch.
- The local E2E command applies migrations and seeds to `DATABASE_URL`. Runtime
  checks therefore remain outside the runtime-credential-free development gate
  until a local isolated database envelope is separately implemented and
  validated. Remote CI now uses only its fixed disposable service database.

### Validation evidence

| Check                                  | Result                                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline and ownership preflight       | `PASS`: ShiftFlow clean at the recorded baseline; RAG-Challenge owner WIP was read only and preserved                                                                                                                                                 |
| Stable-method comparison               | `PASS`: executable plan plus Doctor/Setup/Quick/Full/PlanOnly and canonical CI reuse selected; product-specific and uncommitted controls excluded                                                                                                     |
| Implementation policy tests            | `PASS`: exact plans, environment isolation, fail-closed diffs/offline result, core ownership, Node matrix, no `secrets.*` and disposable remote inputs enforced                                                                                       |
| PowerShell parse checks                | `PASS`: all four `eng/*.ps1` files parsed without errors                                                                                                                                                                                              |
| Doctor and deterministic plans         | `PASS`: policy executed every plan twice exactly; `dev:doctor` passed repository, tools, lock and prepared dependency checks                                                                                                                          |
| Setup                                  | First attempt `FAIL` with npm `ECONNRESET`; separately retried successor `PASS`, restoring 427 packages and generating Prisma Client 7.10.0                                                                                                           |
| Quick feedback loop                    | Two initial attempts `FAIL` at production-config validation exposed empty-value scrubbing; root cause corrected and successor `PASS`                                                                                                                  |
| Runtime-credential-free full gate      | Online successor `PASS`: hostile inherited project values were isolated; quality, 28 unit tests and API/Web builds passed                                                                                                                             |
| Offline full diagnostic                | Initial run exited zero with audit `NOT_RUN`; after fail-closed correction one retest exposed a fixed JWT literal, and the final successor passed available checks then exited 1 as `INCOMPLETE_NON_GATE`                                             |
| Online dependency audit                | Baseline `FAIL` with 14 vulnerabilities; successor all-dependency and production-only audits both `PASS` with zero vulnerabilities                                                                                                                    |
| Dependency compatibility               | `PASS`: the online core passed on Node.js 22.12.0/npm 10.9.0 and Node.js 24.19.0/npm 11.17.0 with Prisma 7.10.0 and `deepmerge-ts` 8.0.0                                                                                                              |
| Build metadata preservation            | `PASS`: focused wrapper execution preserved the tracked `apps/web/next-env.d.ts` blob and restored its exact bytes and timestamp                                                                                                                      |
| Documentation and prompt-system audit  | `PASS`: formatting, local link targets across all 14 changed Markdown files, version/state coherence and exact 17-file manifest                                                                                                                       |
| Independent review                     | `PASS`: three independent read-only reviews accepted the final governance, dependency and workflow design with no remaining P0-P3 finding                                                                                                             |
| Staged diff hygiene and canonical gate | First staged attempt `FAIL` at `PLANS.md` formatting; after correction, the successor `PASS` covered policy, audit, 161 commented sources, quality, 28 tests, builds and all three diff paths                                                         |
| Local commit                           | `PASS`: implementation commit `0c42e49d24fcaac6502ec9ed6c4b4b0495aa95cb`, tree `30e1a64e6e19ffb186ff738944d8070693ded6e7`, parent baseline verified; this plan closeout is recorded by the subsequent evidence-only commit reported in owner delivery |
