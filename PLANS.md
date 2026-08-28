<!-- Purpose: Records the executable plan and current evidence for authorised ShiftFlow development work without creating project state or expanding task authority. -->

# ShiftFlow executable development plan

## In-app notification centre — 2026-08-28

### Control record

| Field          | Value                                                                                                                                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan ID        | `PLAN-NOTIFICATION-CENTRE-20260828-01`                                                                                                                                                                                                                                                                                                             |
| Status         | `COMPLETED_LOCAL_PASS`; implementation commit `8486c468cd0c42ec88209ed4fcf7f3a8ea25dd50`; no deployment, production mutation or remote Git action                                                                                                                                                                                                  |
| Baseline       | Clean `main@de23e2d5c722c063b77620618eef45a0fb6458f7`                                                                                                                                                                                                                                                                                              |
| Authority      | Owner request to correct the inactive notification indicator and implement the notification system                                                                                                                                                                                                                                                 |
| Current state  | `STATE-08 PRODUCTION_RELEASE`; this is explicitly authorised post-release product maintenance                                                                                                                                                                                                                                                      |
| Positive scope | Real notification disclosure button, recipient-scoped list retrieval, individual and bulk read controls, unread count synchronisation, loading/empty/error states, pt-BR and en-GB labels, keyboard and dialog semantics, responsive presentation, focused regressions, browser inspection, canonical local gates, documentation and local commits |
| Negative scope | Notification schema, migration files, new event-generation rules, e-mail/push/SMS delivery, background workers, production data, deployment, publication, remote Git action, Human Gate or lifecycle transition                                                                                                                                    |

### Result and evidence

- The previous status-only bell is now a real disclosure button with an unread
  badge, expanded state and an accessible notification dialog.
- Opening the centre retrieves the first 20 notifications through the existing
  recipient-scoped REST contract. Authorised users can mark one or all visible
  notifications as read, with the list and unread count updated only after a
  successful API response.
- Loading, empty, contained failure and pending-action states are implemented.
  Escape and the explicit close control dismiss the panel; button, dialog,
  heading and live-count semantics are exposed to assistive technology.
- Browser inspection against the live integration fixture proved the real
  unread record, list and controls without mutating its read state. Desktop and
  390-by-844 responsive captures showed no clipping after the mobile bulk-action
  correction, and the inspected page emitted no console errors or warnings.
- Two focused files passed 57 tests. Source-comment verification, lint, type
  checking, production build and candidate diff hygiene passed. The `Quick`
  non-gate passed 62 files and 529 tests, both application builds and 19 .NET
  tests. The single online `Full` gate passed zero npm and .NET vulnerabilities,
  formatting, source comments, workflow policies, lint, type checking, Prisma
  generation/validation, override and production-configuration checks, the
  secret scan, all 529 Node tests, both production builds, all 19 .NET tests and
  candidate diff hygiene.

### Residual boundary

The centre intentionally consumes the existing persisted notification stream.
Creating new notification-generation rules or adding external delivery channels
requires separate event and product authority.

## Local direct demo access — 2026-08-28

### Control record

| Field          | Value                                                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan ID        | `PLAN-LOCAL-DEMO-ACCESS-20260828-01`                                                                                                                                                                                                                                                                            |
| Status         | `COMPLETED_LOCAL_PASS`; implementation commit `d3d690ff16fabad22cf849d737367574f61548d5`; no production authentication change, push, deployment or lifecycle transition                                                                                                                                         |
| Baseline       | Clean `main@03eee0b00eb2b05dac008cf18710d02802a088d9`                                                                                                                                                                                                                                                           |
| Authority      | Owner request to remove the visible authentication step, open the local system directly and create demonstration credentials                                                                                                                                                                                    |
| Current state  | `STATE-08 PRODUCTION_RELEASE`; this is authorised post-release local demonstration maintenance                                                                                                                                                                                                                  |
| Positive scope | Development-only direct session bootstrap, one configured demo identity, loopback enforcement, production rejection, protected refresh/CSRF cookies, Web session restoration, fallback login outside demo mode, environment isolation, focused regressions, local provisioning, documentation and local commits |
| Negative scope | Production authentication bypass, embedded password, schema or migration-file changes, remote access, OAuth/OIDC migration, external identity, production data, deployment, publication, remote Git action, Human Gate or lifecycle transition                                                                  |

### Result and evidence

- Development defaults to `AUTH_MODE=demo` and `demo@shiftflow.local`. When no
  refresh session exists, the Web requests one direct demo session and opens the
  authorised application without rendering the login form. The sign-out action
  is absent for that session because the same local mode would immediately
  recreate it.
- The Express service resolves the configured live user, default active company
  and current company-wide permissions before issuing the existing access and
  refresh-token contract. Direct access returns `404` when disabled or when the
  request is not loopback. `AUTH_MODE=demo` is rejected when `NODE_ENV=production`.
- No password or usable fallback credential is versioned. The local integration
  database provisioned `demo@shiftflow.local` with a generated 24-character
  password whose plaintext was placed only on the owner's Windows clipboard.
- The focused runtime probe returned `200`, `authenticationMode=demo`, the exact
  configured e-mail, a bearer token and a protected refresh cookie without
  exposing the refresh token in the response body. The temporary API validation
  container was removed afterwards.
