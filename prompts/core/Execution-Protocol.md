# Execution Protocol

This document is the single thematic authority for task routing, allowed commands, project-memory updates, agent roles, conversation coordination, safe parallel work, and handoff. It remains subordinate to the State Machine, governance, and quality gates.

## Fail-safe coordination principle

Safety and consistency take priority over speed. Do not promise absolute absence of errors. Use preventive, detective, and stop controls so ownership overlap, stale baselines, conflicts, and unauthorised mutations are identified before integration. When evidence or isolation is uncertain, use sequential execution.

## Owner-facing delivery

Apply the canonical language policy in `Governance.md` to every response delivered to the owner. Owner-facing narrative, labels, recommendations, warnings, and ready-to-copy messages use `pt-BR`. Literal paths, commands, canonical identifiers, and enums may remain unchanged inside code formatting when necessary.

Use continuation fields according to the action genuinely required from the owner:

- If no owner action is required and no governed handoff applies, omit both fields and end the delivery naturally.
- If a concrete owner action is required but no ready-to-send message would add value, include only:

  ```text
  Próximo passo:
  ```

- If the owner needs a ready-to-send message for an approval, decision, continuation, or another destination, include both fields exactly once:

  ```text
  Próximo passo:
  Texto exato para copiar e enviar:
  ```

A governed handoff uses its complete compact contract instead of the ordinary continuation fields and must not repeat either structure afterwards. Every included value must be concrete, complete, consistent with current authority and scope, and free of unresolved placeholders. The copy-ready text must be ready for the owner to send to the target declared by conversation routing.

Never use an empty, `Nenhum`, waiting, no-authority, or no-further-action value merely to keep a continuation field present. Omit an inapplicable field instead.

## Standard workflow

1. Read `../Start-Here.md`, current state, and governance.
2. Classify the request as consultation, audit, phase execution, module work, maintenance, transition, or governed handoff.
3. Confirm the request is allowed by the current state or post-release policy.
4. Load one relevant phase file and only the required module or playbook.
5. Inspect current code, evidence, Git/worktree condition, and known concurrent activity before changing files.
6. Establish a reproducible baseline and confirm positive scope, negative scope, and authority; create or reconcile the active `../../PLANS.md` record for broad or multi-step implementation.
7. When a governed handoff or delegation is required, classify conversation routing and parallel work independently.
8. Resolve conflicts, ownership overlap, isolation failures, or blocks before implementation.
9. Execute the smallest complete authorised change.
10. Integrate one delivery at a time through the coordinating conversation when delegation is used.
11. Run proportional quality gates, including cross-lane checks after integration.
12. Synchronise the executable plan and update snapshot, changelog, or transition log only when their responsibility is affected.
13. Automatically commit each validated file-changing task with narrow scope before final delivery; do not wait for a separate request or carry the changes into a later activity.

## Executable planning and development loop

Broad, cross-layer, uncertain, or multi-step implementation must keep the
newest active record in `../../PLANS.md` synchronised. The record identifies at
least the objective, authority, exact baseline, positive and negative scope,
acceptance criteria, ordered increments, dependencies, risks, validation
evidence, blockers, integration status and remaining work. It is execution
evidence, not a prompt, state source, ADR, gate result or authority grant. When
it conflicts with the active corpus or factual repository state, stop, report
the conflict and correct the plan before continuing.

Use this iterative cycle for development and maintenance:

1. **Audit** the applicable instructions, documentation, code, tests, Git
   state, protected artefacts and negative scope read-only before material
   mutation.
2. **Prioritise** security and integrity, functional blockers, recurring root
   causes, the critical path, regressions, productivity and then optional
   refinements.
3. **Correct** the smallest coherent root cause within the authorised scope.
4. **Test** focally after each increment and add regression coverage when the
   risk is executable.
5. **Integrate** one inspected delivery at a time, preserving other work and
   shared-resource boundaries.
6. **Measure** the practical outcome and distinguish observed, inferred,
   blocked and untested results.
7. **Document** current behaviour, evidence, limitations and the active plan
   without rewriting protected history.
8. **Retrospect** on recurring failure or manual effort and improve the
   smallest owning control rather than adding duplicate process.

The executable repository entry point is `../../eng/development.ps1`:

- `Doctor` is read-only diagnosis.
- `Setup` performs locked dependency preparation and Prisma client generation
  without migration, seed or database connection.
