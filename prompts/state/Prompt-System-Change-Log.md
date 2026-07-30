# Prompt System Change Log

This rolling log records current prompt-system changes. Complete history through version `1.4.41` is preserved in `../../docs/history/state-transitions-2026.md`.

## Entry format

- Date and version
- Change type and affected domains
- Summary and impact
- Conflicts resolved
- State impact

## 2026-07-30 - Version 5.0.1

- Type: patch clarification of the existing repository-safe commit policy.
- Scope: prompt entrypoint, canonical governance, execution closeout, Definition of Done, Automatic Review, prompt-system audit, current evidence, and governance mapping.
- Behaviour: every authorised task, change, correction, or project activity that changes repository files ends with an automatic, narrowly scoped local commit after validation; no separate commit request is required, and validated changes are not carried into a later task.
- Boundaries: analysis-only work and activities with no file changes do not create empty commits; failed or blocked validation prevents completion and commit; local-commit authority does not imply push, remote branch creation, pull request, release, deployment, or another external action.
- Conflict resolved: removes ambiguity about whether the owner must request a commit separately after already authorising a file-changing task.
- State impact: `STATE-08 PRODUCTION_RELEASE` and the 17-file active prompt corpus are preserved; no transition, ADR, Human Gate, runtime change, product-interface language change, push, or external action resulted.

## 2026-07-30 - Version 5.0.0

- Type: major owner-continuation authority correction.
- Scope: canonical language policy, ordinary owner delivery, governed handoffs, owner-visible worker returns, quality gates, prompt-system audit, repository routing, current evidence, and governance mapping.
- Behaviour: removes the unconditional requirement to append `Próximo passo` and `Texto exato para copiar e enviar` to every delivery. Ordinary deliveries now omit both when no owner action is required, use only a concrete next action when sufficient, and add ready-to-copy text only when it materially helps the owner act.
- Handoff boundary: governed handoffs continue to require both fields exactly once because they transfer context and require a concrete owner action.
- Anti-filler rule: prohibits waiting, no-authority, and no-further-action messages created solely to populate a template.
- Conflict resolved: owner communication no longer ends with redundant instructions when the requested work is complete and no follow-up is needed.
- State impact: `STATE-08 PRODUCTION_RELEASE` and the 17-file active prompt corpus are preserved; no transition, ADR, Human Gate, runtime change, product-interface language change, or external action resulted.

## 2026-07-30 - Version 4.1.0

- Type: compatible conversation-reasoning guidance and coordination-contract extension.
- Scope: new and resumed conversations, governed handoffs, worker start messages, `GATE-05`, prompt-system audit, current state, and snapshot evidence.
- Guidance: adds owner-facing recommendations for `Leve`, `Médio`, `Alto`, `Extra alto`, `Máximo`, and `Ultra`, following the current Codex principle of using the lowest level that reliably fits the task.
- Selection boundary: distinguishes deepest substantially single-threaded work (`Máximo`) from work that materially benefits from independent subagent lanes (`Ultra`).
- Safety: reasoning level remains advisory and dependent on model, product surface, and account eligibility; `Ultra` does not authorise delegation, parallel writing, worktrees, external action, scope expansion, or bypass of ownership, isolation, or gates.
- Contracts and gates: requires a concrete recommendation and rationale in the first delivery of each new or resumed conversation, every governed handoff, and every worker start message, with uniqueness evaluated per conversation-level contract and matching validation in `GATE-05` and the prompt-system audit.
- State impact: `STATE-08 PRODUCTION_RELEASE` and the 17-file active prompt corpus are preserved; no transition, ADR, Human Gate, runtime change, product-interface language change, or external action resulted.

## 2026-07-29 - Version 4.0.0

