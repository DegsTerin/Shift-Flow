## Summary

-

## Validation

- [ ] `npm run dev:workflow:test`
- [ ] `npm run dev:quick` (`NON_GATE` feedback)
- [ ] `npm run dev:full` (canonical core gate)
- [ ] E2E or load checks when the change touches user workflows
- [ ] Any `NOT_RUN`, blocked or environment-specific validation is disclosed
      and is not presented as a pass

## Risk Review

- [ ] Business behavior is preserved or the behavior change is documented.
- [ ] Tenant, RBAC, authentication, and authorization impact was reviewed.
- [ ] Database migrations include operational notes when applicable.
- [ ] Logs, errors, and metrics avoid secrets and sensitive tokens.
- [ ] Documentation was updated when setup, deployment, or API behavior changed.
- [ ] New project-owned artifacts, owner-facing communication, and limited legacy amendments comply with the [canonical language policy](../prompts/core/Governance.md#language-policy); no interface locale was inferred or changed without separate product authority.
- [ ] `PLANS.md` is current for broad or multi-step work and has not been used
      to create authority or a lifecycle transition.
