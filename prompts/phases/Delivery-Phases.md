# Delivery Phases

Use exactly one section according to the current state. These phases validate and deliver approved implementation; they do not create unapproved product scope.

## STATE-06 INTEGRATION

Role: senior integration engineer.

### Scope

Connect existing frontend, API, database, authentication, RBAC, and seed-data paths.

### Required validation

- Real API contracts, errors, auth refresh/logout, company scope, and RBAC.
- Dashboard, Kanban, teams, shifts, clients, users, activities, comments, notifications, reports, and audit flows as applicable.
- Filters, search, create/edit/delete/reopen/close, details, history, and TV/monitoring data.
- Approved migrations applied to the integration database.
- Deterministic seed data and repeatable startup.

### Allowed corrections

Compatible contract alignment and integration defects that do not create new business rules or modules.

### Prohibited

New modules, new business scope, unapproved schema/migrations, setup tooling, or convenience dependency installation.

### Deliverables

Contract results, end-to-end evidence, applied-migration evidence, corrected incompatibilities, and remaining integration risks.

## STATE-07 TESTING_HOMOLOGATION

Role: senior QA/homologation auditor.

### Required coverage

- Database integrity and migration status.
- Backend/API behaviour, errors, auth, RBAC, and tenant isolation.
- Frontend flows, filters, search, CRUD, timeline, dashboard, Kanban, responsive layout, PT-BR/EN-GB, themes, and TV mode.
- Unit, integration, E2E, accessibility, security, build, load/performance, and visual regression as applicable.
- Practical runtime outcome, not only nominal command success.

### Defect routing

- Schema/model defect -> recommend controlled return to `STATE-03`.
- Backend defect -> `STATE-04`.
- Frontend defect -> `STATE-05`.
- Integration-only defect -> `STATE-06`.
- A small explicitly authorised defect correction may be applied in the current work only when it adds no feature and receives proportional regression validation.

### Prohibited

New features, silent acceptance of critical defects, or state changes without a State Machine decision.

### Deliverables

Classified findings, corrected defects when authorised, reproducible evidence, accepted risks, and a release recommendation or block.

## STATE-08 PRODUCTION_RELEASE

Role: release manager.

### Preconditions

Homologation approved, no unresolved critical block, and release evidence current.

### Required release work

- Validate migrations and deploy only approved migrations.
- Run repository-defined quality, security, build, E2E, accessibility, and load gates as applicable.
- Validate production configuration requirements, runbooks, health/readiness, rollback notes, and observability.
- Record accepted risks and non-blocking work.

### Post-release maintenance

Explicitly requested maintenance may change code, schema, migrations, dependencies, tests, or operational configuration under `Governance.md`. It remains `STATE-08`, must not be disguised as a documentation patch, and requires proportional gates plus explicit remote-deployment gaps.

### Prohibited

Unrequested features, bypassing failed critical gates, rewriting audit history, destructive migration edits, or claiming a new state.

### Deliverables

Release result, migration/deployment evidence, runtime health, accepted risks, remaining work, snapshot/changelog updates, and state recommendation when applicable.
