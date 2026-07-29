# Execution Protocol

This document is the single thematic authority for task routing, allowed commands, project-memory updates, agent roles, conversation coordination, safe parallel work, and handoff. It remains subordinate to the State Machine, governance, and quality gates.

## Fail-safe coordination principle

Safety and consistency take priority over speed. Do not promise absolute absence of errors. Use preventive, detective, and stop controls so ownership overlap, stale baselines, conflicts, and unauthorised mutations are identified before integration. When evidence or isolation is uncertain, use sequential execution.

## Standard workflow

1. Read `../Start-Here.md`, current state, and governance.
2. Classify the request as consultation, audit, phase execution, module work, maintenance, transition, or governed handoff.
3. Confirm the request is allowed by the current state or post-release policy.
4. Load one relevant phase file and only the required module or playbook.
5. Inspect current code, evidence, Git/worktree condition, and known concurrent activity before changing files.
6. Establish a reproducible baseline and confirm positive scope, negative scope, and authority.
7. When a governed handoff or delegation is required, classify conversation routing and parallel work independently.
8. Resolve conflicts, ownership overlap, isolation failures, or blocks before implementation.
9. Execute the smallest complete authorised change.
10. Integrate one delivery at a time through the coordinating conversation when delegation is used.
11. Run proportional quality gates, including cross-lane checks after integration.
12. Update snapshot, changelog, or transition log only when their responsibility is affected.
13. Commit a validated file-changing task with narrow scope.

## Allowed commands by state

These are operational intents, not literal shell commands.

| Current state | Allowed intents |
|---|---|
| `STATE-00` | Inventory, audit current state, execute or request controlled skip to setup |
| `STATE-01` | Initialise project, configure baseline tooling, validate setup, request architecture |
| `STATE-02` | Define and audit architecture, create ADRs, request database modelling |
| `STATE-03` | Model data, create forward migration, validate schema, request backend |
| `STATE-04` | Implement and audit backend, run backend gates, request frontend |
| `STATE-05` | Implement and audit frontend, run UI gates, request integration |
| `STATE-06` | Integrate approved layers, apply approved migrations, seed integration data, request homologation |
| `STATE-07` | Test, audit, homologate, correct classified defects, request production release |
| `STATE-08` | Release, deploy approved migrations, audit release, or execute authorised post-release maintenance |

At every state, read-only consultation, evidence inspection, prompt-system audit, conflict reporting, and block reporting are allowed.

## Project memory

`../state/Project-Snapshot.md` is the current evidence summary, not an event log. Update it only when current architecture, implemented capability, active dependency, risk, blocker, or operating fact changes.

Do not copy full changelog entries into the snapshot. Link to:

- `Prompt-System-Change-Log.md` for prompt-system changes.
- `State-Transition-Log.md` for state-sensitive decisions.
- `docs/history/` for closed historical evidence.
- Canonical `docs/` files for durable architecture and operations.

Conversations and worker context are temporary. Reconcile every new or resumed context with the active instruction corpus, current state, factual evidence, ADRs, and authorised scope before acting. Conversation memory never overrides repository authority or factual records.

## Agent roles

Roles are responsibilities, not permanent agents:

- Architect: boundaries, contracts, ADRs, cross-layer consistency.
- DBA: schema, constraints, migrations, data integrity, query risk.
- Backend engineer: API, services, persistence, auth, tenant scope.
- Frontend engineer: UI, accessibility, client state, i18n, responsive behaviour.
- Integration engineer: contracts, seed data, end-to-end flows, runtime integration.
- QA/auditor: independent evidence, defects, risk, and regression gates.
- Release manager: release evidence, operational readiness, and handoff.

Roles do not create permanent agents, project state, or approval authority. Use multiple agents only when explicitly requested or when the active execution environment authorises delegation. Every worker result is an integration candidate until the coordinating conversation inspects, integrates, and validates it.

