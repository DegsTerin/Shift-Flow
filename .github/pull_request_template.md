## Summary

-

## Validation

- [ ] `npm run quality`
- [ ] `npm run security:secrets`
- [ ] `npm run security:production-config`
- [ ] `npm run test:unit`
- [ ] `npm run build`
- [ ] E2E or load checks when the change touches user workflows

## Risk Review

- [ ] Business behavior is preserved or the behavior change is documented.
- [ ] Tenant, RBAC, authentication, and authorization impact was reviewed.
- [ ] Database migrations include operational notes when applicable.
- [ ] Logs, errors, and metrics avoid secrets and sensitive tokens.
- [ ] Documentation was updated when setup, deployment, or API behavior changed.
- [ ] New project-owned artifacts, owner-facing communication, and limited legacy amendments comply with the [canonical language policy](../prompts/core/Governance.md#language-policy); no interface locale was inferred or changed without separate product authority.