- Four focused files passed 112 tests. The `Quick` non-gate passed 61 files and
  525 tests, both application builds and 19 .NET tests. The first canonical
  `Full` attempt correctly failed because `AUTH_MODE` and `AUTH_DEMO_EMAIL` were
  absent from the environment-isolation boundary; the boundary and its policy
  regression were corrected. The successor online `Full` gate passed zero npm
  and .NET vulnerabilities, formatting, source comments, workflow policies,
  lint, type checking, Prisma generation/validation, override and production
  configuration checks, a 336-file secret scan, all 525 Node tests, both
  production builds, all 19 .NET tests and candidate diff hygiene.
- The ordinary local Prisma migration command first failed with a schema-engine
  connectivity error, and its container successor could not reach the Prisma
  binary host (`EAI_AGAIN`). The unchanged approved migration SQL was therefore
  applied sequentially to the fresh local PostgreSQL container and recorded
  with its SHA-256 checksums before the existing integration seed provisioned
  the demo identity. This local recovery is not production migration evidence.

### Residual boundary

The direct mode is intentionally unavailable in production and from non-loopback
clients. Resetting the local PostgreSQL volume removes the provisioned demo
identity and requires a new runtime-only password and seed execution. The
generated password is not recoverable from Git or repository files.

## ASP.NET Core strangler foundation — 2026-08-28

### Control record

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan ID        | `PLAN-ASPNET-STRANGLER-20260828-01`                                                                                                                                                                                                                                                                                                                                                                          |
| Status         | `COMPLETED`; implementation commit `7a24d6265526d9e386ca639e36ad11c167db17a2`, final canonical gates, disposable runtime evidence and independent review are complete; this plan does not imply production cutover                                                                                                                                                                                           |
| Baseline       | `main@30ea067f56d271ad3abe956823bc310c31acddc5`, tree `fb943e668ca975b8b7675988c90d8de34d27f91c`, with clean worktree and index before the audit lanes                                                                                                                                                                                                                                                       |
| Authority      | Owner request to evolve ShiftFlow with HTML5, CSS3, TypeScript, React/Next.js, C# with ASP.NET Core, PostgreSQL, Redis, REST and justified GraphQL, OAuth 2.0/OIDC/JWT, Docker, Linux, Nginx, one selected cloud, GitHub and GitHub Actions                                                                                                                                                                  |
| Current state  | `STATE-08 PRODUCTION_RELEASE`; this post-release architecture work does not itself authorise a lifecycle transition, deployment or production route change                                                                                                                                                                                                                                                   |
| Positive scope | Read-only architecture audit; provider-neutral strangler decision; ASP.NET Core compatibility host; PostgreSQL reads; Redis-backed distributed cache/session foundation; legacy JWT compatibility validation; audit read endpoints; OpenAPI for the migrated surface; Linux containers; reversible Nginx routing; additive .NET gates; documentation; proportional local validation and scoped local commits |
| Negative scope | Existing `.env` access; schema or applied-migration changes; dual migration ownership; OIDC provider integration; external identity linking; cloud-provider selection or IaC; GraphQL without a measured use case; business mutations in .NET; removal of Express/Prisma; remote Git actions; deployment; publication; secrets; Human Gate or lifecycle approval                                             |
| Parallel work  | Three frozen-baseline read-only audit lanes were reconciled; every edit, dependency restore, validation, staging and commit remains sequential in the coordinating worktree                                                                                                                                                                                                                                  |

### Objective

Introduce the first production-shaped ASP.NET Core migration slice without a
flag-day rewrite. The current Next.js application and REST contract remain
stable, Prisma remains the sole migration owner, and Nginx can route only the
read-only Audit module to the new host with an immediate configuration rollback.

### Reconciled architecture decisions

| Concern            | Decision for this plan                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend           | Retain the existing Next.js/React/TypeScript application and its HTML5/CSS3 accessibility controls. Add only an explicit build-time allowance for same-host loopback HTTP in the disposable migration profile; production and non-loopback origins retain the HTTPS requirement.           |
| Backend            | Add a .NET 10 LTS modular host beside Express. Preserve module boundaries and move one complete read-only module before any mutation aggregate.                                                                                                                                            |
| Data               | Read the existing PostgreSQL schema literally through Npgsql. Prisma remains the only owner of schema, migrations and seeds throughout coexistence.                                                                                                                                        |
| Cache and sessions | Add Redis as distributed infrastructure with explicit namespace and health semantics. PostgreSQL remains authoritative for tenant, RBAC, revocation and audit data.                                                                                                                        |
| API                | REST remains canonical. The migrated Audit endpoints retain the current envelope, status, pagination, errors and request identifier. GraphQL remains deferred until dashboard/reporting evidence justifies it.                                                                             |
| Identity           | Validate the current HS256 JWT only as a temporary compatibility bridge and revalidate revocation, credential version, active membership and RBAC in PostgreSQL. OAuth 2.0/OIDC and the recommended BFF session design require a separately selected IdP and forward-only identity schema. |
| Edge               | Nginx provides one same-origin entry point. `/api/audit`, its detail descendants and `/openapi/` are allowlisted to ASP.NET Core; every other `/api` path plus public `/health` and `/ready` remains on Express.                                                                           |
| Cloud              | Keep the implementation portable between Azure and AWS. Provider-specific services, IaC and deployment remain blocked until the owner selects one platform.                                                                                                                                |
| Delivery           | Preserve Node.js 22/24 gates and add a separate blocking .NET gate. Disposable runtime validation begins only after both core gates pass.                                                                                                                                                  |