- `Quick` is explicitly `NON_GATE` fast feedback and cannot be presented as a
  canonical pass.
- `Full` delegates exactly once to `../../eng/ci.ps1`, the runtime-credential-free core
  repository gate shared with remote CI.
- `PlanOnly` prints the deterministic plan without executing it.

Database migration, seed, runtime, E2E, load, browser, deployment, Human Gate
and lifecycle evidence remain separate even when the core `Full` gate passes.
An offline `NOT_RUN` result never becomes a pass by inference; `Full -Offline`
must finish mechanically as `INCOMPLETE_NON_GATE`.

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
- A new or resumed conversation must reread applicable instructions and confirm current state, baseline, authority, positive scope, negative scope, and its reasoning recommendation.
- The coordinating conversation must hold the complete current decision summary before presenting `GATE-03 HUMAN_CI` or another Human Gate.

## Conversation reasoning recommendation

Every new or resumed user-visible conversation receives one advisory reasoning recommendation in its first owner-facing delivery. A governed handoff carries a current recommendation for its destination through the compact contract. Later ordinary deliveries repeat the first-delivery fields only when the recommendation changes.

Use the lowest level expected to produce a reliable result, and increase it when the work requires more planning, analysis, source reconciliation, edge-case review, or independent checking. The owner selects the available level in the Codex interface. Never claim to have selected or changed a user-visible setting without verified capability.

Available levels depend on the selected model, product surface, and account eligibility. `Ultra` requires an eligible account and supported model; when available, it combines maximum reasoning with proactive delegation.

Use these owner-facing labels and current Codex mappings:

| Owner-facing label | Codex label or value | Recommended use |
|---|---|---|
| `Leve` | `Light` in supported graphical clients; `low` in CLI/configuration | Quick, well-scoped consultation, fact or path lookup, status checks, extraction, and single-file mechanical inspection with stable authority and low risk. |
| `Médio` | `Medium` / `medium` | Balanced default for routine planning, bounded documentation, isolated tests, small stable code changes, and ordinary maintenance with clear acceptance criteria. |
| `Alto` | `High` / `high` | Multi-step implementation, debugging, cross-file reasoning, integration against stable contracts, regression analysis, and state-sensitive planning. |
| `Extra alto` | `Extra High` / `xhigh` | Architecture, security, migrations, release or homologation review, cross-layer changes, conflicting evidence, and difficult audit or reviewer work. |
| `Máximo` | `Max` / `max`, when supported | The hardest substantially single-threaded problem, such as deep root-cause analysis, an irreducible design trade-off, high-risk rollback reasoning, or a critical decision where depth matters more than speed or usage. |
| `Ultra` | `Ultra` / `ultra`, when supported | A large complex objective with at least two genuinely independent, bounded lanes where maximum reasoning and proactive subagent delegation provide material benefit, such as a broad read-heavy audit or multi-domain evidence synthesis. |

Apply these rules:

- `Médio` is the normal starting point; importance alone does not justify `Máximo` or `Ultra`.
- `Máximo` and `Ultra` are not consecutive quality grades. Use `Máximo` for deepest reasoning on one tightly coupled problem and `Ultra` for meaningful decomposition across independent lanes.
- `Ultra` does not authorise delegation, parallel writing, a new worktree, external action, broader scope, or higher-risk mutation. All authority, routing, ownership, isolation, and `GATE-05` requirements still apply.
- If `Ultra` is recommended but unavailable, use the highest suitable supported level and request or plan delegation explicitly only when this protocol permits it.
- If a level is unavailable for the selected model, product surface, or account, recommend the closest suitable available level and state the limitation rather than inventing support.
- Reassess the recommendation when scope, risk, evidence quality, or parallel-work classification materially changes.
- Every governed handoff states an explicit fallback. Use `Médio` when `Leve` is unavailable; `Alto` when `Médio` is unavailable; `Médio` with additional checks when `Alto` is unavailable; `Alto` with independent review when `Extra alto` is unavailable; `Extra alto` with independent review when `Máximo` is unavailable; and `Máximo` in the coordinator with governed decomposition when `Ultra` is unavailable.

An ordinary first owner-facing delivery in a new or resumed conversation uses these fields exactly once at the enclosing conversation level:

