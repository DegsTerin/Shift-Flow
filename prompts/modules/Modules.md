# Module Catalogue and Phase Matrix

This file defines module ownership, functional invariants, and the database/backend/frontend/integration/testing split. A module is not a state and cannot cross the current phase boundary.

## Phase matrix

For every module:

- `D`: data model, relationships, constraints, indexes, and audit fields in `STATE-03`.
- `B`: API, validation, business rules, authorisation, and persistence in `STATE-04`.
- `F`: UI, interaction, client state, accessibility, and responsive behaviour in `STATE-05`.
- `I`: real contracts, migrations, seed data, and end-to-end flow in `STATE-06`.
- `T`: functional, security, accessibility, performance, and regression evidence in `STATE-07`.

Never implement a later layer early merely because the same module spans several layers.

## MOD-01 AUTH

- D: users, password/session metadata, refresh tokens, revocation and login-attempt audit where approved.
- B: login, refresh rotation, logout, lockout/rate limit, secure cookie/token handling, safe errors, and production secret requirements.
- F: login/session states, redirect, expiry, refresh failure, logout, and accessible error feedback.
- I/T: end-to-end login/refresh/logout, company context, reload persistence, credential redaction, abuse protection, and security tests.

## MOD-02 USERS

- D: user identity, active state, company memberships, role assignments, and uniqueness rules.
- B: scoped CRUD, membership validation, role assignment boundaries, soft-delete policy, and audit.
- F: user administration, company/profile selection, validation, permission-aware controls, and clear status.
- I/T: cross-company isolation, inactive memberships, duplicate identity, and assignment tests.

## MOD-03 TEAMS

- D: company-scoped teams, leaders/members, active-name uniqueness, and soft delete.
- B: create, update, deactivate/delete, member movement, RBAC, and tenant scope.
- F: team list/detail/form, member movement, status, and accessible team colour treatment.
- I/T: full lifecycle, permission, uniqueness-after-delete, and multi-company isolation.

## MOD-04 SHIFTS

- D: shifts, schedules, coverage, on-call, leave, substitution, temporal constraints, and approved relationships.
- B: create, edit, close/reopen, coverage/substitution rules, tenant scope, and audit.
- F: shift management and clear schedule/coverage flows without inventing obsolete team dependencies.
- I/T: temporal consistency, permissions, lifecycle, and real operating scenarios.

## MOD-05 ACTIVITIES

- D: operational dossier fields, status, priority, client/system/service, responsibility, SLA/dates, soft delete, and append-only history.
- B: scoped CRUD, filter/search, status movement, close/reopen, comments, attachments, task board, history, and audit without duplicate events.
- F: list/Kanban/detail, real filters, timeline, tasks, comments, attachments, audit, close/reopen, and responsive interaction.
- I/T: persistence, concurrent updates, history immutability, SLA/overdue behaviour, permissions, and cross-company isolation.

## MOD-06 COMMENTS

- D: activity/user/company ownership, timestamps, edit/delete audit, and soft-delete policy.
- B: author/moderator permissions, tenant scope, validation, and safe mutation.
- F: readable chronological discussion, create/edit/delete states, and accessible feedback.
- I/T: ownership, moderator, forbidden cross-user/company mutations, and audit evidence.

## MOD-07 NOTIFICATIONS

- D: recipient, company, type, payload, read state, delivery metadata, and indexes.
- B: scoped generation/list/read behaviour and safe payloads.
- F: count/list/read states with loading, empty, and accessible announcements.
- I/T: recipient isolation, idempotency where needed, and real-event integration.

## MOD-08 REPORTS and MOD-14 SHIFT_REPORTS

- D: approved report inputs, audit metadata, and efficient filter/index support.
- B: scoped queries/exports, stable filters, safe filenames/content, and performance boundaries.
- F: report selection, filters, tables/charts, empty/error/export states, and readable print/export output.
- I/T: number reconciliation, tenant scope, large-result behaviour, and export validation.

## MOD-09 DASHBOARD_EXECUTIVO

- D: fields/indexes required for totals, status, SLA risk, criticality, team, client, shift, priority, and time aggregation.
- B: KPI/aggregation endpoints with real filters, company scope, and consistent definitions.
- F: KPI cards, charts, filters, operational/TV monitoring, loading/empty/error states, and no mock replacement.
- I/T: consistent totals across dashboard/Kanban/lists, auto-refresh, permissions, responsiveness, performance, and visual QA.

Personalised layouts are scoped by `userId` and `companyId`; profile/type defaults are templates, not individual preferences. Unknown widgets must fail safely.

## MOD-10 KANBAN_OPERACIONAL

- D: approved statuses, priority, SLA, ordering, and immutable movement history.
- B: list/move/update APIs, filters, search, concurrency handling, permissions, and audit.
- F: accessible columns/cards, drag-and-drop with keyboard-safe alternatives where practical, detail surface, filters, and TV monitoring.
- I/T: persisted movement, real-time refresh where implemented, history integrity, concurrent moves, SLA, permission, and responsive overflow.

Main Activity Kanban and an activity's internal task board are distinct domains and must not share status, persistence, or visual meaning accidentally.

## MOD-11 RBAC

- D: roles, permissions, company-scoped assignments, system-role flags, active state, and constraints.
- B: backend policy enforcement, assignment validation, hierarchy/scope rules, audit, and protected system roles.
- F: permission-aware navigation/actions and role management grouped by module; visual guards never replace backend enforcement.
- I/T: profile matrix, inactive roles, cross-company assignment attempts, privilege escalation, and protected-role tests.

## MOD-12 AUDIT

- D: actor, company, action, resource, timestamps, request context, and before/after where safe.
- B: append-only recording and scoped read access without secrets.
- F: readable filters/details for authorised users.
- I/T: coverage of sensitive mutations, immutability, redaction, and tenant isolation.

## MOD-13 ATTACHMENTS

- D: owner, activity, company, metadata, storage key, content type, size, checksum, and lifecycle.
- B: validated upload/download/delete, authorisation, safe names/types, and storage abstraction.
- F: progress, error, list, preview/download, and accessible controls.
- I/T: tenant isolation, malicious file handling, missing objects, size limits, and storage failure.

## Standard module closeout

Report module, phase slice, implemented scope, excluded slices, files, evidence, dependencies, risks, blockers, and next permitted slice. Do not recommend a state transition solely because one module slice is complete.