### Acceptance criteria

1. The repository contains a locked .NET 10 solution with clear API,
   application, domain, infrastructure and test boundaries.
2. ASP.NET Core `/health` is dependency-free, while its internal `/ready`
   fails closed unless PostgreSQL, Redis and data protection respond. Public
   `/ready` remains on Express, so migration-profile acceptance also requires
   the aggregate container healthcheck and a migrated-route smoke through Nginx.
3. `GET /api/audit` and `GET /api/audit/{id}` preserve the existing public
   envelope, pagination, filters, status codes, request identifier and
   company-scoped data shape.
4. Authentication accepts only the explicitly configured legacy HS256 issuer
   and key. It rejects malformed, expired, revoked or stale-credential tokens
   and inactive user/company membership.
5. `audit:read` is resolved from current PostgreSQL assignments and cannot be
   granted by stale token permission claims or a mismatched `x-company-id`.
6. No .NET migration is created and no existing Prisma migration is changed.
7. Redis configuration is explicit, namespaced and used by the distributed
   cache/session foundation; readiness reports Redis loss instead of silently
   approving a degraded host, and runtime evidence proves dependency plus
   migrated-route recovery after Redis restarts.
8. Linux container images run as non-root, and the Nginx migration route is
   isolated, same-origin and reversible without data changes.
9. Local development and GitHub Actions treat the .NET build, formatting,
   tests, lock files and dependency vulnerabilities as blocking evidence while
   preserving the existing Node gates.
10. Focused tests, the canonical core gate and proportional container/runtime
    checks pass before the plan is closed and committed locally without push.

### Execution plan

1. `COMPLETED` — reconcile authority, current Git identity, repository
   instructions, runtime architecture and the requested target stack.
2. `COMPLETED` — run and reconcile independent read-only backend,
   identity/infrastructure and frontend/CI migration audits.
3. `COMPLETED` — record the strangler decision and implement the locked
   ASP.NET Core compatibility host with PostgreSQL, Redis and legacy JWT/RBAC
   boundaries.
4. `COMPLETED` — implement and specify the read-only Audit REST slice, including
   focused contract and tenant-isolation regressions.
5. `COMPLETED` — add Linux containers, reversible Nginx routing and additive
   local/GitHub .NET gates.
6. `COMPLETED` — run focused, canonical and container/runtime validation; obtain
   an independent read-only diff review and resolve verified findings.
7. `COMPLETED` — close evidence, stage only the authorised candidate and create
   the required scoped local commits without push or remote action.

### Current evidence and rejected iterations

- `PASS` — the workflow policy, PowerShell parsers, Prettier check, diff hygiene
  and source-comment manifest checks pass after the final runtime-script edits.
- `PASS` — 37 focused Node.js regressions and 19 focused .NET tests passed; the
  .NET Release build completed with zero warnings/errors and its format check
  reported no changes before the runtime sequence.
- `PASS` — the authority-bound runtime gate built the pinned images and proved
  seven non-root identities, routed OpenAPI/Web/Audit compatibility, current
  PostgreSQL tenant/RBAC/credential/revocation authority, recursive
  sanitisation, Redis counter persistence, fail-closed behaviour and explicit
  readiness plus migrated-route recovery after restart, and Data Protection
  across actual ASP.NET Core container removal/recreation. Cleanup removed every
  disposable container, network and volume.
- `PASS` — the same-process wrapper proved exact preservation of four existing
  caller variables and absence of four originally absent variables. The gate
  now checks that eight-variable boundary before emitting its sole `PASS`.
- `PASS` — the final runtime successor additionally proved exact PostgreSQL,
  Redis and Data Protection readiness after the Redis restart and a routed
  `401 UNAUTHORIZED` response, rather than the fail-closed `503`, before it
  emitted `redisRecoveredAfterRestart: true` and completed cleanup.
- Earlier candidate runs were rejected without promotion when they exposed a
  missing generated Prisma engine, a non-root Nginx temporary-directory
  permission error, a false root conclusion based on an exec process instead
  of effective PID 1, an unsafe expectation that an invalidated token should
  become valid again, ISO timestamp coercion that lost millisecond precision,
  and Windows process-environment removal that materialised empty entries. Each
  root cause was corrected and statically protected before the final passing
  runtime run.
- `PASS` — `Doctor` confirmed the repository root, required toolchains, npm and
  NuGet lock metadata, and prepared dependencies.
- `REJECTED_NON_GATE` — the first and only `Quick` run stopped at ESLint because
  `URL` was not explicitly imported by the disposable security control. The
  import was corrected; the non-gating loop was not retried.
- `REJECTED` — the first canonical online `Full` run stopped at the secret scan
  because sensitive-key fixtures used password-like literal values. The
  fixtures were made explicitly test-only, the canonical scan passed and its
  focused Vitest suite passed all four cases.