User-visible conversations and environment-managed internal workers are distinct. The project owner manually navigates user-visible conversations. Environment-authorised internal delegation may be started by the coordinating conversation, but it remains subject to the same baseline, lane, ownership, isolation, and stop rules. An environment-issued worker or coordinator identifier is an internal routing identifier, not a user-visible conversation title.

## Conversation routing

A governed handoff is required when recommending that the project owner continue in another user-visible conversation, return to a confirmed conversation, pass to another stage or target with remaining work, or start user-visible worker conversations. Ordinary progress updates that do not transfer user-visible context are not handoffs.

Starting an environment-managed internal worker does not claim or simulate user-visible conversation navigation. It uses the applicable parallel-lane plan or explicit sequential-delegation record and the worker start-message contract, with environment-issued internal identifiers recorded in the baseline. The next user-visible handoff still classifies conversation routing and parallel work normally.

Every governed handoff uses exactly one conversation action:

- `CONTINUE_CURRENT`: the same objective, state, or batch remains active and the current context is reliable.
- `START_NEW`: another state, gate, batch, or independent subject begins; the current context is excessively long; or no confirmed prior conversation can be identified.
- `RETURN_TO_EXISTING`: a prior conversation title or label was supplied or confirmed by the project owner.

Mandatory routing rules:

- The agent recommends an action; the project owner navigates user-visible conversations.
- Never claim to have opened, found, renamed, or changed a user-visible conversation.
- Never invent a title, label, link, or identifier for an existing conversation.
- A suggested title for a new conversation is non-canonical until the owner uses or confirms it.
- If a prior title or label is not confirmed, use `START_NEW`, not `RETURN_TO_EXISTING`.
- A new or resumed conversation must reread applicable instructions and confirm current state, baseline, authority, positive scope, and negative scope.
- The coordinating conversation must hold the complete current decision summary before presenting `GATE-03 HUMAN_CI` or another Human Gate.

## Governed handoff contract

Every governed handoff includes these fields in this order:

```text
Status:
Completed:
Remaining for this target:
Next step:
Next stage:
Your action now:
Authority:
Positive scope:
Negative scope:
Baseline:
Conversation action: CONTINUE_CURRENT | START_NEW | RETURN_TO_EXISTING
Conversation target:
Suggested title:
Conversation reason:
Exact next message:
Parallel work: SEQUENTIAL_ONLY | PARALLEL_OPTIONAL | PARALLEL_RECOMMENDED
Parallel plan:
Exact parallel messages:
```

Every field in a real handoff must contain a concrete value or `None - [specific reason]`; blank fields are invalid. `Exact next message` must be complete, filled, ready to copy, and consistent with the declared authority, positive scope, negative scope, baseline, and conversation action. It must not expand authority or scope. No placeholder may remain in a real handoff. `Conversation target` must use a confirmed label for `RETURN_TO_EXISTING`. A template may show placeholders only when it is clearly labelled as a template rather than an executed handoff.

When work is sequential, use:

```text
Parallel plan: None - [specific reason]
Exact parallel messages: None - parallel work is not recommended
```

Replace the bracketed reason in every real handoff.

## Parallel-work classification

Conversation routing and parallel-work classification are independent. Every governed handoff uses exactly one parallel-work value:

- `SEQUENTIAL_ONLY`: tasks, files, logical artefacts, or mutable resources depend on each other; a contract is unstable; a Human Gate or other owner decision is pending; isolation is insufficient; or conflict risk exists.
- `PARALLEL_OPTIONAL`: tasks are independent, but the expected gain is small or coordination cost may exceed the benefit.
- `PARALLEL_RECOMMENDED`: at least two tasks are genuinely independent, bounded, verifiable, and provide material time or specialisation benefit.

When uncertain, use `SEQUENTIAL_ONLY`. Use the smallest useful number of lanes.

## Parallel plan requirements

