# ShiftFlow Production Runbook

## Release Target

No remote production environment is currently configured in this workspace.
The repository can build and validate a candidate, but it cannot by itself
authorise or perform a production deployment. The local `platform:*` scripts are
development tooling and must not be used as a production process manager.

Candidate validation currently uses:

- PostgreSQL from `docker-compose.yml`
- `DATABASE_URL` from the deployment environment
- Node.js runtime compatible with the lockfile
- Build output from `npm run build`

## Required Environment Variables

- `DATABASE_URL`
- `API_PORT`
- `NODE_ENV`
- `LOG_LEVEL`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `AUTH_LOCKOUT_WINDOW_MS`
- `AUTH_LOCKOUT_MAX_ATTEMPTS`
- `JWT_ACCESS_SECRET` or `JWT_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_REFRESH_EXPIRES_DAYS`
- `CORS_ORIGIN`
- `REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS`
- `TRUST_PROXY`
- `API_INSTANCE_COUNT`
- `RATE_LIMIT_STORE`
- `NEXT_PUBLIC_API_BASE_URL`

Production values must not be committed to Git. Store database credentials and JWT/CORS values in the target platform secret manager.

## Release Gates

Run the canonical runtime-credential-free core gate before preparing a runtime
candidate:

```powershell
npm run dev:full
```

Then run migration status, approved migrations, E2E, accessibility and the
appropriately named performance check only against a disposable or designated
pre-production database. These runtime checks are separate evidence and must
not be pointed at an existing local or production database by inference.

## Deployment Order

1. Record the exact approved Git commit, build identity, migration set and
   rollback owner.
2. Confirm a current, restorable database backup and exercise restore in a safe
   environment before a migration that can affect production data.
3. Build once with the approved production configuration and retain the
   immutable artefact identity.
4. Review migration status, then deploy only the approved migrations through
   the target platform pipeline.
5. Start the compiled API with `npm start` and the compiled Web application with
   `npm run start:web`, or use equivalent target-specific supervisors. These
   commands do not migrate or seed.
6. Validate `/health`, `/ready`, login, dashboard, Kanban, dark mode, EN-GB
   labels, accessibility and the approved performance gate.
7. Confirm JSON logs include `requestId`, API responses include
   `x-rate-limit-*` headers and no credential or personal data is present in
   operational output.
8. Record the deployment result against the approved commit and artefact.

## Rollback and Recovery

- Application rollback means restoring the last approved immutable API and Web
  artefacts. Do not rebuild an old source revision during an incident.
- Database rollback is never inferred. Prefer a forward corrective migration;
  use restore only under the target platform's approved recovery procedure and
  with a verified backup identity.
- Stop promotion when `/ready`, authentication, tenant isolation, migration
  status or smoke validation diverges. Preserve logs and the first factual
  failure before any successor attempt.
- The realistic seed and `prisma migrate reset` are forbidden against production
  or shared data. Their local guard is defence in depth, not deployment authority.

## Incident Handling

1. Stabilise the service and prevent further unsafe writes.
2. Record time, release identity, affected tenant scope, request IDs and observed
   symptoms without copying secrets into the incident record.
3. Select rollback, forward fix or database recovery through the responsible
   owner and target-platform procedure.
4. Validate readiness and the affected user journey after recovery.
5. Preserve a factual timeline and create a follow-up root-cause action; do not
   rewrite the original failure as a pass.

## Current Open Operational Items

- Configure the real Git remote.
- Define the real production host or CI/CD deployment target.
- Store secrets in the target platform secret manager.
- Decide whether Playwright release gates run against local preview, staging, or production.
- Replace the in-memory API rate limiter with a shared store before horizontal API scaling.
- Define immutable artefact publication, backup/restore tooling, rollback automation and incident ownership for the selected target.