- `PASS` — the final canonical online `Full` successor reported zero npm and
  .NET dependency vulnerabilities; 61 Vitest files with 521 tests and all 19
  .NET tests passed; Express, Next.js and .NET Release builds passed; .NET had
  zero warnings/errors; formatting, source comments, workflow policies, lint,
  type checking, Prisma generation/validation, overrides, production
  configuration, the 336-file secret scan and candidate diff hygiene passed.
- `CANDIDATE` — the final independent read-only review found P0/P1/P2 zero for
  the local/CI candidate and retained only the documented production and
  operational residual risks.
- `PASS` — the authorised implementation candidate was committed locally as
  `7a24d6265526d9e386ca639e36ad11c167db17a2`; no push, deployment, publication,
  Human Gate approval or lifecycle transition occurred.

### Residual and deferred boundaries

| Item                        | Disposition                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloud and external identity | Azure versus AWS and the OAuth 2.0/OIDC provider remain owner decisions. No provider-specific IaC, external account linking or production authentication cutover is inferred.                                                                          |
| GraphQL                     | Deferred until measured dashboard/reporting composition demonstrates that a second API style is justified; REST remains canonical.                                                                                                                     |
| Runtime concurrency         | The disposable profile uses fixed loopback ports and a fixed trusted-proxy subnet. It is sequential-only until collision-safe port/subnet allocation is designed and revalidated.                                                                      |
| Image contents              | The transition Node.js images favour compatibility: API/Web share root production dependencies and the Web runtime retains more workspace content than necessary. Workspace-specific pruning and Next.js standalone output require measured follow-up. |
| Container supply chain      | Base images are digest-pinned, but there is no blocking OCI vulnerability scan, generated SBOM or attestation policy. These are required before the topology can serve as production supply-chain evidence.                                            |

## Governed hand-off structural alignment — 2026-08-27

### Control record

| Field          | Value                                                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan ID        | `PLAN-HANDOFF-STRUCTURE-20260827-01`                                                                                                                                                                                                                                                                                                |
| Status         | `COMPLETED`                                                                                                                                                                                                                                                                                                                         |
| Baseline       | `main@cee6d101b9358acd2ecd601dbec8d9d52b57fe06`, tree `d89cdb61cc376d7a4e5bfd3959f4180b788ae0cb`; four pre-existing modified files under `apps/api/src/modules/activities/` and three subsequently observed files under `apps/web/app/` are preserved outside this plan                                                             |
| Authority      | Owner request to use the same governed hand-off structure as RAG-Challenge                                                                                                                                                                                                                                                          |
| Current state  | `STATE-08 PRODUCTION_RELEASE`; this prompt-system change does not authorise or record a lifecycle transition                                                                                                                                                                                                                        |
| Positive scope | Governed hand-off field structure, presentation, routing semantics, quality checks, audit checks, prompt-system version, current evidence, governance index, plan evidence, proportional documentation validation and one narrowly staged local commit                                                                              |
| Negative scope | Ordinary-delivery trigger changes; RAG-Challenge Stage 0/1/2, corpus, provider, rights, deployment or public-projection identities; a new prompt or JSON projection; functional code; the existing Activities and Web work; schema; migrations; dependencies; runtime; database; network; Human Gate; push; deployment; publication |
| Parallel work  | Three frozen-input read-only comparisons are permitted; every ShiftFlow edit, validation, staging and commit remains sequential in this coordinating worktree                                                                                                                                                                       |

### Objective

Replace the ShiftFlow governed hand-off's extended routing contract with the
compact RAG-Challenge structure while preserving ShiftFlow's conditional
handoff trigger, authority model, worker controls, lifecycle extension and
17-file prompt corpus.

### Source-to-target decisions

| RAG-Challenge contract element                                                                     | ShiftFlow disposition                                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Compact result summary before routing                                                              | `ADOPT`, using `Solicitação`, `Próximo trabalho recomendado`, `Estado/critério` and `Sua ação agora` |
| `Conversa recomendada` -> copy-ready title -> reasoning -> parallelism -> copy-ready payload       | `ADOPT`, as one uninterrupted five-field sequence                                                    |
| Level-three title and payload headings, fenced populated values and exact inline absence sentinels | `ADOPT`                                                                                              |
| Conditional parallel plan and lane messages after the main payload                                 | `ADOPT`, preserving ShiftFlow's existing ownership and isolation rules                               |
| Required closing hand-off for every RAG-Challenge request                                          | `DO_NOT_ADOPT`; ShiftFlow version 5.0 conditional ordinary-delivery semantics remain current         |
| Stage 0/1/2 instruction and public projection enforcement                                          | `DO_NOT_ADOPT`; these are RAG-Challenge-specific controls outside this request                       |

### Acceptance criteria

1. Governed handoffs use one compact result summary followed by the exact
   uninterrupted five-field sequence.
2. `START_NEW` has a separately copyable non-canonical title; the other routes
   use the exact title absence sentinel.
3. A required payload is complete and fenced as `text`; an absent payload uses
   the exact inline sentinel.
4. Reasoning combines the level, justification and explicit fallback, while
   parallelism retains the three existing canonical enums.
5. `SEQUENTIAL_ONLY` creates no artificial plan or lane-message fields;
   conditional parallel material follows the complete main sequence.
6. Ordinary delivery triggers, worker envelopes, state-transition extension,
   authority boundaries and the 17-file prompt corpus remain intact.
7. Version, current state, snapshot, changelog, governance index, quality gates
   and prompt-system audit agree on version `6.0.0`.
