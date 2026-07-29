# State Transition Log

This rolling log contains recent state-sensitive decisions. Closed pre-consolidation history is preserved in `../../docs/history/state-transitions-2026.md`.

## Record format

- Date
- Previous state
- Requested state
- Resulting state
- Event type
- Gates and evidence
- State Machine decision
- Notes

## 2026-07-29 - Conversation coordination governance adoption

- Previous state: `STATE-08 PRODUCTION_RELEASE`
- Requested state: no transition requested
- Resulting state: `STATE-08 PRODUCTION_RELEASE`
- Event type: major repository instruction-routing and safe-parallel-work governance change
- Gates and evidence: 17-file manifest, canonical-authority mapping, relative-link validation, UTF-8/LF and whitespace checks, enum and template consistency, exclusive-writer and isolation review, placeholder review, secret scan, independent semantic review, and Git diff checks
- State Machine decision: preserve current state; conversation coordination, agents, gates, prompts, and documentation do not create a transition
- Notes: without an explicitly authorised isolated branch/worktree workflow, parallel activity remains read-only; the coordinating conversation retains integration custody for state-sensitive records and Human Gate summaries

## 2026-07-11 - Prompt corpus consolidation

- Previous state: `STATE-08 PRODUCTION_RELEASE`
- Requested state: no transition requested
- Resulting state: `STATE-08 PRODUCTION_RELEASE`
- Event type: major documentation and prompt-governance reorganisation
- Gates and evidence: 75-source migration map, 17-file manifest, historical preservation, reference validation, Markdown structure validation, and Git diff checks
- State Machine decision: preserve current state; documentation changes do not create a transition
- Notes: active instructions were separated from historical audit, delivery, and transition evidence