```text
Raciocínio recomendado: Leve | Médio | Alto | Extra alto | Máximo | Ultra
Motivo do raciocínio:
```

When that first delivery is itself a governed handoff, its single compact `Raciocínio recomendado` field satisfies the recommendation, rationale, and fallback requirement; do not add a separate `Motivo do raciocínio` field that would interrupt or duplicate the handoff contract. Uniqueness is evaluated per conversation-level contract. A separately delimited worker start message has its own recommendation and rationale for its destination worker and does not count as a duplicate in the enclosing owner-visible delivery or handoff.

## Governed handoff contract

Every governed handoff starts with this compact result summary in `pt-BR`:

```text
Solicitação: concluída | parcial | bloqueada — resultado concreto; pendências com nome e quantidade, ou 0; comportamento não testado; validação bloqueada
Próximo trabalho recomendado: uma ação concreta e priorizada; responsável; autoridade ou condição de entrada
Estado/critério: posição atual; próximo estado ou critério e condição de entrada, ou sem mudança
Sua ação agora: ação imediata exata para executar o roteamento ou habilitar o próximo trabalho
```

`Solicitação` distinguishes completed work, named pending work, untested behaviour, and blocked validation without implying evidence that does not exist. `Próximo trabalho recomendado` contains exactly one action directly related to the request. For a partial or blocked request, it is the first pending item or the objective unblocking condition. For a completed request, it identifies the directly related later deliverable that caused the handoff. Because a governed handoff has a routing trigger, both the next work and `Sua ação agora` are concrete; do not use absence values or import an unrelated backlog item.

Immediately after the result summary, every route uses this uninterrupted five-field sequence:

1. `Conversa recomendada: <ROUTE> — <TARGET> — <MOTIVO>`
2. `Título sugerido para copiar`
3. `Raciocínio recomendado: <NÍVEL> — <JUSTIFICATIVA>. Alternativa: <FALLBACK>`
4. `Paralelismo: <CLASSIFICAÇÃO> — <MOTIVO>`
5. `Texto para copiar e enviar`

Accepted values are:

- `<ROUTE>`: `CONTINUE_CURRENT`, `START_NEW`, or `RETURN_TO_EXISTING`.
- `<TARGET>`: `conversa atual`, `nova conversa`, or `conversa existente — <título-ou-label-confirmado>`.
- `<NÍVEL>`: `Leve`, `Médio`, `Alto`, `Extra alto`, `Máximo`, or `Ultra`.
- `<CLASSIFICAÇÃO>`: `SEQUENTIAL_ONLY`, `PARALLEL_OPTIONAL`, or `PARALLEL_RECOMMENDED`.

No field, plan, explanation, or extension may split the five-field sequence. For `START_NEW`, present the proposed non-canonical title as a separately copyable field:

````markdown
### Título sugerido para copiar:

```text
ShiftFlow — <STATE-OU-GATE> — <OBJETIVO-CURTO>
```
````

The fenced value is the next content block after the heading. Only Markdown's separating blank line may appear between them; no explanation, field, or other content may intervene.

For `CONTINUE_CURRENT` and `RETURN_TO_EXISTING`, use exactly this unfenced one-line value:

```markdown
### Título sugerido para copiar: nenhum título é necessário
```

When the owner must continue, start, return, respond, confirm, decide, authorise, or send something, present the complete `pt-BR` payload immediately below the level-three heading:

````markdown
### Texto para copiar e enviar:

```text
<MENSAGEM COMPLETA E PRONTA PARA COPIAR>
```
````

As with the title, the fenced payload is the next content block after the heading, with no intervening content other than Markdown's separating blank line.

The payload carries the destination, applicable authority, positive scope, negative scope, baseline, checks, expected result, and stop condition needed for safe continuity. It must not expand authority or scope, expose a secret, or rely on context omitted from the destination. The absence sentinel is valid only when the routing trigger, concrete next work, and concrete owner action remain present but a copy-ready message would add no value. In that case, use exactly this unfenced one-line value:

```markdown
### Texto para copiar e enviar: nenhum texto é necessário
```

The `###` marker is presentation only and remains outside copyable content. A real handoff contains no blank value or unresolved placeholder. `RETURN_TO_EXISTING` uses only a title or label supplied or confirmed by the owner. Templates may retain placeholders only when they are clearly identified as templates rather than executed handoffs.

