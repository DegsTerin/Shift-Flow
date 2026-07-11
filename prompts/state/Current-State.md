# Current State

## State declaration

- Current state: `STATE-08 PRODUCTION_RELEASE`
- Allowed phase: `STATE-08 PRODUCTION_RELEASE`
- Next lifecycle action: release closeout or explicitly requested post-release maintenance
- Prompt-system version: `2.0.0`
- Last updated: `2026-07-11`
- Operational blockers: none recorded

## Valid intents

- Prepare, validate, or audit a production release.
- Deploy previously approved migrations.
- Record release evidence.
- Perform explicitly requested post-release maintenance with proportional gates.
- Audit the project or prompt system without changing state.

## Restrictions

- This file reports state; it does not change state.
- Post-release maintenance is not a new state.
- New functionality, dependency changes, runtime changes, schema changes, or migrations require explicit user authority and the exception defined in `../core/Governance.md`.
- Historical references to earlier states are evidence only. The current declaration above prevails.

## Sources

- State rules: `../core/Official-State-Machine.md`
- Current evidence: `Project-Snapshot.md`
- Recent state-sensitive events: `State-Transition-Log.md`
- Closed history: `../../docs/history/state-transitions-2026.md`
