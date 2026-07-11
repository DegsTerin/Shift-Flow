# Prompt System Change Log

This rolling log records current prompt-system changes. Complete history through version `1.4.41` is preserved in `../../docs/history/state-transitions-2026.md`.

## Entry format

- Date and version
- Change type and affected domains
- Summary and impact
- Conflicts resolved
- State impact

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