Before parallel lanes begin, the plan must declare:

1. One coordinating context. A user-visible multi-conversation plan requires a title or label confirmed by the project owner. Internal delegation records the environment-issued coordinating identifier and the existing task and delegation authority.
2. A common baseline identified by prompt-system version and, when Git exists, commit identifier, branch, worktree condition, and known uncommitted changes.
3. Numbered lanes with an exclusive objective and expected result for each lane.
4. Dependencies arranged without cycles.
5. Exclusive temporary ownership of paths, logical artefacts, and mutable resources.
6. Shared inputs that remain read-only.
7. Files, artefacts, resources, and actions prohibited for each lane.
8. Checks, evidence, and objective stop conditions.
9. One complete start message for each worker.
10. A copy-ready return-message contract for each worker.
11. A deterministic integration order.
12. Local checks after each integration and cross-cutting checks over the combined result.
13. An explicit sequential fallback.

Lane ownership is temporary execution custody. It never replaces module ownership, CODEOWNERS, an accepted ADR, the State Machine, or Human Gate authority.

## Exclusive ownership and mutable-resource isolation

Only one active writer may own a file, directory tree, logical artefact, or mutable resource during a lane window. Parent/child path overlap counts as overlap. Integration by the coordinating conversation is an explicit ownership transfer after the worker stops writing.

Single-writer ownership applies to:

- Files and directories.
- Contracts, schemas, migrations, lockfiles, manifests, and project or solution files.
- Configuration, pipelines, databases, indexes, and mutable corpora.
- Ports, processes, runtimes, temporary directories, caches, and build outputs.
- External resources and shared logical artefacts that span more than one file.

Current state, snapshot, history, changelog, ADR records, gate reports, integration decisions, and Human Gate summaries remain in the coordinating conversation's integration custody. That custody does not grant authority to change state, accept an ADR, or approve a Human Gate.

A worker delivers only an integration candidate. It cannot declare the batch, state, or project complete.

## Git and worktree safety

Parallel writing is permitted only when all of these conditions are true:

1. The project is a tracked Git repository.
2. The project owner explicitly authorised the parallel branch/worktree workflow.
3. Every parallel writer has a dedicated branch and separate worktree.
4. Write sets, logical artefacts, and mutable runtime resources do not overlap.
5. The coordinating conversation has a deterministic integration and rollback-safe validation plan.

If any condition is absent, simultaneous lanes may inspect only frozen read-only inputs. They must not mutate files, logical artefacts, caches, outputs, processes, runtimes, ports, databases, indexes, external resources, or any other state. Freeze shared inputs until the affected read-only lanes return, and perform every mutation sequentially in the coordinating conversation. Git presence alone is insufficient. Different branches in the same worktree are not isolation.

When parallel writing is authorised, isolate ports, processes, databases, indexes, temporary files, caches, and build outputs as applicable. Merge, rebase, integration, and current-state updates remain the coordinating conversation's responsibility.

Authorisation for local branches or worktrees never implies push, deploy, paid consumption, destructive action, or another external mutation.

## Worker responsibilities

Every worker:

- Must reread applicable instructions and confirm baseline, authority, lane ownership, positive scope, and negative scope.
- Must work only within its lane and apply least privilege.
- Must treat shared inputs as read-only and must not integrate another lane.
- Must not update current state, snapshot, history, changelog, ADRs, gate reports, or integration decisions.
- Must not accept an ADR, promote lifecycle, or request, confirm, or present a Human Gate.
- Must not perform any external action that lacks explicit authority.
- Must report inspected and changed files, logical artefacts, checks, evidence, limitations, and risks.
- Must produce the exact return message required by the coordinating conversation.

## Mandatory stop conditions

A worker or coordinating conversation must stop the affected operation before continuing when it detects:

