# ShiftFlow Production Runbook

## Release Target

No remote production environment is currently configured in this workspace.
The repository can build and validate a candidate, but it cannot by itself
authorise or perform a production deployment. The local `platform:*` scripts are
development tooling and must not be used as a production process manager.

Candidate validation currently uses:

- PostgreSQL and Redis from `docker-compose.yml`
- `DATABASE_URL` from the deployment environment
- Node.js runtime compatible with the lockfile
- .NET 10 runtime compatible with `global.json` and the NuGet lock files
- Build output from `npm run build` and the ASP.NET Core publish pipeline
- non-root Linux containers with an Nginx same-origin edge in the disposable
  `migration` profile

The Compose profile is evidence for the transition topology only. It is not a
production deployment definition: it exposes loopback HTTP, uses local volumes
and does not select Azure, AWS, a managed PostgreSQL/Redis service, a TLS
termination design or a platform key repository.

## Public Render Demonstration

The authorised public demonstration uses a free Render native Node.js Web
service and a new free Render PostgreSQL database in Virginia. It is a
demonstration target, not the production environment described by this
runbook. The Web and incumbent Express API share the provider-assigned HTTPS
hostname through `infra/render/server.mjs`; the ASP.NET Core, Redis and Nginx
migration profile is not promoted.

The demonstration build and start commands are:

```text
npm ci --ignore-scripts --no-audit --no-fund && npm run build:render
npm run start:render
```

The service binds `0.0.0.0:$PORT`. `/health` is the liveness path and `/ready`
is the PostgreSQL-backed readiness path. Render owns public TLS termination;
`CORS_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL` must both contain the exact
provider-assigned HTTPS origin. Proxy trust remains disabled because the
demonstration does not depend on provider-forwarded client identity; this means
client-IP attribution and IP-keyed throttling are intentionally conservative.

Approved Prisma migrations are applied as an explicit release action before
service promotion. A controlled, non-destructive integration/homologation seed
may populate only the new demonstration database, and its authentication secret
must be delivered privately to the owner. Neither migration nor seed execution
belongs in the application start command. Future schema changes require a new
controlled migration action.

Free-tier sleep, retention and database-lifetime limits are provider policy and
must be rechecked before each release. Their expiry is loss of a demonstration
environment, not an authorised production recovery event.

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
- `NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK` (local migration profile only; forbidden
  for a production origin)
- `REDIS_CONNECTION`
- `REDIS_INSTANCE_NAME`
- `DATA_PROTECTION_KEYS_PATH`
- `TRUSTED_PROXY_IPS`
- `ENABLE_INTERNAL_RUNTIME_PROBES` must be absent or `false`; it exists only for
  the disposable, edge-inaccessible data-protection container-recreation probe.

Production values must not be committed to Git. Store database credentials and JWT/CORS values in the target platform secret manager.

The compatibility host currently requires the same JWT issuer/key as Express.
This is a migration bridge, not an OAuth 2.0/OpenID Connect deployment. Do not
configure an IdP until its authority, account-linking model and BFF-versus-SPA
topology have been approved. A production ASP.NET Core deployment must also use
TLS-authenticated PostgreSQL/Redis endpoints, a protected shared
data-protection key repository and least-privilege application database roles;
the local profile does not prove those controls.

`CORS_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL` must be canonical HTTPS origins
with the same hostname, although their ports may differ. They must not contain
credentials, paths, query strings, fragments or a trailing slash.
Authentication uses a host-scoped
HttpOnly refresh cookie plus a readable double-submit CSRF cookie. A split-host
topology such as `app.example.com` and `api.example.com` cannot satisfy that
contract and is rejected by the frontend before a request is sent. Use a reverse
proxy or equivalent routing so Web and API share the public hostname; do not
weaken the cookie or origin checks to accommodate a split host.

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

For a transition candidate, also run `npm run test:runtime:strangler`. Its
authority-bound wrapper owns the disposable migration profile, credentials,
security mutations and cleanup while proving the Nginx, real PostgreSQL, Redis
and JWT boundaries. The public `/ready` path remains on Express during
coexistence; accept the migration topology only when the aggregate container
healthcheck and the internally invoked migrated-route smoke both pass.

## Deployment Order

1. Record the exact approved Git commit, build identity, migration set and
   rollback owner.
2. Confirm a current, restorable database backup and exercise restore in a safe
   environment before a migration that can affect production data.
3. Build once with the approved production configuration and retain the
   immutable artefact identity.
4. Review migration status, then deploy only the approved migrations through
   the target platform pipeline.
5. Start the approved immutable deployment units with target-specific
   supervisors. The incumbent topology uses the compiled Express API and
   Next.js application. A separately approved transition topology also starts
   ASP.NET Core, Redis and Nginx with only the reviewed literal route allowlist.
   Application startup commands do not migrate or seed.
6. Confirm that the Web and API public URLs are canonical HTTPS origins sharing
   one hostname, then validate
   `/health`, `/ready`, login, refresh, logout, dashboard, Kanban, dark mode,
   EN-GB labels, accessibility and the approved performance gate.
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
- Select Azure or AWS and define the real production host, CI/CD deployment
  target and provider-specific infrastructure authority.
- Select the OAuth 2.0/OpenID Connect provider and approve the account-linking
  and browser-session design; the current HS256 bridge is temporary.
- Store secrets in the target platform secret manager.
- Decide whether Playwright release gates run against local preview, staging, or production.
- Replace or retire the legacy Express process-local rate limiter before
  horizontal scaling. The migrated Audit slice already uses Redis and fails
  closed when that dependency is unavailable.
- Require TLS/authentication for managed PostgreSQL and Redis, configure a
  protected shared ASP.NET Core data-protection key repository, enforce
  least-privilege runtime/migration database roles and define proxy/TLS trust.
- Measure whether a GraphQL read surface is justified; REST remains canonical
  until that evidence exists.
- Define immutable artefact publication, backup/restore tooling, rollback automation and incident ownership for the selected target.
