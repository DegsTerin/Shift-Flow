# Development Standards

## Engineering Principles

- Preserve existing behavior unless a change is explicitly documented.
- Prefer module-local changes over broad rewrites.
- Keep API boundaries clear: route, controller, validator, service, repository.
- Keep tenant and company scope checks explicit.
- Favor simple TypeScript types and strict compiler feedback over runtime guessing.
- Delete unused code and dependencies when replacement is complete.

## Naming

- API files use `<module>.<role>.ts`, for example `users.service.ts`.
- Tests use `*.test.ts` for unit/integration tests and `*.spec.ts` for Playwright tests.
- Environment variables use uppercase snake case.
- Routes use plural nouns for resource collections.

## Required Checks

Before merging:

```bash
npm run quality
npm run test:unit
npm run build
```

For release candidates:

```bash
npm run test:e2e
npm run test:a11y
npm run test:load:stress
```

## Code Review

Reviewers should check:

- Business behavior is preserved or the change is justified.
- Tenant, RBAC, and authentication paths are covered.
- Validation exists at external boundaries.
- Errors return stable codes and safe messages.
- Logs include enough context without secrets or personal tokens.
- New dependencies are necessary and documented.

## Branching and Versioning

- `main` is protected by release gates.
- Feature branches should be short-lived and scoped to one business or technical concern.
- Database migrations must be forward-only and reviewed with rollback notes.
- Version bumps should include a concise change summary and operational impact.

## Documentation

Update docs when changing:

- Setup or environment variables.
- Architecture boundaries.
- Deployment or release process.
- Public API behavior.
- Security, RBAC, or tenant behavior.
- Operational diagnostics.
