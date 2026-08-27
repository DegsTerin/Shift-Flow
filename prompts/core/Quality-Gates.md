# Quality Gates

This document is the single source for acceptance criteria, evidence, Definition of Done, Human CI, and Automatic Review.

## Universal Definition of Done

A task or phase is complete only when:

- Authorised scope is implemented without unrelated changes.
- Applicable acceptance criteria are satisfied.
- Evidence is reproducible and current.
- Required lint, format, type, test, build, security, migration, runtime, accessibility, or visual checks pass.
- Critical defects and blockers are resolved.
- Non-blocking debt and risk are recorded.
- Current documentation is updated without duplicating history.
- `PLANS.md` is synchronised when the work is broad or multi-step and remains
  non-authoritative.
- Applicable language-policy requirements are satisfied without translating legacy content or changing interface language by inference.
- Governed handoffs use the compact canonical structure and delegated work satisfies `GATE-05 MULTI_AGENT_VALIDATION` when applicable.
- Every completed authorised file-changing task has its own scoped local commit; no separate commit instruction is required.

Missing evidence means `NOT COMPLETE`, not assumed approval.

## Evidence standard

Valid evidence identifies the command or inspection, relevant scope, result, and limitation. Prefer saved code, tests, command output, runtime health checks, database status, screenshots, or reviewed documents.

Invalid evidence includes:

- An unverified success statement.
- A startup banner without process and HTTP health.
- A stale report presented as current execution.
- A test result without the relevant configuration or target.
- A screenshot without page, viewport, and expected behaviour.
- A migration claim without schema and migration status.

## Executable development gates

The checked-in workflow has two deliberately different feedback levels:

- `eng/development.ps1 Quick` is `NON_GATE`. It checks prepared dependencies,
  quality, unit tests, build and diff hygiene for rapid development feedback.
  It excludes the online dependency audit and every database, seed, E2E, load,
  browser, runtime and deployment operation.
- `eng/development.ps1 Full` delegates exactly once to the canonical
  runtime-credential-free core gate in `eng/ci.ps1`. The gate enforces its own workflow
  policy, locked preparation, online dependency audit, quality, unit tests,
  build and diff hygiene.

`Full -Offline` may be used for diagnostic coverage when registry access is
unavailable, but its dependency audit result is `NOT_RUN` and the command must
finish non-zero as `INCOMPLETE_NON_GATE`; it cannot be mistaken for the online
core gate. A passing core gate is not runtime, release, Human CI, Human Gate,
deployment or lifecycle evidence. Each supported remote toolchain lane must
call the same core gate once and inspect the candidate range before a separate
disposable runtime job may run migrations, seeds, Playwright or load checks.

## Language compliance

Apply the canonical language policy in `Governance.md` proportionally:

- Owner-facing communication, labels, recommendations, warnings, handoffs, and ready-to-copy messages use `pt-BR`.
- An ordinary owner-facing delivery with no required owner action omits both continuation fields.
- A delivery that requires a concrete owner action includes exactly one `Próximo passo`; it includes exactly one `Texto exato para copiar e enviar` only when a ready-to-send message materially helps that action.
- A governed handoff uses exactly one compact result summary followed by the uninterrupted five-field sequence `Conversa recomendada` -> `Título sugerido para copiar` -> `Raciocínio recomendado` -> `Paralelismo` -> `Texto para copiar e enviar`.
- The governed handoff's title and payload labels are level-three Markdown headings. Populated values use an immediately following fenced `text` block; absent values use the exact inline sentinels from `Execution-Protocol.md`.
- Handoff values are concrete, contain no unresolved placeholder or authority expansion, align with conversation routing, and never use waiting, no-authority, no-further-action, title, or parallel-plan filler.
- New project-owned artefacts use `en-GB`; a limited amendment preserves the existing file's established language and dialect.
- Mandatory external names, contracts, identifiers, and spellings remain unchanged.
- Language review does not authorise bulk translation, identifier migration, interface-locale changes, microcopy changes, Git history rewriting, or another out-of-scope action.
- A new persistent artefact delivered to the owner may remain in `en-GB`, but its owner-facing summary and any applicable next action use `pt-BR`.

Missing audience, destination, language, continuation-applicability, legacy-preservation, or interface-authority evidence means the applicable gate is not complete.

## GATE-05 MULTI_AGENT_VALIDATION

For the first owner-facing delivery in every new or resumed user-visible conversation:

