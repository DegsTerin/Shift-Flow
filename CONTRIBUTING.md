# Contributing

## Development Flow

1. Run `npm run dev:doctor` and use `npm run dev:setup` when dependencies are
   not prepared.
2. Create a scoped branch from `main`.
3. Keep changes limited to one business or technical concern and record a
   scoped implementation plan for broad or multi-step work.
4. Use `npm run dev:quick` during implementation and run `npm run dev:full`
   before opening a pull request.
5. Include migration, security, and operational notes when relevant.

## Local Checks

```powershell
npm run dev:quick
npm run dev:full
```

`dev:quick` is `NON_GATE` feedback. Only `dev:full` is the canonical core
repository gate. Runtime checks remain separate because they mutate a database
or use a browser.

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
