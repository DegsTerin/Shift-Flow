# Governance Index

This index is the canonical map for ShiftFlow governance, delivery, and control documents.
Prefer updating the documents listed here instead of creating new root-level control files.

## Canonical Documents

- `README.md`: onboarding, local setup, platform control, and quality gates.
- `CONTRIBUTING.md`: contribution flow and review expectations.
- `SECURITY.md`: vulnerability handling and security policy.
- `docs/architecture.md`: runtime architecture, module boundaries, observability, and security controls.
- `docs/development-standards.md`: engineering standards, naming, checks, review, versioning, and documentation rules.
- `docs/production-runbook.md`: production operations and incident handling.
- `docs/technical-roadmap.md`: planned technical evolution.
- `docs/systematization-report.md`: systematization baseline, decisions, and remaining risks.
- `docs/adr/`: architecture decision records.

## Root Control Files

The root `*.txt` files are treated as controlled process artifacts. They should remain stable unless a phase, state machine, audit process, or prompt protocol explicitly changes.

When a root control file is still required, keep it in place and reference it from this index or from the relevant canonical document. When a root control file becomes obsolete, archive it through a dedicated documentation-only change that records the replacement document and impact.

## Change Rules

- Do not create another control document when an existing canonical document can be updated.
- Do not move or delete root control files without an impact review for references and automation.
- Keep phase/state/protocol changes separate from functional code changes.
- Record durable architectural decisions as ADRs under `docs/adr/`.
- Update this index whenever a governance source of truth changes.

## Ownership Domains

- API and backend behavior: `apps/api`, `prisma`, API-related tests, and API operations docs.
- Web experience: `apps/web`, frontend tests, and UX-facing documentation.
- Delivery and operations: `.github`, `scripts`, `docker-compose.yml`, runbooks, and release gates.
- Governance: `docs`, root control files, ADRs, security, and contribution policy.

GitHub handle-based enforcement belongs in `.github/CODEOWNERS`. Keep the logical domains above aligned with CODEOWNERS once real users or teams are assigned.