- Exactly one reasoning recommendation and exactly one concrete rationale are present at the enclosing conversation-delivery level.
- The recommendation uses an owner-facing level defined by `Execution-Protocol.md`, matches the task's complexity and decomposition, and does not claim unavailable capability.
- Later ordinary deliveries repeat these fields only when the recommendation changes.
- When the first delivery is itself a governed handoff, its compact `Raciocínio recomendado` value contains the level, rationale, and fallback and no separate `Motivo do raciocínio` field interrupts or duplicates the handoff sequence.
- Separately delimited ready-to-copy messages are evaluated independently for their destination conversations and do not count as duplicates in the enclosing delivery.

For every governed user-visible handoff:

- Conversation routing and parallel work use the exact canonical enums from `Execution-Protocol.md`.
- `Solicitação`, `Próximo trabalho recomendado`, `Estado/critério`, and `Sua ação agora` form one compact result summary before the routing sequence. It distinguishes completed work, named pending work, untested behaviour, and blocked validation; the next work, owner, authority or entry condition, and immediate owner action are concrete and mutually coherent with the handoff trigger.
- The routing sequence is consecutive and ordered exactly as `Conversa recomendada`, `Título sugerido para copiar`, `Raciocínio recomendado`, `Paralelismo`, and `Texto para copiar e enviar`; no explanation, plan, message, or extension interrupts it.
- `Conversa recomendada` combines route, the `conversa atual`, `nova conversa`, or confirmed `conversa existente` target, and reason. `RETURN_TO_EXISTING` uses only an owner-supplied or owner-confirmed title or label.
- `START_NEW` uses a separately copyable suggested non-canonical title. `CONTINUE_CURRENT` and `RETURN_TO_EXISTING` use exactly `### Título sugerido para copiar: nenhum título é necessário` on one unfenced line.
- The handoff carries exactly one current reasoning recommendation, rationale, and explicit fallback at its own contract level without contradicting the first-delivery selection; each separately delimited worker start message carries and is validated against its own recommendation for the destination worker.
- A populated title or payload uses a fenced `text` block as the next content block after its heading; only Markdown's separating blank line may intervene.
- A required payload is complete and preserves the declared destination, authority, positive scope, negative scope, baseline, checks, expected result, and stop condition without expansion or contradiction. An absent payload uses exactly `### Texto para copiar e enviar: nenhum texto é necessário` on one unfenced line and is valid only when the handoff still has a legitimate trigger, concrete next work, and concrete owner action but no copy-ready message adds value.
- Blank values and unresolved placeholders are invalid in a real handoff. Canonical absence values are permitted only under the conditions defined by `Execution-Protocol.md`.
- `SEQUENTIAL_ONLY` ends the compact contract after `Texto para copiar e enviar` and creates no parallel-plan or lane-message fields.
- `PARALLEL_OPTIONAL` and `PARALLEL_RECOMMENDED` place `Plano paralelo` and `Mensagens para as frentes` only after the complete compact sequence and payload.
- A state-transition recommendation composes the common handoff with the phase extension without conflicting duplicate values.
- Every owner-visible handoff and ready-to-copy worker message uses the `pt-BR` presentation defined by `Execution-Protocol.md`; the compact handoff occurs exactly once at its own contract level, and internal identifiers and canonical enums may remain unchanged.

When any internal or user-visible worker lane is started:

- The coordinating conversation, reproducible baseline, numbered lanes, dependencies, write sets, logical artefacts, and mutable resources are explicit.
- Worker start messages record a suitable reasoning recommendation and rationale; `Ultra` never substitutes for delegation authority, writer isolation, or a valid parallel plan.
- Worker start messages and the non-recursive, copy-ready worker return payload are complete and consistent with lane authority.
- One active writer owns each path, logical artefact, and mutable resource; parent/child paths and cross-file contracts are checked for overlap.
- Workers remain within lane authority and do not update state, snapshot, history, changelog, ADRs, gate reports, lifecycle, or Human Gates.
- The coordinating conversation integrates one candidate at a time, runs local checks after each integration, and runs cross-cutting checks on the combined result.
- Stop conditions and a sequential fallback are explicit, and no last-write-wins, automatic overwrite, or reversal of unrelated work occurred.
- Human CI is presented only from the coordinating conversation after integration and consolidated review.

A sequentially delegated worker may run only after the prior writer stops and ownership transfer is explicit. It must satisfy the worker contracts but does not require parallel branch/worktree evidence.

Parallel read-only lanes may pass without branches or worktrees only when shared inputs are frozen until the lanes return and no lane can mutate a file, logical artefact, cache, output, process, runtime, port, database, index, external resource, or other state.

Parallel writing additionally requires explicit owner authorisation, a tracked Git baseline, a dedicated branch and separate worktree per writer, non-overlapping write sets and logical artefacts, isolated mutable resources, and deterministic integration.

