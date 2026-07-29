# ShiftFlow Prompt System

This is the single entrypoint for the controlled instruction corpus. The active prompt-system version is **3.0.0**.

## Golden rule

No prompt, gate, agent, checklist, snapshot, index, report, or log may independently create or change project state. Only the state-machine decision recorded through [Official-State-Machine.md](core/Official-State-Machine.md) may change state.

## Commit rule

When an authorised task changes files, create a local commit with a clear message and closed scope after the required validation passes. Stage only files related to the task. Do not include generated, environment-specific, or unrelated changes without explicit authorisation. If no file changed, state that no commit is required.

## Current operating state

- State: `STATE-08 PRODUCTION_RELEASE`.
- Current authority: [Current-State.md](state/Current-State.md).
- Current evidence: [Project-Snapshot.md](state/Project-Snapshot.md).
- Changes and historical decisions do not change state by themselves.

## Required reading by task

### Always

1. Read this file.
2. Read [Current-State.md](state/Current-State.md).
3. Read [Governance.md](core/Governance.md).
4. Select only the phase, module, or playbook relevant to the request.

### Phase execution

Also read:

- [Official-State-Machine.md](core/Official-State-Machine.md)
- [Execution-Protocol.md](core/Execution-Protocol.md)
- [Quality-Gates.md](core/Quality-Gates.md)
- One file under `phases/`
- [Modules.md](modules/Modules.md) when a module is involved

### Audit, security, maintenance, or UI/UX

Read the matching file under `playbooks/`. A diagnostic-only request does not authorise implementation. A request to execute or correct a playbook authorises only changes within its declared scope and the current state.

### Conversation handoff or delegated work

For a governed handoff, a new or resumed conversation, internal worker delegation, or any parallel-work decision, also read [Execution-Protocol.md](core/Execution-Protocol.md). Without the protocol's authorised isolation prerequisites, simultaneous work is read-only and all writing is sequential in the coordinating conversation.

### Exceptions

- Conflict, block, or rollback: use [Governance.md](core/Governance.md).
- State transition: use the State Machine, quality gates, snapshot, and transition log.
- Historical evidence: consult `docs/history/` only when the current task requires it.

## Execution modes

### Standard mode

Use for implementation, phase execution, state-sensitive work, migrations, releases, security work, broad audits, or any task that changes files.

### Summary mode

Use for read-only consultation or light analysis. Summary mode does not waive security, scope, state, or evidence requirements.

## Active corpus

The active corpus contains exactly 17 Markdown files:

- `Start-Here.md`
- `core/Governance.md`
- `core/Official-State-Machine.md`
- `core/Execution-Protocol.md`
- `core/Quality-Gates.md`
- `state/Current-State.md`
- `state/Project-Snapshot.md`
- `state/State-Transition-Log.md`
- `state/Prompt-System-Change-Log.md`
- `phases/Foundation-Phases.md`
- `phases/Implementation-Phases.md`
- `phases/Delivery-Phases.md`
- `modules/Modules.md`
- `playbooks/Audit-Playbooks.md`
- `playbooks/Security-Access-Playbooks.md`
- `playbooks/Maintenance-Playbooks.md`
- `playbooks/Prompt-Interface-UI-UX.md`

## Authority and versioning

- Authority is defined once in [Governance.md](core/Governance.md).
- State identifiers and transitions are defined once in [Official-State-Machine.md](core/Official-State-Machine.md).
- Acceptance, evidence, and completion rules are defined once in [Quality-Gates.md](core/Quality-Gates.md).
- Conversation routing, governed handoff, delegated lanes, and safe parallel work are defined once in [Execution-Protocol.md](core/Execution-Protocol.md).
- The current version is declared here; version history belongs in [Prompt-System-Change-Log.md](state/Prompt-System-Change-Log.md).
- Structural changes follow semantic versioning. Authority or state-model changes are major; new compatible capabilities are minor; corrections are patches.

## Governed repository adapters and sources

- [AGENTS.md](../AGENTS.md) routes repository sessions into this corpus and does not replace canonical authority.
- [Conversation-Coordination-Prompt.md](../Conversation-Coordination-Prompt.md) is the retained governed adoption source for version `3.0.0`. It is outside the 17-file active corpus, is not a second operational authority, and grants no automatic permission to change state, files, Git workflow, conversations, or external resources.

## Anti-overengineering

Do not create a new control, gate, state, module, report, or prompt when an existing canonical document can own the rule. A new file must resolve a distinct operational risk, have an owner and loading condition, and be added to this manifest.

## Final rule

Load the smallest authoritative set that can execute the request safely. Current instructions prevail over historical material. When evidence conflicts with instructions, report the conflict and apply [Governance.md](core/Governance.md).
