# Execution Protocol

This document defines task routing, allowed commands, project-memory updates, agent roles, and phase handoff.

## Standard workflow

1. Read `../Start-Here.md`, current state, and governance.
2. Classify the request as consultation, audit, phase execution, module work, maintenance, or transition.
3. Confirm the request is allowed by the current state or post-release policy.
4. Load one relevant phase file and only the required module or playbook.
5. Inspect current code, evidence, and worktree before changing files.
6. Resolve conflicts or blocks before implementation.
7. Execute the smallest complete authorised change.
8. Run proportional quality gates.
9. Update snapshot, changelog, or transition log only when their responsibility is affected.
10. Commit a validated file-changing task with narrow scope.

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

## Agent roles

Roles are responsibilities, not permanent agents:

- Architect: boundaries, contracts, ADRs, cross-layer consistency.
- DBA: schema, constraints, migrations, data integrity, query risk.
- Backend engineer: API, services, persistence, auth, tenant scope.
- Frontend engineer: UI, accessibility, client state, i18n, responsive behaviour.
- Integration engineer: contracts, seed data, end-to-end flows, runtime integration.
- QA/auditor: independent evidence, defects, risk, and regression gates.
- Release manager: release evidence, operational readiness, and handoff.

Use multiple agents only when explicitly requested or when the active execution environment authorises delegation. Agent output is advisory until integrated and validated in the shared worktree.

## Phase handoff template

Use this template only when recommending a transition:

```text
ORIGIN STATE:
RECOMMENDED DESTINATION:
STATUS:
COMPLETED:
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

For implementation work, report the outcome first, then relevant files, validation, commit, risks, and remaining work. For analysis-only work, report findings and evidence without changing files. Never claim success from a banner alone when runtime or external behaviour must be verified.

## Prompt-system changes

For a prompt-system change:

1. Validate the 17-file active manifest.
2. Check all relative Markdown links.
3. Confirm state and version coherence.
4. Ensure historical evidence is not treated as current authority.
5. Update the changelog once.
6. Use a major version for authority or structural changes.
