<!-- Purpose: Records the executable plan and current evidence for authorised ShiftFlow development work without creating project state or expanding task authority. -->

# ShiftFlow executable development plan

## Governed development workflow adoption — 2026-08-27

### Control record

| Field            | Value                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan ID          | `PLAN-DEVELOPMENT-WORKFLOW-20260827-01`                                                                                                                                                                                                                                                                  |
| Status           | `VALIDATED_AWAITING_LOCAL_COMMIT`                                                                                                                                                                                                                                                                        |
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
8. `IN_PROGRESS` — independent review, narrow staging and the successor staged
   gate are complete; create and verify the required local implementation
   commit.

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

| Check                                  | Result                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline and ownership preflight       | `PASS`: ShiftFlow clean at the recorded baseline; RAG-Challenge owner WIP was read only and preserved                                                                                                     |
| Stable-method comparison               | `PASS`: executable plan plus Doctor/Setup/Quick/Full/PlanOnly and canonical CI reuse selected; product-specific and uncommitted controls excluded                                                         |
| Implementation policy tests            | `PASS`: exact plans, environment isolation, fail-closed diffs/offline result, core ownership, Node matrix, no `secrets.*` and disposable remote inputs enforced                                           |
| PowerShell parse checks                | `PASS`: all four `eng/*.ps1` files parsed without errors                                                                                                                                                  |
| Doctor and deterministic plans         | `PASS`: policy executed every plan twice exactly; `dev:doctor` passed repository, tools, lock and prepared dependency checks                                                                              |
| Setup                                  | First attempt `FAIL` with npm `ECONNRESET`; separately retried successor `PASS`, restoring 427 packages and generating Prisma Client 7.10.0                                                               |
| Quick feedback loop                    | Two initial attempts `FAIL` at production-config validation exposed empty-value scrubbing; root cause corrected and successor `PASS`                                                                      |
| Runtime-credential-free full gate      | Online successor `PASS`: hostile inherited project values were isolated; quality, 28 unit tests and API/Web builds passed                                                                                 |
| Offline full diagnostic                | Initial run exited zero with audit `NOT_RUN`; after fail-closed correction one retest exposed a fixed JWT literal, and the final successor passed available checks then exited 1 as `INCOMPLETE_NON_GATE` |
| Online dependency audit                | Baseline `FAIL` with 14 vulnerabilities; successor all-dependency and production-only audits both `PASS` with zero vulnerabilities                                                                        |
| Dependency compatibility               | `PASS`: the online core passed on Node.js 22.12.0/npm 10.9.0 and Node.js 24.19.0/npm 11.17.0 with Prisma 7.10.0 and `deepmerge-ts` 8.0.0                                                                  |
| Build metadata preservation            | `PASS`: focused wrapper execution preserved the tracked `apps/web/next-env.d.ts` blob and restored its exact bytes and timestamp                                                                          |
| Documentation and prompt-system audit  | `PASS`: formatting, local link targets across all 14 changed Markdown files, version/state coherence and exact 17-file manifest                                                                           |
| Independent review                     | `PASS`: three independent read-only reviews accepted the final governance, dependency and workflow design with no remaining P0-P3 finding                                                                 |
| Staged diff hygiene and canonical gate | First staged attempt `FAIL` at `PLANS.md` formatting; after correction, the successor `PASS` covered policy, audit, 161 commented sources, quality, 28 tests, builds and all three diff paths             |
| Local commit                           | `PENDING`                                                                                                                                                                                                 |