Missing mode, reasoning recommendation, rationale, scope, ownership, isolation, or message-consistency evidence means `BLOCKED`, not assumed approval.

## Acceptance by state

### STATE-00 INIT

- Entrypoint, state model, current state, evidence source, and transition log exist.
- The active corpus and its ownership are known.

### STATE-01 SETUP_PROJECT

- Required workspace structure, dependencies, environment template, database service, and baseline scripts exist.
- Installation and startup are reproducible.
- No business feature was implemented as setup.

### STATE-02 ARCHITECTURE

- Runtime components, boundaries, modules, data flow, security, tenancy, observability, deployment direction, and major decisions are documented.
- ADRs exist for durable decisions where appropriate.
- No functional implementation was smuggled into the phase.

### STATE-03 DATABASE_MODELING

- Required entities, relations, tenant scope, constraints, indexes, audit/history, and migration strategy are defined.
- Prisma validation passes and migrations are forward-only.
- No unrelated backend or frontend implementation is included.

### STATE-04 BACKEND_IMPLEMENTATION

- APIs, validation, services, repositories, authentication, RBAC, tenant isolation, stable errors, and tests satisfy approved contracts.
- Lint, typecheck, unit/integration tests, build, and security checks pass as applicable.
- Schema changes are separately authorised.

### STATE-05 FRONTEND_IMPLEMENTATION

- Required screens, states, forms, navigation, i18n, themes, accessibility, and responsive behaviour satisfy approved contracts.
- No mock data replaces an available real endpoint.
- Lint, typecheck, tests, build, accessibility, and visual checks pass as applicable.

### STATE-06 INTEGRATION

- Frontend, API, database, authentication, tenant scope, RBAC, and seed data work end to end.
- Approved migrations are applied in the integration environment.
- Contract and runtime failures are resolved without adding unapproved features.

### STATE-07 TESTING_HOMOLOGATION

- Functional, end-to-end, accessibility, responsive, security, performance, migration, and regression coverage is executed proportionally.
- Defects are classified and blocking defects are resolved.
- Accepted risks and intentional skips are explicit.

### STATE-08 PRODUCTION_RELEASE

- Homologation is approved.
- Migration status, dependency security, quality, build, E2E, load, operational documentation, rollback notes, and runtime health are verified as applicable.
- Remaining external deployment gaps are explicit.

## Human CI

Human CI validates judgement that automation cannot establish alone:

- Scope and state compliance.
- Architecture and maintainability.
- Security and tenant isolation.
- UX, accessibility, visual consistency, and operational usability.
- Evidence quality and residual risk.
- Whether a reported success matches the user's practical outcome.
- Language-policy compliance, including owner-facing `pt-BR`, legacy preservation, and separation from interface-language decisions.

Human CI may approve, approve with observation, reject, or block. It cannot change state.

## Automatic Review

Automatic Review independently checks:

- Architecture and coupling.
- Data integrity and migration safety.
- Backend contracts, validation, auth, RBAC, and tenant scope.
- Frontend behaviour, accessibility, responsive layout, and real data usage.
- Integration correctness.
- Security, supply chain, performance, observability, tests, and release gates.
- Documentation, references, version, and state consistency.
- Conversation routing, lane authority, writer exclusivity, mutable-resource isolation, and integration evidence.
- Task closeout, narrow staging, automatic local-commit evidence, and absence of unauthorised push or another remote action.
- Audience-appropriate language, correct conditional use or omission of owner continuation fields, legacy-language preservation, and absence of unauthorised interface-language changes.

Required result format:

```text
SITUAÇÃO: APPROVED | APPROVED_WITH_OBSERVATION | REJECTED | BLOCKED
ACHADOS CRÍTICOS:
ACHADOS NÃO CRÍTICOS:
RISCOS TÉCNICOS:
DÍVIDA TÉCNICA:
EVIDÊNCIAS:
DECISÃO:
TRANSIÇÃO DE ESTADO: APENAS RECOMENDAÇÃO
```

## Gate selection

- Documentation-only: link/reference validation, formatting, consistency, applicable language-policy and coordination-contract checks, and diff checks.
- Local code change: `Quick` for iterative feedback, targeted regression tests,
  and the online canonical `Full` core gate before completion.
- Database: Prisma format/validate, migration review/status, and affected tests.
- Security: targeted security tests, secret scan, dependency audit, and auth/tenant checks.
- UI: targeted tests, accessibility, responsive/visual inspection, and build.
- Release: full project-defined release gate plus runtime health.

Run broader gates when the change crosses layers or when narrower evidence cannot establish safety.