- Type: major language-governance authority and owner-delivery contract change.
- Scope: repository instruction routing, global governance, owner-facing delivery, handoff and worker templates, quality gates, prompt-system audit, engineering standards, source-comment enforcement boundaries, UI/UX playbook boundaries, current evidence, governance mapping, and adoption-source placement.
- Authority: established the `Language policy` section in `core/Governance.md` as the single thematic authority; specialised standards define only mechanical application and enforcement.
- Owner delivery: requires `pt-BR` communication, Portuguese owner-facing labels, a concrete next step, and a complete ready-to-copy message in every delivery while preserving necessary literal identifiers and enums.
- Project artefacts: requires `en-GB` for new project-owned artefacts, preserves the established language and dialect of limited legacy amendments, and prohibits opportunistic translation, identifier renaming, contract changes, and Git-history rewriting.
- Product boundary: interface locale, translation catalogues, microcopy, and user-visible error language remain separate product decisions and were not changed.
- Historical preservation: moved the incorporated language-policy and conversation-coordination source texts from the repository root to `docs/history/sources/` as non-operational provenance.
- Templates and gates: aligned governed handoffs, worker messages, phase handoffs, Automatic Review, `GATE-05`, documentation checks, Human CI, and prompt-system audit with audience-appropriate language and authority limits.
- State impact: `STATE-08 PRODUCTION_RELEASE` and the 17-file active prompt corpus are preserved; no transition, ADR, Human Gate, Git operation, code execution, interface change, or external action resulted.

## 2026-07-29 - Version 3.0.0

- Type: major repository instruction-routing and conversation-coordination governance change.
- Scope: repository instruction loading, the retained coordination source, execution protocol, conflict/block handling, `GATE-05 MULTI_AGENT_VALIDATION`, prompt-system audit, current evidence, and governance mapping.
- Summary: added a minimal `AGENTS.md` routing adapter and incorporated conversation routing, governed handoff, delegated lanes, exclusive ownership, worktree isolation, worker/coordinator boundaries, stop conditions, and deterministic integration into the existing `core/Execution-Protocol.md` authority.
- Source status: retained `Conversation-Coordination-Prompt.md` in place as governed adoption provenance outside the 17-file active corpus; it is not an independent authority or automatic authorisation.
- Templates and gates: added complete governed-handoff, worker-start, and worker-return contracts and made `GATE-05` verify baseline, writer exclusivity, mutable-resource isolation, message completeness, sequential fallback, and consolidated integration.
- Conflicts resolved: removed the shared-worktree writing ambiguity, distinguished user-visible conversation navigation from internal delegation, separated temporary lane ownership from canonical ownership, and required read-only parallelism whenever an authorised isolated branch/worktree workflow is absent.
- Authority preserved: the State Machine, governance hierarchy, ADR process, Human CI, and 17-file active manifest remain unchanged; `Execution-Protocol.md` is the single thematic coordination authority.
- State impact: `STATE-08 PRODUCTION_RELEASE` preserved; no transition.

## 2026-07-11 - Version 2.0.0

- Type: major prompt-system architecture change.
- Scope: all 75 former active Markdown files, `docs/history/`, `docs/architecture.md`, and `docs/governance-index.md`.
- Summary: consolidated 75 active files into 17 authoritative files organised by core rules, live state, phase, module, and playbook.
- Historical preservation: consolidated validation, delivery, snapshot, version, changelog, and transition evidence into three files under `docs/history/`.
- Duplication removed: centralised Golden Rule, commit policy, authority hierarchy, tooling exception, execution protocol, quality gates, phase templates, and module templates.
- Conflict resolved: authorised post-release dependency/runtime changes now use one guarded exception instead of conflicting with an absolute tooling prohibition.
- State impact: `STATE-08 PRODUCTION_RELEASE` preserved; no transition.

## Migration summary

- Five entry/version files -> `Start-Here.md`.
- Four governance files -> `core/Governance.md`.
- Four state-model/matrix files -> `core/Official-State-Machine.md` plus the module catalogue.
- Five execution/memory/handoff files -> `core/Execution-Protocol.md`.
- Five gate files -> `core/Quality-Gates.md`.
- Eight phase files -> three files under `phases/`.
- Five module files -> `modules/Modules.md`.
- Twelve audit, security, maintenance, and UI/UX prompt files -> four files under `playbooks/`.
- Four live state/history files -> four focused files under `state/`.
- Twenty-three historical/report/meta artefacts -> consolidated history, canonical architecture, or removal after rule absorption.