8. Documentation formatting, local links, manifest, canonical order,
   sentinels, enums and diff hygiene pass; an independent read-only review
   finds no unresolved material contradiction.
9. The validated documentation change is committed locally without staging or
   altering the separately observed Activities or Web work.

### Execution plan

1. `COMPLETED` — verify both repository baselines and compare the current
   RAG-Challenge public hand-off contract with ShiftFlow authorities.
2. `COMPLETED` — define the minimum source-to-target mapping and exclude
   RAG-specific identities and enforcement.
3. `COMPLETED` — update the canonical protocol, language policy, gates,
   audit checks, version, current evidence and governance mapping.
4. `COMPLETED` — run proportional documentation and prompt-system validation.
5. `COMPLETED` — obtain independent read-only semantic review and correct every
   verified finding sequentially.
6. `COMPLETED` — stage only the plan and governance documents, check the staged
   diff and create the required local commit without push or remote action.

### Validation evidence

| Check                             | Result                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline and ownership            | `PASS`: RAG-Challenge public contract sources were read-only; ShiftFlow began at `main@cee6d101` with four Activities files owned elsewhere, and the owner later confirmed temporary external ownership of those files plus three Web files while this plan exclusively owns the governance documents                            |
| Initial custom document validator | `FAIL`: the task-local validator incorrectly joined an already prefixed `prompts/` path as `prompts/prompts/...`; this was a validation-script path-normalisation defect, not a repository finding                                                                                                                               |
| Corrected prompt-system validator | `PASS`: exact 17-file corpus, version `6.0.0`, `STATE-08`, 29 local Markdown links across 20 control documents, canonical hand-off order, owner-facing target values, headings, fences and absence sentinels passed                                                                                                              |
| Formatting and diff hygiene       | `PASS`: targeted Prettier check and scoped `git diff --check` passed for all ten plan/governance documents                                                                                                                                                                                                                       |
| Independent semantic review       | Initial reviews returned `NOT_CANDIDATE` and identified missing result distinctions, conditional-trigger and first-delivery ambiguities, presentation adjacency, non-Portuguese owner-facing values and unnecessary RAG identities. After focused corrections, three successor reviews returned `CANDIDATE` with P0-P3 all zero. |
| Scoped local commit               | `PASS`: the candidate set contains only these ten documents; the seven separately owned API/Web files retain their confirmed hashes and remain unstaged; the commit containing this evidence is the required automatic local closeout, with no push or remote action                                                             |

## Whole-project audit and corrective systematisation — 2026-08-27

### Control record

| Field            | Value                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan ID          | `PLAN-WHOLE-PROJECT-AUDIT-20260827-01`                                                                                                                                                                                                                                                                       |
| Status           | `COMPLETED` on `2026-08-28`; no lifecycle transition, Human Gate, deployment or remote action is implied                                                                                                                                                                                                     |
| Baseline         | `main@4191ee6a5c87d157f933671333253ce3b4605e72`, tree `40a440d2d05b1b07cbadedf8c8a07b1945646cac`, clean before all audit lanes and reverified unchanged before integration                                                                                                                                   |
| Authority        | Owner request for an extremely detailed whole-project audit followed by organisation, cleanup and optimisation                                                                                                                                                                                               |
| Current state    | `STATE-08 PRODUCTION_RELEASE`; this corrective maintenance does not itself authorise a lifecycle transition                                                                                                                                                                                                  |
| Maintenance mode | `Mode B - Systematisation` under the active maintenance playbook                                                                                                                                                                                                                                             |
| Positive scope   | Read-only whole-project audit; root-cause corrections for confirmed security, tenant, session, data-shaping, API-contract, operational-safety, frontend-integrity, accessibility, performance, test, documentation and governance defects; proportional validation; local commits                            |
| Negative scope   | Product redesign; invented requirements; applied-migration edits; unapproved schema changes; local `.env` access; mutation of an existing database; deployment; publication; remote Git actions; secrets; Human Gate or lifecycle approval; removal of dependencies or artefacts without demonstrated safety |
| Parallel work    | Three frozen-input read-only audit lanes were reconciled; every write, validation, staging and commit is sequential in the coordinating worktree                                                                                                                                                             |
| Implementation   | Local commit `7e7fcdb5a0a75d1fbda3d9528d86f76f20f7a92e` (`fix(audit): complete corrective systematisation`), produced from the frozen 105-path candidate with manifest SHA-256 `086a2623d94573b793e4406d87c31df7d11cdc00425c302436c7b3953bc9f478`                                                            |

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
6. `COMPLETED` — correct response shaping, validation, pagination, activity evidence
   growth, lifecycle bypasses and safe query/performance defects without schema drift.
7. `COMPLETED` — correct frontend session/request lifecycle, capability guards,
   detail truthfulness, Kanban integrity and accessibility in focused slices.
8. `COMPLETED` — remove only demonstrably dead residue, reduce duplicated maintenance
   structures and reconcile tests, CI, documentation and current-state evidence.
9. `COMPLETED` — run focused tests after every slice, then Quick and the canonical
   online core gate; preserve the first factual failure and correct only by a
   separately evidenced successor run.
