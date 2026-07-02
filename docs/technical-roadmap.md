# Technical Roadmap

## Near Term

- Add service-level tests for every API module that mutates tenant-scoped data.
- Add Playwright coverage for internal activity task-board drag and drop, task editing, and role-management flows.
- Introduce a typed Prisma access layer that reduces `unknown` usage while preserving generated-client loading.
- Add OpenAPI documentation for public API contracts.
- Split `record-modal.tsx` into entity-specific form/detail components.
- Split `page.tsx` into session, data-loading, layout, and view-routing hooks/components.
- Add request body size and route-specific rate-limit policies per route group.
- Add production deployment manifests for the selected hosting target.

## Mid Term

- Add centralized metrics export for latency, error rate, and domain events.
- Add audit dashboards for RBAC and cross-company access attempts.
- Add contract tests between `apps/web` and `apps/api`.
- Add migration rollback playbooks for high-risk schema changes.
- Add a security review checklist for authentication, refresh tokens, cookies, CORS, and tenant headers.
- Move rate limiting to a shared external store for horizontally scaled API deployments.

## Long Term

- Split deployment units for web, API, and background jobs if operational load requires it.
- Add event-driven processing for notifications and long-running operational workflows.
- Add feature flags for controlled rollout of high-impact behavior.
- Add SLOs and alerting policies for core operational flows.
- Continue architecture decision records under `docs/adr/`.
