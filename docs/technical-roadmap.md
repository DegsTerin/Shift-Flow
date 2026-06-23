# Technical Roadmap

## Near Term

- Add service-level tests for every API module that mutates tenant-scoped data.
- Introduce a typed Prisma access layer that reduces `unknown` usage while preserving generated-client loading.
- Add OpenAPI documentation for public API contracts.
- Add request body size and rate-limit policies per route group.
- Add production deployment manifests for the selected hosting target.

## Mid Term

- Add centralized metrics export for latency, error rate, and domain events.
- Add audit dashboards for RBAC and cross-company access attempts.
- Add contract tests between `apps/web` and `apps/api`.
- Add migration rollback playbooks for high-risk schema changes.
- Add a security review checklist for authentication, refresh tokens, cookies, CORS, and tenant headers.

## Long Term

- Split deployment units for web, API, and background jobs if operational load requires it.
- Add event-driven processing for notifications and long-running operational workflows.
- Add feature flags for controlled rollout of high-impact behavior.
- Add SLOs and alerting policies for core operational flows.
- Add a formal architecture decision record process under `docs/adr/`.