10. `COMPLETED` — use a newly provisioned disposable database and isolated ports for
    applicable E2E, axe accessibility and performance checks across the configured
    desktop/mobile viewports without touching existing local data. Physical-device
    and Pixel Perfect review remains explicitly deferred below.
11. `COMPLETED` — obtain independent read-only review of the final candidate, resolve
    verified findings sequentially, close this plan with exact evidence and create
    narrow local commits. No remote publication is authorised.

### Increment evidence

| Increment                                                                                   | Disposition                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operational safety, destructive-seed guard, secret scanner and runbook reconciliation       | `COMPLETED_CORE_GATE_PASS` | Side-effect-free platform workflow passed in Windows PowerShell 5.1 and PowerShell 7; focused scanner/seed tests passed; secret scan inspected 225 Git-candidate files without values; `dev:quick` and the online canonical `dev:full` gate passed with zero npm vulnerabilities, 9 test files, 40 tests and production builds; independent review reached `CANDIDATE` after all P1/P2 findings were corrected. Docker, application services, ports, seed and database were not invoked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tenant RBAC, resource-aware comments, recipient notifications and simple user-role boundary | `COMPLETED_CORE_GATE_PASS` | Three independent read-only reviews reached `CANDIDATE` after all verified P1/P2 successors were corrected. Eleven focused files with 61 tests passed; the full non-gate Quick loop and the canonical online core gate passed formatting, source-comment and platform policies, lint, type checking, Prisma generation and validation, dependency overrides, production configuration, a redacted scan of 235 Git-candidate files, 19 unit-test files with 98 tests, both production builds and `npm audit` with zero vulnerabilities. Docker, application services, ports, database and browser were not invoked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Authentication, access/refresh lifecycle, atomic lockout and frontend session recovery      | `COMPLETED_CORE_GATE_PASS` | Refresh consumption and logout races use conditional writes with distinct expired/reused/conflict outcomes and recheck expiry after acquiring the token lock. Password changes calculate a strictly increasing credential version after locking the user and revoke refresh sessions in the same transaction; login and rotation use the same lock order and revalidate the exact credential before issuing a token. Inactive, deleted, companyless, detached and pre-password-change sessions fail closed; access requests revalidate persistent revocation plus live user/company membership, and route authorisation queries current RBAC state even when UI claims await refresh. Failed-login state is atomic; the browser uses bounded single-flight refresh, preserves a newer refresh from an older retry, settles deferred tenant operations only through the active session epoch and rejects protocol/host incompatibility or non-HTTPS production requests. The production gate separately enforces canonical origins without credentials, paths, queries or fragments. Eight focused files with 83 tests passed, and the full non-gate Quick loop plus the canonical online core gate passed formatting, source-comment and platform policies, lint, type checking, Prisma generation and validation, dependency overrides, production configuration, a redacted scan of 240 Git-candidate files, 23 unit-test files with 162 tests, both production builds and `npm audit` with zero vulnerabilities. Three independent review rounds correctly returned `NOT_CANDIDATE`; all three final successor reviews reached `CANDIDATE` with no P0-P3 finding. No service, port, browser, database, seed or local credential was used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| API response, validation, query composition, bounded pagination and activity evidence       | `COMPLETED_CORE_GATE_PASS` | Responses recursively convert `BigInt` to decimal strings and redact both data and metadata; public activity attachments expose only the supported projection and exclude deleted records; activity history persists a bounded scalar delta rather than prior relations or history. Resource identifiers, pagination, the explicitly handled malformed and oversized body-parser cases and module queries now fail with bounded client errors; activity pagination is applied by the repository while preserving the omitted-query default of 100. Activity, dashboard and report filters compose without overwriting explicit predicates and preserve validated millisecond precision; report status and membership intervals are constrained. Thirteen focused files with 52 tests and the complete 35-file/205-test unit suite passed, followed by the full non-gate Quick loop. Three independent read-only successor reviews reached `CANDIDATE`; no P0, P1 or P3 remained in this lot, and the pre-existing frontend P2 alignment work remains explicitly open. The canonical online core gate then passed repository/toolchain/lockfile preflight, workflow policy, clean lockfile installation, Prisma generation and validation, `npm audit` with zero vulnerabilities, formatting, source-comment and platform policies, lint, type checking, dependency overrides, production configuration, a redacted scan of 252 Git-candidate files, all 35 unit-test files with 205 tests and both production builds. No service, port, browser, database, seed or local credential was used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Activity aggregate atomicity, reference locks and main-Kanban drop compatibility            | `COMPLETED_CORE_GATE_PASS` | Activity create, update, soft-delete, move, assign and reopen now mutate the Activity and write AuditLog plus ActivityHistory through one repository-owned explicit transaction. Updates lock and re-read the tenant-scoped active Activity before planning; create locks every active reference, while updates acquire deterministic `FOR SHARE` locks only for references present and actually changed. Invalid new references fail before aggregate writes, historical inactive references do not block unrelated lifecycle work, and repeated state/assignee commands create no evidence. Generic status updates apply lifecycle timestamps under the lock. The main Kanban clears drag state and emits no move for a same-column drop; its real component handler has a 0/1-call regression. Four focused files with 43 tests, the complete 36-file/230-test unit suite, lint, type checking and diff hygiene passed. Three independent read-only review rounds correctly returned `NOT_CANDIDATE`; the final successors converged on `CANDIDATE` with no P0-P3 finding. The non-gate Quick loop and canonical online Full gate then passed repository/toolchain/lockfile preflight, workflow policies, a clean installation of 427 packages, Prisma generation and validation, `npm audit` with zero vulnerabilities, formatting, source-comment and platform policies, lint, type checking, dependency overrides, production configuration, a redacted scan of 253 Git-candidate files, all 36 unit-test files with 230 tests and both production builds. A direct `eng/ci.ps1 -SkipInstall` successor repeated the canonical core checks successfully. Real PostgreSQL rollback, lock waiting/concurrency/deadlock behaviour and browser drag-and-drop remain unvalidated and are reserved for the disposable-runtime step. No service, port, browser, database, seed or local credential was used.                                                                                                                                                                                                                                                                                                                                          |
| Internal task-board transactions, ordering, lifecycle and Web compatibility                 | `COMPLETED_CORE_GATE_PASS` | Every task-board command now locks the active tenant Activity first and owns column/task positioning plus task-history evidence in one explicit transaction. New Activities provision four default columns inside Activity creation; GET is read-only and returns a lock-consistent snapshot, while legacy Activities without columns remain factually empty until a write-authorised user creates one. Reorder requires a complete canonical UUID permutation and returns the complete post-write board from the same transaction; the Web consumes it without a second GET. Create, edit, move, delete, archive and explicit restore normalise positions, validate changed memberships and attachments under lock, reject lifecycle bypasses and preserve no-op evidence rules. Archived tasks are recoverable into an explicit active destination, bounded to the 100 newest records with a truncation flag, and prevent unsafe column deletion until restored or deleted. The Web fixes duplicate/drop-before movement, clears drag state before dispatch, preserves exact unchanged due instants, emits changed local times as ISO, permits description clearing and safely captures form elements before awaits. Six focused test files with 74 tests, the complete 38-file/268-test unit suite, type checking, lint and diff hygiene passed. Repeated independent read-only reviews correctly returned `NOT_CANDIDATE` while defects remained; the final three successors converged on `CANDIDATE` with P0-P3 zero. The non-gate Quick loop and canonical online Full gate passed repository/toolchain/lockfile preflight, development and platform workflow policies, a clean installation of 427 packages, Prisma generation and validation, `npm audit` with zero vulnerabilities, formatting, source-comment policy, lint, type checking, dependency overrides, production configuration, a redacted scan of 256 Git-candidate files, all 38 unit-test files with 268 tests and both production builds. Real PostgreSQL rollback, lock waiting/deadlock behaviour, `ANY(uuid[])` binding and browser interaction remain reserved for the disposable-runtime step. No service, port, browser, database, seed or local credential was used. |
| Dashboard snapshots, atomic configuration, deterministic metrics and queued Web persistence | `COMPLETED_CORE_GATE_PASS` | Dashboard summary and charts now use endpoint-local repeatable-read snapshots with one captured clock, gap-free overdue/SLA-risk boundaries, stable grouping and a deterministic recent-completion sample that excludes negative durations. Activity list items and total share one repeatable-read snapshot and a total order. Configuration GET is read-only and returns a virtual default; save/reset lock the current membership, optional team and nullable-team configuration identity, reconcile durable widget keys and complete configuration plus widget writes in one transaction. Path/body dashboard types must agree, duplicate active configurations and foreign widget IDs fail closed, and widget order is normalised compatibly. Web persistence is serial, cumulative across intermediate parent responses and guarded before invocation and after resolution by the authenticated session epoch. Seven focused files with 44 tests, the complete 40-file/292-test unit suite, type checking, lint, formatting and diff hygiene passed. Three final independent read-only reviews reached `CANDIDATE` with P0-P3 zero after two test-power findings were corrected. The preserved intermediate failures were a 1/41 focused test exposing a separately constructed SLA boundary and a targeted plan-format check; each direct successor passed after the narrow correction. The non-gate Quick loop and canonical online Full gate passed repository/toolchain/lockfile preflight, development and platform workflow policies, a clean installation of 427 packages, Prisma generation and validation, `npm audit` with zero vulnerabilities, formatting, source-comment policy, lint, type checking, dependency overrides, production configuration, a redacted scan of 259 Git-candidate files, all 40 unit-test files with 292 tests and both production builds. Physical PostgreSQL isolation, rollback, lock and nullable-team concurrency remain reserved for the disposable-runtime step; no schema, migration, service, port, browser, database, seed or local credential was used.                                                                                                                                       |
| Tenant-safe administration, RBAC lock ordering and paginated reference APIs                 | `COMPLETED_RUNTIME_PASS`   | User identity, membership, permanent-role normalisation, audit evidence and refresh-session revocation now share one transaction with deterministic locks. Role mutation and assignment both lock and revalidate the live tenant Role; conflicting assignment/removal orders fail closed. Client, shift, team, user, role and permission references expose bounded stable pagination. The dedicated fail-closed PostgreSQL command executed 7 real tests covering two-company shared-user isolation, rollback, duplicate-role normalisation and both Role/assignment lock orders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Tenant-aware Web lifecycle, truthful controls and accessibility                             | `COMPLETED_RUNTIME_PASS`   | Remote selectors preserve requested pages, debounce only changed searches and reject stale session-epoch results. Dashboard persistence is serial and cumulative; custom layouts preserve explicit removal of the main widget. Activity detail, task-board lifecycle, history labels, pending operations, errors, pagination and role/user controls now have focused regressions. First/last task movement controls and existing-role removal options are truthful, modal semantics are keyboard-safe and transient dark-theme contrast no longer fails axe. The final browser envelope passed 11 release E2E cases with 3 expected project skips across Desktop Chrome and Pixel 5 profiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Cleanup, fail-closed workflow and final integrated evidence                                 | `COMPLETED_LOCAL_PASS`     | Nine unused DTO residues were removed, shared dead helpers were reduced, source-comment verification now covers present tracked and untracked Git candidates, homologation volume/reference scope is bounded, and the dedicated PostgreSQL command cannot green-skip when its opt-in is absent. CI runs that regression after migrations with per-run credentials. Three independent final successor reviews converged on `CANDIDATE` with P0/P1/P2 zero. The successor `Quick` (`NON_GATE`) and canonical `Full` passed 60 files/514 tests, 222 source files, 1,311 CSS declarations, lint, type checking, Prisma validation/generation, override and production-config checks, secret scanning of 281 candidates, clean installation of 427 packages, `npm audit` with zero vulnerabilities and both builds. Implementation is commit `7e7fcdb5a0a75d1fbda3d9528d86f76f20f7a92e`; no push or remote action occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Closed findings and final evidence

