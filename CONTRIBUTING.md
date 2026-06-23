# Contributing

## Development Flow

1. Create a scoped branch from `main`.
2. Keep changes limited to one business or technical concern.
3. Run local quality gates before opening a pull request.
4. Include migration, security, and operational notes when relevant.

## Local Checks

```bash
npm run quality
npm run test:unit
npm run build
```

Use Playwright checks for user-facing flows:

```bash
npm run test:e2e
npm run test:a11y
npm run test:load
```

## Review Expectations

- Controllers stay thin and delegate business behavior to services.
- Services enforce business rules and tenant boundaries.
- Repositories encapsulate persistence access only.
- New environment variables must be added to `.env.example` and documentation.
- New dependencies must be necessary, maintained, and covered by `npm audit`.

## Database Changes

- Migrations are forward-only.
- Do not edit applied migration files.
- Include a rollback note in the pull request for high-risk changes.
- Seed scripts must remain deterministic and safe to rerun.
