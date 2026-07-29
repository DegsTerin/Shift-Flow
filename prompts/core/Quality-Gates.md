# Quality Gates

This document is the single source for acceptance criteria, evidence, Definition of Done, Human CI, and Automatic Review.

## Universal Definition of Done

A task or phase is complete only when:

- Authorised scope is implemented without unrelated changes.
- Applicable acceptance criteria are satisfied.
- Evidence is reproducible and current.
- Required lint, format, type, test, build, security, migration, runtime, accessibility, or visual checks pass.
- Critical defects and blockers are resolved.
- Non-blocking debt and risk are recorded.
- Current documentation is updated without duplicating history.
- Governed handoffs and delegated work satisfy `GATE-05 MULTI_AGENT_VALIDATION` when applicable.
- A scoped commit exists when files changed.

Missing evidence means `NOT COMPLETE`, not assumed approval.

## Evidence standard

Valid evidence identifies the command or inspection, relevant scope, result, and limitation. Prefer saved code, tests, command output, runtime health checks, database status, screenshots, or reviewed documents.

Invalid evidence includes:

- An unverified success statement.
- A startup banner without process and HTTP health.
- A stale report presented as current execution.
- A test result without the relevant configuration or target.
- A screenshot without page, viewport, and expected behaviour.
- A migration claim without schema and migration status.

## GATE-05 MULTI_AGENT_VALIDATION

For every governed user-visible handoff:

- Conversation routing and parallel work use the exact canonical enums from `Execution-Protocol.md`.
- Every required field contains a concrete value or `None - reason`; blank values and unresolved placeholders are invalid.
- Exact messages, plans, and targets preserve the declared authority, positive scope, negative scope, baseline, and routing action without expansion or contradiction.
- `SEQUENTIAL_ONLY` uses the canonical `Parallel plan: None - reason` and `Exact parallel messages: None - parallel work is not recommended` values and requires no parallel-lane evidence.
- A state-transition recommendation composes the common handoff with the phase extension without conflicting duplicate values.

When any internal or user-visible worker lane is started:

- The coordinating conversation, reproducible baseline, numbered lanes, dependencies, write sets, logical artefacts, and mutable resources are explicit.
- Worker start messages and the non-recursive, copy-ready worker return payload are complete and consistent with lane authority.
- One active writer owns each path, logical artefact, and mutable resource; parent/child paths and cross-file contracts are checked for overlap.
- Workers remain within lane authority and do not update state, snapshot, history, changelog, ADRs, gate reports, lifecycle, or Human Gates.
- The coordinating conversation integrates one candidate at a time, runs local checks after each integration, and runs cross-cutting checks on the combined result.
- Stop conditions and a sequential fallback are explicit, and no last-write-wins, automatic overwrite, or reversal of unrelated work occurred.
- Human CI is presented only from the coordinating conversation after integration and consolidated review.

A sequentially delegated worker may run only after the prior writer stops and ownership transfer is explicit. It must satisfy the worker contracts but does not require parallel branch/worktree evidence.

Parallel read-only lanes may pass without branches or worktrees only when shared inputs are frozen until the lanes return and no lane can mutate a file, logical artefact, cache, output, process, runtime, port, database, index, external resource, or other state.

Parallel writing additionally requires explicit owner authorisation, a tracked Git baseline, a dedicated branch and separate worktree per writer, non-overlapping write sets and logical artefacts, isolated mutable resources, and deterministic integration.

Missing mode, scope, ownership, isolation, or message-consistency evidence means `BLOCKED`, not assumed approval.

## Acceptance by state

### STATE-00 INIT

- Entrypoint, state model, current state, evidence source, and transition log exist.
- The active corpus and its ownership are known.

### STATE-01 SETUP_PROJECT

- Required workspace structure, dependencies, environment template, database service, and baseline scripts exist.
- Installation and startup are reproducible.
- No business feature was implemented as setup.

### STATE-02 ARCHITECTURE

- Runtime components, boundaries, modules, data flow, security, tenancy, observability, deployment direction, and major decisions are documented.
- ADRs exist for durable decisions where appropriate.
- No functional implementation was smuggled into the phase.

### STATE-03 DATABASE_MODELING

- Required entities, relations, tenant scope, constraints, indexes, audit/history, and migration strategy are defined.
- Prisma validation passes and migrations are forward-only.
- No unrelated backend or frontend implementation is included.

### STATE-04 BACKEND_IMPLEMENTATION

- APIs, validation, services, repositories, authentication, RBAC, tenant isolation, stable errors, and tests satisfy approved contracts.
- Lint, typecheck, unit/integration tests, build, and security checks pass as applicable.
- Schema changes are separately authorised.

### STATE-05 FRONTEND_IMPLEMENTATION

- Required screens, states, forms, navigation, i18n, themes, accessibility, and responsive behaviour satisfy approved contracts.
- No mock data replaces an available real endpoint.
- Lint, typecheck, tests, build, accessibility, and visual checks pass as applicable.

### STATE-06 INTEGRATION

- Frontend, API, database, authentication, tenant scope, RBAC, and seed data work end to end.
- Approved migrations are applied in the integration environment.
- Contract and runtime failures are resolved without adding unapproved features.

### STATE-07 TESTING_HOMOLOGATION

- Functional, end-to-end, accessibility, responsive, security, performance, migration, and regression coverage is executed proportionally.
- Defects are classified and blocking defects are resolved.
- Accepted risks and intentional skips are explicit.

### STATE-08 PRODUCTION_RELEASE

- Homologation is approved.
- Migration status, dependency security, quality, build, E2E, load, operational documentation, rollback notes, and runtime health are verified as applicable.
- Remaining external deployment gaps are explicit.

## Human CI

Human CI validates judgement that automation cannot establish alone:

- Scope and state compliance.
- Architecture and maintainability.
- Security and tenant isolation.
- UX, accessibility, visual consistency, and operational usability.
- Evidence quality and residual risk.
- Whether a reported success matches the user's practical outcome.

Human CI may approve, approve with observation, reject, or block. It cannot change state.

## Automatic Review

Automatic Review independently checks:

- Architecture and coupling.
- Data integrity and migration safety.
- Backend contracts, validation, auth, RBAC, and tenant scope.
- Frontend behaviour, accessibility, responsive layout, and real data usage.
- Integration correctness.
- Security, supply chain, performance, observability, tests, and release gates.
- Documentation, references, version, and state consistency.
- Conversation routing, lane authority, writer exclusivity, mutable-resource isolation, and integration evidence.

Required result format:

```text
STATUS: APPROVED | APPROVED_WITH_OBSERVATION | REJECTED | BLOCKED
CRITICAL FINDINGS:
NON-CRITICAL FINDINGS:
TECHNICAL RISKS:
TECHNICAL DEBT:
EVIDENCE:
DECISION:
STATE TRANSITION: RECOMMENDATION ONLY
```

## Gate selection

- Documentation-only: link/reference validation, formatting, consistency, coordination-contract checks when applicable, and diff checks.
- Local code change: format, lint, typecheck, targeted tests, and relevant build.
- Database: Prisma format/validate, migration review/status, and affected tests.
- Security: targeted security tests, secret scan, dependency audit, and auth/tenant checks.
- UI: targeted tests, accessibility, responsive/visual inspection, and build.
- Release: full project-defined release gate plus runtime health.

Run broader gates when the change crosses layers or when narrower evidence cannot establish safety.
