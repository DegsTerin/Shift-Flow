# Prompt System Governance

This document is the single source for authority, global constraints, conflict handling, blocking, rollback, and repository-safe commits.

## Authority hierarchy

From highest to lowest:

1. Project state and transitions in `Official-State-Machine.md`.
2. Global constraints in this document.
3. State acceptance criteria in `Quality-Gates.md`.
4. Module-to-phase boundaries in `Modules.md`.
5. Current evidence in `Project-Snapshot.md`.
6. Human CI and Automatic Review gates.
7. Execution protocol.
8. The selected phase instruction.
9. The selected module or playbook.
10. Historical records and reports.

Higher authority controls lower authority. Historical evidence never overrides current instructions. The user request selects the operation and may authorise only the explicit exceptions defined by the State Machine and governance; it does not itself mutate state. User requests do not authorise destructive, unrelated, secret-bearing, or out-of-scope work unless they explicitly say so.

## Global constraints

- Execute only the requested task and its necessary implementation steps.
- Preserve existing behaviour unless a change is authorised and documented.
- Do not mix database, backend, frontend, integration, test, and release responsibilities outside the current phase or authorised post-release maintenance.
- Do not expose credentials, tokens, personal data, or secret-bearing URLs.
- Do not edit generated output or immutable applied migrations.
- Do not bypass a failed critical gate.
- Preserve unrelated worktree changes and use narrow staging.
- Prefer an existing canonical document over another control file.

## Tooling and post-release maintenance

Setup tooling is reserved for `STATE-01 SETUP_PROJECT`. Outside that state, do not run project initialisation or recreate the environment.

Dependency, `package.json`, runtime-configuration, schema, or migration changes outside setup are permitted only when all of the following are true:

1. The user explicitly requested a functional or operational change that requires them.
2. The change is classified as authorised post-release maintenance or belongs to an allowed phase.
3. The smallest viable change is used.
4. Security, migration, build, and regression impact are validated proportionally.
5. The snapshot and changelog record the impact without claiming a state transition.

This exception resolves the former conflict between the absolute tooling prohibition and authorised post-release maintenance. Installing or changing tooling merely for convenience remains prohibited.

## Conflict resolution

Classify conflicts as:

- `CONFLICT-STATE`: requested action is incompatible with current state.
- `CONFLICT-SCOPE`: action crosses an unauthorised layer or concern.
- `CONFLICT-TOOLING`: setup or dependency work lacks authority.
- `CONFLICT-EVIDENCE`: evidence is missing, stale, or contradictory.
- `CONFLICT-MODULE`: module work violates its phase boundary.
- `CONFLICT-GATE`: validation results disagree or a required gate failed.
- `CONFLICT-USER`: the request conflicts with a higher safety or repository constraint.

Resolve by identifying the involved sources, applying the authority hierarchy, choosing the narrowest safe interpretation, and recording the impact. Stop and request direction only when the remaining choice would materially change scope or risk.

## Blocking protocol

Use one of these block types:

- `BLOCK-SCOPE`
- `BLOCK-STATE`
- `BLOCK-TOOLING`
- `BLOCK-EVIDENCE`
- `BLOCK-MODULE`
- `BLOCK-GATE`
- `BLOCK-ROLLBACK`

When blocked:

1. Stop the affected operation, not unrelated safe analysis.
2. Record the state, scope, evidence, impact, and required correction.
3. Update the snapshot if the block affects current work.
4. Resolve conflicts or apply rollback rules.
5. Re-run affected gates before declaring the block resolved.

## Controlled rollback

Rollback may target state, an artefact, or a module. It requires explicit authorisation when it discards or reverses user work.

Every rollback plan must declare:

- Target and reason.
- Evidence and impact.
- Data, migration, compatibility, and security risk.
- Execution and validation steps.
- Whether the State Machine must decide a state transition.

Never use destructive Git commands, edit applied migrations, erase audit history, or hide a failed deployment to simulate success.

## Commit policy

After an authorised file-changing task passes validation:

1. Inspect the worktree.
2. Stage only intended files.
3. Run `git diff --cached --check`.
4. Commit with a clear, scoped message.
5. Report the commit identifier and remaining unrelated changes.

Do not commit when the user requested analysis only, when no file changed, or while required validation is failing.

## Governance change policy

Any rename, merge, removal, or authority change must update:

- `Start-Here.md` when the active manifest changes.
- The relevant canonical source.
- `Prompt-System-Change-Log.md`.
- `Project-Snapshot.md` when current operating evidence changes.
- `State-Transition-Log.md` only when a transition decision or state-sensitive event occurred.
- `docs/governance-index.md` when document ownership or layout changes.

Do not copy the same change narrative into every control file.