- The final frozen candidate contained 105 paths: 96 present files and 9 proven
  unused DTO deletions. Its logical manifest SHA-256 was
  `086a2623d94573b793e4406d87c31df7d11cdc00425c302436c7b3953bc9f478`.
- Real PostgreSQL evidence used only freshly generated databases named
  `shiftflow_runtime_<24 lowercase hexadecimal characters>` on loopback port
  55432, ephemeral credentials and exact-name/label Docker cleanup. The final
  run `c2eda231b83b7f125a36ec9a` passed 12 migrations, 7 PostgreSQL regressions,
  integration and 120-record homologation seeds, 11 release E2E cases with 3
  expected skips, and 3 repeated load cases with 3 expected mobile skips. The
  exact disposable container was removed and ports 3000, 3001 and 55432 were
  verified free; no existing database, `.env`, service or credential was used.
- The preserved runtime chain remained factual and sequential: provider
  injection, deterministic rollback time, overdue fixture timing, accented
  navigation, shell selector, cleanup ordering, transient dark-theme contrast
  and Prisma relation fan-out each failed in earlier runs and passed only after
  a narrow successor. Run `9af22a2bee699228c89a59ed` was the first clean
  relation-join successor. During final closure, run
  `4146e26338ec70dc286b5fc8` exposed an incorrect `NODE_ENV=test` harness, run
  `53f4baf189c27ef7b7f893fb` exposed a non-existent system Chrome path and run
  `4e634c129b0c3643bb0da1c2` stopped in preflight before mutation because of a
  path-encoding error; only the corrected final run above is recorded as PASS.
