# ShiftFlow Production Runbook

## Release Target

No remote production environment is currently configured in this workspace. Until an external target is defined, production release validation is local and uses:

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
- `JWT_ACCESS_SECRET` or `JWT_SECRET`
- `JWT_REFRESH_EXPIRES_DAYS`
- `CORS_ORIGIN`
- `NEXT_PUBLIC_API_BASE_URL`

Production values must not be committed to Git. Store database credentials and JWT/CORS values in the target platform secret manager.

## Release Gates

Run these commands before promoting a build:

```powershell
docker compose ps
npm run prisma:validate
npx prisma migrate status
npx prisma migrate deploy
npm run security:audit
npm run quality
npm run test:unit
npm run build
npm run test:e2e
npm run test:load:stress
```

## Deployment Order

1. Confirm `DATABASE_URL` points to the target database.
2. Run `npx prisma migrate deploy`.
3. Run `npm run build`.
4. Start the API with production environment variables.
5. Start or serve the Next.js app with `NEXT_PUBLIC_API_BASE_URL` pointing to the API.
6. Validate `/health`, `/ready`, login, dashboard, Kanban, dark mode, EN-GB labels, accessibility, and load gates.
7. Confirm JSON logs include `requestId` and API responses include `x-rate-limit-*` headers.

## Current Open Operational Items

- Configure the real Git remote.
- Define the real production host or CI/CD deployment target.
- Store secrets in the target platform secret manager.
- Decide whether Playwright release gates run against local preview, staging, or production.
- Replace the in-memory API rate limiter with a shared store before horizontal API scaling.
