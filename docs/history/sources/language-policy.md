# Language Policy

## Governed source status

- Project: ShiftFlow.
- Adoption version: `4.0.0`.
- Status: preserved historical adoption source; not an operational authority.
- Canonical authority:
  [prompts/core/Governance.md](../../../prompts/core/Governance.md#language-policy).
- Loading rule: current sessions load the canonical authority through
  [prompts/Start-Here.md](../../../prompts/Start-Here.md), not this source.
- Authority limit: this source does not authorise file changes, language
  migration, interface changes, Git operations, lifecycle transitions, or
  external actions.

The original policy text is preserved below as adoption provenance. If it
differs from the active corpus, the canonical authority and current
instruction precedence apply.

## Owner communication

- Always communicate with the owner in Brazilian Portuguese (`pt-BR`).
- Questions, explanations, progress updates, approvals, warnings, hand-offs
  and ready-to-copy messages must use `pt-BR`.
- Present owner-facing labels in `pt-BR`.
- Canonical field names, commands and enums may remain in English inside
  backticks or parentheses when technically necessary.

## Project artefacts

Write new project-owned artefacts in British English (`en-GB`), including:

- source code and project-owned identifiers;
- comments, docstrings and code documentation;
- technical and public documentation;
- README files;
- API and configuration descriptions;
- test names and descriptions;
- logs and technical error descriptions;
- commit messages.

Use British spelling in project-owned prose.

## External conventions

Preserve mandatory names and spellings imposed by:

- programming languages;
- frameworks and libraries;
- protocols and standards;
- external APIs;
- third-party products.

Do not translate or rename external contracts merely to apply `en-GB`.

## Existing content

- Do not automatically translate or rewrite existing documentation, source
  history or historical evidence.
- Preserve the current language of an existing file when making a limited
  amendment, avoiding mixed-language documents.
- A full language migration requires a separately authorised and planned
  change.
- Never rewrite Git history to translate previous commit messages.

## User interface

Treat the user-interface language as a separate product decision.

Do not infer the interface language from:

- the conversation language;
- the engineering language;
- the documentation language.

## Governance

This policy defines language conventions only. It does not authorise:

- implementation;
- documentation migration;
- lifecycle transitions;
- Git operations;
- external actions;
- releases or deployments.

Language compliance must be included in the applicable project Quality Gates.