- The first final `Quick` stopped at formatting after Next.js generated current
  TypeScript metadata. The generated `root-params.d.ts` import was retained,
  the diagnostic-only `.next/dev/dev/types` path was removed, and the separately
  executed successor passed. `Full` then passed once, including the clean install,
  zero-vulnerability audit, 60-file/514-test suite and both production builds.
- Independent backend, frontend and cross-cutting successor reviews all returned
  `CANDIDATE` with no P0, P1 or P2 finding after the final Role-assignment lock
  revalidation, remote-selector page, custom dashboard, task movement,
  existing-role and fail-closed PostgreSQL corrections.

### Deferred-by-authority or decision boundary

- Database constraints, composite relations, partial unique indexes and any new
  migration remain recommendations until separately justified and authorised.
- The dedicated PostgreSQL suite proves the user/global-identity and RBAC lock
  cases in its contract. E2E exercises Activity, dashboard and task-board flows,
  but direct concurrency/deadlock stress for every aggregate and browser pointer
  drag-and-drop remain future focused evidence rather than inferred coverage.
- Dashboard summary, charts and operational-list calls remain separate HTTP
  snapshots, so the composed page is eventually consistent across endpoints.
  A bundled read model or explicit `asOf` contract requires a product/API decision.
- Refresh tokens do not yet carry a session-family identifier. Reuse, a lost
  refresh CAS or a concurrent logout therefore revokes every active refresh
  token for the user in that company. This is the current fail-closed response;
  narrower device/session revocation requires an authorised schema design and
  migration.
- Multi-assignment administration, final RBAC delegation hierarchy, timezone
  semantics, attachment storage, full report/notification product surfaces and
  production deployment topology require explicit product or architecture
  decisions; corrective code must not invent them. The global user identity and
  tenant membership mutation boundary itself is now enforced transactionally.
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
- Legacy Activities without task columns remain truthfully empty until an
  authorised write provisions them. No backfill was authorised, and durable
  completion classification requires a future column-type schema decision.
- Pixel Perfect approval requires an authorised reference baseline. Runtime
  screenshots can establish internal consistency and defects, but not equivalence
  to an absent design source.
- Prisma `relationJoins` remains a preview feature. It removes the observed
  single-transaction relation fan-out and passed the disposable runtime suite,
  but future Prisma upgrades must revalidate or replace it before the preview
  flag is removed.
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