- Overlapping ownership of a path, logical artefact, or mutable resource.
- A changed, stale, incomplete, or unreproducible baseline.
- An unexpected concurrent change.
- A dependency that has not been integrated.
- An unstable contract or schema.
- A port, process, database, index, runtime, cache, or output collision.
- A pending owner decision or Human Gate.
- A need to broaden scope or authority.
- Insufficient isolation.
- An integration conflict.
- A potentially irreversible action without explicit authority.

Never use last-write-wins, automatic overwrite, or reversal of another contributor's work. Preserve the affected lane and resume it sequentially from the last validated baseline after the block is resolved.

## Coordinating conversation responsibilities

The coordinating conversation must:

- Maintain scope, authority, baseline, lane boundaries, and the ownership map.
- Validate the plan before starting internal workers or recommending that the owner starts user-visible worker conversations.
- Integrate one candidate at a time in deterministic order.
- Inspect every result and resolve conflicts centrally without discarding unrelated work.
- Run local checks after each integration and all cross-cutting checks over the combined result.
- Update current state, snapshot, history, changelog, ADR records, and gate reports once per integrated batch and only when each document's responsibility is affected.
- Present Human CI only after integration, consolidated evidence, and independent review are complete.
- Leave state transitions to the State Machine.

## Worker start-message template

Every `Exact parallel messages` entry must be a complete instance of this template:

```text
Project:
Workspace:
Lane:
Conversation label:
Confirmed coordinating conversation:
Baseline:
State/gate/batch:
Existing authority:
Exclusive objective:
Preconditions:
Frozen dependencies:
Exclusive permitted writes or read-only:
Read-only inputs:
Prohibited files and actions:
Checks:
Expected output:
Stop conditions:
Integration order:
Return message format:
```

Every real worker start message must fill every field with a concrete value or `None - reason` and must contain no unresolved placeholder. For internal delegation, `Confirmed coordinating conversation` contains the environment-issued coordinating identifier and the task authority; it must not invent a user-visible title.

## Worker return-message template

The coordinating conversation must define a copy-ready return contract. The completed block is itself the exact return message to the coordinator; it must not contain or reproduce a nested `Exact return message` field. It is an internal integration payload and does not replace the governed user-visible handoff contract. Unless a stricter contract is required, use:

```text
Lane:
Status:
Baseline verified:
Files and artefacts inspected:
Files and artefacts changed:
Checks and results:
Delivered result:
Limitations and residual risks:
Stop condition triggered:
Integration recommendation: CANDIDATE | NOT_CANDIDATE
```

Every real return payload must fill every field, contain no unresolved placeholder, and remain within the worker's baseline and lane authority.

## Phase handoff template

Use this extension only when recommending a state transition. Complete the governed handoff contract once, then append:

```text
ORIGIN STATE:
RECOMMENDED DESTINATION:
NOT COMPLETED:
EVIDENCE:
FILES CHANGED:
DECISIONS:
DEPENDENCIES:
RISKS AND TECHNICAL DEBT:
BLOCKING ITEMS:
NON-BLOCKING ITEMS:
GATES RUN:
GATE RESULTS:
SNAPSHOT UPDATED:
TRANSITION LOG UPDATED:
RECOMMENDATION:
STATE MACHINE DECISION: PENDING
```

Completed handoffs belong in `docs/history/phase-delivery-history.md`, not in this template.

## Output contract

For implementation work, report the outcome first, then relevant files, validation, commit, risks, and remaining work. For analysis-only work, report findings and evidence without changing files. Use the governed handoff contract only when its trigger applies. Never claim success from a banner alone when runtime or external behaviour must be verified.

## Prompt-system changes

For a prompt-system change:

1. Validate the active manifest declared by `../Start-Here.md`.
2. Check all relative Markdown links.
3. Confirm state and version coherence.
4. Ensure historical evidence is not treated as current authority.
5. Update the changelog once.
6. Validate conversation-routing and parallel-work contracts when affected.
7. Use a major version for authority or structural changes.