For `SEQUENTIAL_ONLY`, the compact sequence ends after `Texto para copiar e enviar`; do not manufacture parallel-plan or lane-message fields. Only for `PARALLEL_OPTIONAL` or `PARALLEL_RECOMMENDED`, append `Plano paralelo` and `Mensagens para as frentes` after the complete five-field sequence and payload.

## Parallel-work classification

Conversation routing and parallel-work classification are independent. Every governed handoff uses exactly one `Paralelismo` value:

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

Every `Mensagens para as frentes` entry must be a complete instance of this template:

```text
Projeto:
Espaço de trabalho:
Frente de trabalho:
Identificação da conversa:
Raciocínio recomendado:
Motivo do raciocínio:
Conversa coordenadora confirmada:
Referência inicial:
Estado/critério/lote:
Autoridade existente:
Objetivo exclusivo:
Pré-condições:
Dependências congeladas:
Escritas exclusivas permitidas ou somente leitura:
Entradas somente leitura:
Arquivos e ações proibidos:
Verificações:
Resultado esperado:
Condições de parada:
Ordem de integração:
Formato da mensagem de retorno:
```

Every real worker start message must fill every field with a concrete value or `Nenhum - motivo` and must contain no unresolved placeholder. For internal delegation, `Conversa coordenadora confirmada` contains the environment-issued coordinating identifier and the task authority; it must not invent a user-visible title. Internal routing identifiers and canonical enums may remain unchanged, but every message presented or supplied to the owner must use the `pt-BR` labels and narrative above.

## Worker return-message template

The coordinating conversation must define a copy-ready return contract. The completed block is itself the exact return message to the coordinator; it must not contain or reproduce a nested `Exact return message` field. It is an internal integration payload and does not replace the governed user-visible handoff contract. Unless a stricter contract is required, use:

```text
Frente de trabalho:
Situação:
Referência inicial verificada:
Arquivos e artefatos inspecionados:
Arquivos e artefatos alterados:
Verificações e resultados:
Resultado entregue:
Limitações e riscos residuais:
Condição de parada acionada:
Recomendação de integração: CANDIDATE | NOT_CANDIDATE
```

Every real return payload must fill every field, contain no unresolved placeholder, and remain within the worker's baseline and lane authority. A worker return delivered directly in an owner-visible conversation follows the conditional continuation rule above: it includes only the fields justified by a concrete owner action, and a governed handoff uses the complete handoff contract. A return incorporated into another owner-facing delivery relies on the enclosing delivery to apply that rule without duplication.

## Phase handoff template

Use this extension only when recommending a state transition. Complete the governed handoff contract once, then append:

```text
ESTADO DE ORIGEM:
DESTINO RECOMENDADO:
NÃO CONCLUÍDO:
EVIDÊNCIAS:
ARQUIVOS ALTERADOS:
DECISÕES:
DEPENDÊNCIAS:
RISCOS E DÍVIDA TÉCNICA:
ITENS BLOQUEANTES:
ITENS NÃO BLOQUEANTES:
CRITÉRIOS EXECUTADOS:
RESULTADOS DOS CRITÉRIOS:
RESUMO ATUALIZADO:
REGISTRO DE TRANSIÇÃO ATUALIZADO:
RECOMENDAÇÃO:
DECISÃO DA MÁQUINA DE ESTADOS: PENDING
```

Completed handoffs belong in `docs/history/phase-delivery-history.md`, not in this template.

## Output contract

For implementation work, report the outcome first, then relevant files, validation, commit, risks, and remaining work. A completed file-changing task must report its local commit identifier; that commit does not imply push or another remote action. For analysis-only work, report findings and evidence without changing files. Use the compact governed handoff exactly once only when its routing trigger applies; ordinary owner-facing deliveries retain the conditional continuation rule and omit inapplicable fields rather than manufacturing a follow-up. Never claim success from a banner alone when runtime or external behaviour must be verified.

## Prompt-system changes

For a prompt-system change:

1. Validate the active manifest declared by `../Start-Here.md`.
2. Check all relative Markdown links.
3. Confirm state and version coherence.
4. Ensure historical evidence is not treated as current authority.
5. Update the changelog once.
6. Validate conversation-routing and parallel-work contracts when affected.
7. Use a major version for authority or structural changes.
