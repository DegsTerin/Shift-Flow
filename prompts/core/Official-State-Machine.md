# Official State Machine

This is the only source for canonical project states, state transitions, state identifiers, and layer permissions.

## Canonical flow

```text
STATE-00 INIT
  -> STATE-01 SETUP_PROJECT
  -> STATE-02 ARCHITECTURE
  -> STATE-03 DATABASE_MODELING
  -> STATE-04 BACKEND_IMPLEMENTATION
  -> STATE-05 FRONTEND_IMPLEMENTATION
  -> STATE-06 INTEGRATION
  -> STATE-07 TESTING_HOMOLOGATION
  -> STATE-08 PRODUCTION_RELEASE
```

Gate results such as `APPROVED`, `READY`, `REPROVED`, and `BLOCKED` are not states.

## Transition rules

- States advance in order unless `SKIP_CONTROLLED` is explicitly approved.
- A gate may approve, reject, or block; it cannot change state.
- A snapshot, prompt, report, agent, or log cannot change state.
- Every transition requires acceptance, evidence, completion gates, and a recorded State Machine decision.
- Rollback requires explicit authority and the rollback protocol.
- Current state is read from `../state/Current-State.md`.

## SKIP_CONTROLLED

`SKIP_CONTROLLED` is an exception, not a state. It requires:

1. Explicit user request.
2. Snapshot evidence that the skipped state is already satisfied or not applicable.
3. No critical scope or security violation.
4. Automatic Review approval.
5. Human CI approval.
6. A recorded State Machine decision.

## Layer permissions

### STATE-00 INIT

Inventory the project and establish controlled entry, state, evidence, and transition records. Do not implement product functionality.

### STATE-01 SETUP_PROJECT

May initialise the workspace, install baseline dependencies, configure environment templates, Docker, runtime configuration, package scripts, and Prisma setup. Must not implement business modules.

### STATE-02 ARCHITECTURE

May define boundaries, data flow, security strategy, module ownership, deployment direction, and ADRs. Must not generate functional implementation.

### STATE-03 DATABASE_MODELING

May change Prisma schema and create forward-only domain migrations. May validate and generate migration artefacts. Must not implement backend or frontend behaviour.

### STATE-04 BACKEND_IMPLEMENTATION

May implement API routes, controllers, validators, services, repositories, DTOs, authentication, RBAC, tenant scope, and tests. Must not independently alter the approved schema or create frontend features.

### STATE-05 FRONTEND_IMPLEMENTATION

May implement pages, components, state, i18n, themes, accessibility, and frontend tests against approved contracts. Must not independently alter backend or database contracts.

### STATE-06 INTEGRATION

May connect existing layers, align compatible contracts, apply approved migrations in integration, seed controlled data, and validate end-to-end flows. Must not introduce an unapproved business module.

### STATE-07 TESTING_HOMOLOGATION

May test, audit, homologate, and correct explicitly classified defects. Must not introduce new features disguised as fixes.

### STATE-08 PRODUCTION_RELEASE

May prepare release, deploy approved migrations, run release gates, document operations, and perform explicitly requested post-release maintenance. It must not claim a new state.

## Post-release maintenance

Post-release maintenance is not a new state. It may change code, schema, migrations, tests, dependencies, or operational configuration only under the exception in `Governance.md`. It requires proportional gates and must record local migrations or remote deployment gaps.

## Canonical identifiers

### Gates

- `GATE-01 GUARD_RAILS`
- `GATE-02 SNAPSHOT_MEMORY`
- `GATE-03 HUMAN_CI`
- `GATE-04 AUTO_REVIEW`
- `GATE-05 MULTI_AGENT_VALIDATION`
- `GATE-06 ACCEPTANCE_CRITERIA`
- `GATE-07 DEFINITION_OF_DONE`
- `GATE-08 EVIDENCE_STANDARD`
- `GATE-09 PROMPT_SYSTEM_AUDIT`

### Modules

- `MOD-01 AUTH`
- `MOD-02 USERS`
- `MOD-03 TEAMS`
- `MOD-04 SHIFTS`
- `MOD-05 ACTIVITIES`
- `MOD-06 COMMENTS`
- `MOD-07 NOTIFICATIONS`
- `MOD-08 REPORTS`
- `MOD-09 DASHBOARD_EXECUTIVO`
- `MOD-10 KANBAN_OPERACIONAL`
- `MOD-11 RBAC`
- `MOD-12 AUDIT`
- `MOD-13 ATTACHMENTS`
- `MOD-14 SHIFT_REPORTS`

## Module-to-phase rule

Module work is split by concern:

- `D`: schema, relationships, constraints, and indexes in `STATE-03`.
- `B`: APIs, business rules, authorisation, and persistence in `STATE-04`.
- `F`: UI, interaction, accessibility, and client state in `STATE-05`.
- `I`: real contracts, data, and end-to-end integration in `STATE-06`.
- `T`: security, functional, performance, accessibility, and regression validation in `STATE-07`.

Detailed module requirements live in `../modules/Modules.md`; they do not override these phase boundaries.

## Standard closeout

Every phase closeout reports:

- Status and completed scope.
- Incomplete scope and blockers.
- Evidence and gates.
- Dependencies, risks, and debt.
- Recommended next action.
- State-transition recommendation, clearly labelled as a recommendation until decided.
