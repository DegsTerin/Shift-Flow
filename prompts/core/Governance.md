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
- Stop concurrent work when ownership, baseline, or mutable-resource isolation is uncertain; never use last-write-wins.

## Tooling and post-release maintenance

Setup tooling is reserved for `STATE-01 SETUP_PROJECT`. Outside that state, do not run project initialisation or recreate the environment.

Dependency, `package.json`, runtime-configuration, schema, or migration changes outside setup are permitted only when all of the following are true:

1. The user explicitly requested a functional or operational change that requires them.
2. The change is classified as authorised post-release maintenance or belongs to an allowed phase.
3. The smallest viable change is used.
4. Security, migration, build, and regression impact are validated proportionally.
5. The snapshot and changelog record the impact without claiming a state transition.

This exception resolves the former conflict between the absolute tooling prohibition and authorised post-release maintenance. Installing or changing tooling merely for convenience remains prohibited.

## Conversation coordination boundary

`Execution-Protocol.md` is the single thematic authority for conversation routing, handoff, delegated lanes, and safe parallel work. Repository entrypoints may route to that protocol but must not restate it as a second authority.

The coordinating conversation owns integration custody for state, snapshot, history, changelog, ADR records, gate reports, and consolidated Human Gate summaries. This custody cannot override the State Machine, accept an ADR, approve Human CI, expand scope, or infer external authority.

## Language policy

This section is the single thematic authority for owner communication and the language of project-owned artefacts. Specialised documents may define mechanical coverage, exceptions, or validation, but they must not select another language or restate this policy as a competing authority.

### Owner communication

- Communicate with the owner in Brazilian Portuguese (`pt-BR`).
- Questions, explanations, progress updates, approvals, warnings, handoffs, recommendations, and ready-to-copy messages must use `pt-BR`.
- Present owner-facing labels in `pt-BR`. A literal command, path, canonical identifier, field key, or enum may remain in English inside code formatting when technically necessary, but its surrounding explanation must use `pt-BR`.
- Do not use avoidable English terminology in owner communication when a clear Portuguese expression exists.
- Include exactly one `Próximo passo` only when an ordinary delivery asks the owner for a concrete action, decision, approval, missing input, conversation navigation, or follow-up. Omit the field when no owner action is required.
- Include exactly one `Texto exato para copiar e enviar` in an ordinary delivery only when a complete ready-to-send message would materially help the owner act.
- Every governed handoff uses the compact result summary and uninterrupted five-field routing sequence defined by `Execution-Protocol.md`. It states exactly one directly related next work item and does not import a generic backlog item merely to fill the field.
- Present the governed handoff's `Título sugerido para copiar` and `Texto para copiar e enviar` as the level-three Markdown headings required by `Execution-Protocol.md`. A populated value is a complete fenced `text` block; an absent value uses its exact inline sentinel.
- Every copy-ready message must be complete, contain no unresolved placeholder, preserve the declared authority, scope, baseline, and destination, and avoid secrets or unavailable evidence.
- Never add an ordinary continuation field or a governed handoff merely to satisfy a template. Do not generate filler instructions such as waiting, confirming that no task is authorised, or sending a message that no further action is needed.

### Project-owned artefacts

- Write new source code, project-owned identifiers, comments, docstrings, code documentation, technical or public documentation, README files, API and configuration descriptions, test names and descriptions, logs, technical error descriptions, and commit messages in British English (`en-GB`).
- Use British spelling in new project-owned prose.
- For a limited amendment to an existing file, preserve its established language and dialect and avoid creating a mixed-language document.
- Do not translate, rewrite, or rename existing documentation, source, identifiers, contracts, history, or evidence merely to apply this policy. A broad language migration requires separate authority and a dedicated plan. Never rewrite Git history to translate earlier commit messages.

### External conventions and user interface

- Preserve mandatory names and spellings imposed by programming languages, frameworks, libraries, protocols, standards, external APIs, and third-party products.
- Treat interface language, locale, catalogues, microcopy, and user-visible errors as separate product decisions. Do not infer or change them from the conversation language, engineering language, documentation language, or the language of internal logs and technical errors.

This policy defines language conventions only. It does not authorise implementation, documentation migration, lifecycle transitions, Git operations, external actions, releases, deployments, or interface-language changes.

The original adoption source is preserved only as historical provenance in `../../docs/history/sources/language-policy.md`; it is not an operational authority.

## Conflict resolution

Classify conflicts as:

- `CONFLICT-STATE`: requested action is incompatible with current state.
- `CONFLICT-SCOPE`: action crosses an unauthorised layer or concern.
- `CONFLICT-TOOLING`: setup or dependency work lacks authority.
- `CONFLICT-EVIDENCE`: evidence is missing, stale, or contradictory.
- `CONFLICT-MODULE`: module work violates its phase boundary.
- `CONFLICT-GATE`: validation results disagree or a required gate failed.
- `CONFLICT-CONCURRENCY`: baseline, ownership, write-set, worktree, or mutable-resource isolation is unsafe or contradictory.
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
- `BLOCK-CONCURRENCY`
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

A local commit is an automatic completion step for every authorised task, change, correction, or project activity that changes repository files. Existing authority to make the file change includes authority for its narrow local commit; no separate commit request is required. Do not defer validated changes to a later task.

After the file-changing activity passes validation:

1. Inspect the worktree.
2. Stage only intended files.
3. Run `git diff --cached --check`.
4. Commit with a clear, scoped message.
5. Report the commit identifier and remaining unrelated changes.

Do not create an empty commit when the user requested analysis only or when no file changed. Do not commit while required validation is failing or the activity is blocked; such work is not complete and must be reported accordingly. A completed file-changing activity is not complete until its scoped local commit exists.

Authority for a local commit does not authorise push, a remote branch, a pull request, release, deployment, or any other external action.

## Governance change policy

Any rename, merge, removal, or authority change must update:

- `AGENTS.md` when repository instruction loading changes.
- `Start-Here.md` when the active manifest changes.
- The relevant canonical source.
- `Prompt-System-Change-Log.md`.
- `Project-Snapshot.md` when current operating evidence changes.
- `State-Transition-Log.md` only when a transition decision or state-sensitive event occurred.
- `docs/governance-index.md` when document ownership or layout changes.

Do not copy the same change narrative into every control file.
