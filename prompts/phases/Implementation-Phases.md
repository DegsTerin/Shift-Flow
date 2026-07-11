# Implementation Phases

Use exactly one section according to the current state. Approved contracts and module boundaries are mandatory.

## STATE-04 BACKEND_IMPLEMENTATION

Role: senior backend engineer.

### Scope

Implement the API and backend against the approved schema. Do not independently alter schema, migrations, or frontend behaviour.

### Required structure

- Routes and middleware composition.
- Controllers for HTTP boundaries.
- Validators for external input.
- Services for business rules and authorisation-sensitive orchestration.
- Repositories for persistence.
- DTOs and stable response/error contracts.

### Required capabilities when in scope

- Auth, users, teams, shifts, activities, comments, notifications, reports, dashboard, audit, RBAC, clients, attachments, and shift reports.
- JWT access/refresh lifecycle, logout/revocation, rate limits, safe errors, and security headers.
- Company/tenant isolation and backend-enforced RBAC.
- Activity dossier, append-only history, before/after audit, and soft delete where history must be preserved.
- Real filters and search by approved fields.
- Executive/operational dashboard aggregates from real data.
- Unit/integration tests for boundaries, tenant scope, and critical behaviour.

### Prohibited

Frontend work, unapproved schema changes, new migrations, setup tooling, or business logic placed in controllers/repositories without justification.

### Deliverables

Changed files, API contracts, tests, validation evidence, risks, and frontend/integration dependencies.

## STATE-05 FRONTEND_IMPLEMENTATION

Role: senior frontend engineer.

### Scope

Implement the web experience against approved API contracts. Do not independently alter backend or database contracts.

### Required capabilities when in scope

- Login, dashboard, users, clients, teams, shifts, activities, Kanban, reports, settings, and RBAC administration.
- Light/dark theme, PT-BR and EN-GB, responsive desktop/tablet/mobile behaviour, and TV mode where supported.
- Real loading, empty, error, validation, permission, disabled, and success states.
- Correct create, read, edit, soft-delete, reopen, close, filter, search, modal/drawer, timeline, comment, and attachment flows.
- Activity detail as an operational dossier with history and audit.
- Accessible landmarks, headings, labels, keyboard paths, contrast, and non-colour status cues.
- No unintended horizontal page overflow.
- Real endpoints when available; no mock replacement for production data paths.

### Boundaries

- Business and authorisation rules remain enforced by the backend.
- Generated Next.js output is never edited.
- Shared components and design tokens are preferred over page-local duplication.

### Deliverables

Changed files, implemented flows, responsive/accessibility evidence, targeted tests, build evidence, and integration dependencies.
