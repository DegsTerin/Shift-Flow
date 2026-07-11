# Maintenance and Product Playbooks

Select the narrowest matching mode. All file-changing maintenance in `STATE-08` is classified as post-release maintenance and follows `../core/Governance.md`.

## Mode A - Global revision

Audit and correct explicitly requested functional, usability, responsive, integration, state-management, component, filter, search, CRUD, theme, language, or TV-mode issues. Preserve approved behaviour and avoid turning a revision into an unbounded redesign.

## Mode B - Systematisation

Improve organisation, modularity, auditability, scalability, and maintainability across code, directories, dependencies, configuration, processes, documentation, delivery, security, and observability.

Apply SOLID, DRY, KISS, and YAGNI as decision aids, not mechanical rewrite mandates. Prefer small behaviour-preserving extractions. Remove obsolete code or dependencies only after replacement and validation are complete.

## Mode C - Operational activity restructuring

Treat each activity as an auditable operational dossier that may remain open for long periods and accept chronological updates from several users.

Required concepts when in scope:

- ID, title, client, system/service, company/team/shift/responsible, status, priority, descriptions, findings, work performed, pending work, next action, result, and audit metadata.
- Approved statuses including pending, in progress, waiting for client/third party, monitoring, finalised, and cancelled where supported by the current domain.
- Immutable chronological history for comments, updates, status/responsible changes, attachments, deletion, reopen, and close.
- Detail surface with summary, complete data, timeline, attachments, audit, and permitted actions.

## Mode D - Dashboard personalisation

- Provide a safe default layout.
- Scope saved preferences by `userId` and `companyId`.
- Treat role/dashboard-type layouts as templates, not personal preferences.
- Persist visible widgets, order, size, compatible filters, and layout version.
- Reject or safely ignore unknown widgets and invalid legacy layouts.
- Separate view and edit modes; support restore-default.
- Preserve mobile, desktop, TV, keyboard, loading, empty, and error behaviour.

Candidate widgets include status, overdue, critical, SLA/average time, recent occurrences, team/client/shift distribution, Kanban summary, and operational alerts when backed by real data.

## Mode E - Operational adjustments

### Internal activity task board

Keep it independent from the main Activity Kanban. Persist columns, tasks, order, assignee, priority, labels, due date, archive/completion, attachments, and history under activity/company scope.

### Filters and search

Keep backend, frontend, URL/local state, and active-company scope coherent. Avoid returning data from another tenant.

### Role management

Use a readable profile list/detail pattern, permissions grouped by module, protected system roles, clear inherited/blocked states, and backend-enforced rules.

### Team colours and settings

Do not rely on colour alone for status/priority. Group settings by company, users, teams, clients, shifts, profiles/permissions, interface preferences, and security policy without duplicating operational screens.

## Boundaries

- Do not remove RBAC or audit constraints to simplify UI.
- Do not create persistence-free production features.
- Do not use demo data when a real endpoint exists.
- Do not combine unrelated maintenance into one change.
- Dependencies, schema, migrations, or runtime changes require explicit necessity, impact analysis, and proportional gates.

## Deliverables

Report mode selected, findings, corrections, files, behaviour preserved/changed, migration/runtime impact, evidence, risks, remaining work, and commit.
