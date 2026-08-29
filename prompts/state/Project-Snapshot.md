# Project Snapshot

## Operational state

- Project: ShiftFlow
- Current state: `STATE-08 PRODUCTION_RELEASE`
- Prompt-system version: `6.0.0`
- Active prompt files: 17
- Snapshot date: `2026-08-28`

## Current architecture

- Modular monorepo with Next.js Web, the incumbent Express API, a .NET 10
  ASP.NET Core compatibility host, PostgreSQL, Prisma, Redis and an Nginx
  migration edge.
- Express modules use route, controller, validator, service, repository and DTO
  boundaries. ASP.NET Core separates Domain, Application, Infrastructure, API
  and focused test projects.
- Prisma remains the sole schema/migration owner. The migrated Audit read slice
  uses Npgsql against the existing schema.
- Authentication uses JWT access tokens and refresh-token rotation. ASP.NET
  Core validates the current HS256 contract as a temporary bridge and
  revalidates live principal, membership, revocation and RBAC state.
- RBAC and tenant/company scope are enforced by middleware and services.
- Redis backs ASP.NET Core cache/session foundations, dependency readiness and
  fail-closed global rate limiting for migrated business traffic.
- Nginx routes only `/api/audit` and `/openapi/` to ASP.NET Core; all remaining
  API traffic stays on Express and the route promotion is reversible.
- Structured request logging and separate liveness/readiness semantics are present.
- Canonical architecture: `../../docs/architecture.md`.

## Implemented operating capabilities

- The public Web product name is `Shift-Flow`. Compatibility-sensitive technical
  identifiers, namespaces, paths and runtime protection identities remain `ShiftFlow`.
- Authentication, users, teams, clients, shifts, activities, comments, notifications, reports, audit, RBAC, dashboard, and operational Kanban.
- The Web header exposes an accessible, responsive in-app notification centre
  backed by the recipient-scoped REST list and read contracts. It provides
  unread count, loading, empty and contained error states plus individual and
  bulk read controls. The implementation is locally complete at commit
  `8486c468cd0c42ec88209ed4fcf7f3a8ea25dd50`.
- Local development can open directly through a loopback-only configured demo
  identity while retaining current company and RBAC resolution, protected
  refresh/CSRF cookies and the normal session lifecycle. Production rejects the
  demo mode and continues to require authentication. The implementation is
  locally complete at commit `d3d690ff16fabad22cf849d737367574f61548d5`.
- Internal activity task boards and immutable operational history.
- Responsive web interface, i18n, light/dark themes, and TV-oriented views where implemented.
  New sessions start in dark mode with the en-GB locale, while valid stored theme
  and locale preferences continue to take precedence.
- Release, E2E, accessibility, load, security, source-comment, and quality scripts documented by the repository.
- A locked .NET 10 solution, Audit OpenAPI contract, non-root Linux images and a
  disposable PostgreSQL/Redis/Nginx strangler smoke are implemented. The real
  runtime gate has proved authenticated same-tenant retrieval, cross-tenant
  `404`, recursive secret sanitisation, live RBAC, credential-version
  invalidation/restoration, token revocation, Redis rate-limit persistence and
  fail-closed behaviour, dependency and routed-traffic recovery after Redis
  restart, persisted data-protection keys across ASP.NET Core container
  recreation, seven non-root runtime identities, complete disposable cleanup
  and exact preservation of the caller environment.
- The ASP.NET Core strangler foundation is locally complete at implementation
  commit `7a24d6265526d9e386ca639e36ad11c167db17a2`. No cloud deployment,
  production route cutover, Human Gate approval or lifecycle transition is
  inferred from that commit.
- One executable development entry point provides read-only diagnosis, locked
  setup, `NON_GATE` quick feedback, deterministic plans and a canonical
  runtime-credential-free core gate shared with GitHub Actions.
- The source is published at `DegsTerin/Shift-Flow`, and a free same-origin
  Render demonstration is live at
  `https://shift-flow-degsterin.onrender.com`. It runs the incumbent Next.js and
  Express applications with a new synthetic PostgreSQL dataset; this does not
  promote the ASP.NET Core/Redis/Nginx migration profile or create production
  approval.
- The whole-project corrective audit is locally complete at implementation
  commit `7e7fcdb5a0a75d1fbda3d9528d86f76f20f7a92e`. Tenant/global identity and RBAC
  mutation boundaries, transactional activity/task-board/dashboard evidence,
  remote-reference pagination, session-epoch UI guards, accessibility and
  runtime-test isolation have focused regression coverage.

## Current controls

- Prompt entrypoint: `../Start-Here.md`.
- State authority: `../core/Official-State-Machine.md`.
- Global constraints: `../core/Governance.md`.
- Owner communication and project-owned artefact language: `../core/Governance.md#language-policy`.
- Gates: `../core/Quality-Gates.md`.
- Conversation coordination and safe parallel work: `../core/Execution-Protocol.md`.
- Repository routing adapter: `../../AGENTS.md`.
- Historical governance-adoption sources: `../../docs/history/sources/`.
- Runtime truth for the ordinary Windows Express/Web services:
  `scripts/status.ps1` plus their HTTP health checks. The separate strangler
  profile uses Compose health plus the routed runtime smoke; neither source of
  truth governs the other runtime.
- Governance index: `../../docs/governance-index.md`.
- Executable plan: `../../PLANS.md`, which records active work and evidence but
  has no authority to change state or gates.
- Development contract: `../../docs/PROJECT-SETUP.md` and `../../eng/`.

## Active risks and external dependencies

- The public GitHub remote and free Render demonstration are configured, but
  production source, CI/CD and hosting authority remain unselected.
- Azure versus AWS and the OAuth 2.0/OpenID Connect provider are undecided.
  Provider-specific IaC, managed-service configuration, external identity
  linking and deployment are therefore not implemented or authorised.
- REST remains canonical. GraphQL is deferred until a measured
  dashboard/reporting read case justifies it.
- The disposable migration profile is sequential-only because its loopback
  ports and trusted-proxy subnet are fixed. Concurrent use on one Docker host
  requires collision-safe allocation and new proxy-trust evidence.
- Pinned container digests provide immutable inputs but the repository does not
  yet enforce OCI CVE scanning, SBOM generation or attestations. The transition
  Node.js images also carry shared production dependencies, and the Web image
  retains more workspace content than its final runtime needs.
- Only the primary worktree is present and no parallel branch/worktree workflow is authorised; simultaneous work is read-only and file writing remains sequential in the coordinating conversation.
- Language governance does not determine or change interface locale, translation catalogues, microcopy, or user-visible error language.
- Local E2E and load checks require a freshly provisioned disposable database,
  ephemeral runtime credentials, an available local Chrome executable and free
  isolated ports; they must not reuse developer data or services.
- Remote environments must receive locally approved migrations through their deployment pipeline.
- Physical-device and real-TV visual checks remain environment-dependent.
- Attachment storage, managed Redis/PostgreSQL, TLS/proxy trust, shared
  data-protection key storage and least-privilege database roles require
  production infrastructure choices. The legacy Express rate limiter remains
  process-local; only migrated business traffic has the current Redis-backed
  fail-closed limiter.
- The corrective audit's local gates and disposable PostgreSQL/browser envelope
  passed, but that evidence is not production approval, deployment evidence, a
  Human Gate decision or a lifecycle transition.
- The ASP.NET Core migration-profile evidence is likewise local and disposable;
  it does not approve a route cutover outside the profile, cloud deployment,
  OAuth/OIDC transition, GraphQL surface or lifecycle change.
- Direct demo access is a local usability mode, not a production identity
  architecture or deployment control. It accepts only loopback requests, depends
  on a separately provisioned local demo user and is rejected in production.
- Prisma `relationJoins` preview support is enabled for the filtered Activity
  graph so one PostgreSQL query replaces relation fan-out on a single
  transaction connection. It must remain regression-tested and be reassessed
  when Prisma changes or stabilises the feature.
- `deepmerge-ts` is pinned to patched version `8.0.0` through a focused npm
  override because Prisma 7.10 still pins the vulnerable 7.x line. Keep the
  override regression-tested and remove it when Prisma adopts a patched
  compatible dependency.

## Prompt-system consolidation evidence

- The former 75-file active corpus was consolidated into 17 active files.
- Version 3.0.0 adds repository routing and safe-concurrency governance without adding an 18th active prompt.
- Version 4.0.0 centralises language governance in `Governance.md`, requires `pt-BR` owner delivery with a next step and copy-ready message, and archives adoption sources without adding an 18th active prompt.
- Version 4.1.0 adds advisory reasoning recommendations for each new or resumed conversation, governed handoff, and worker start message while preserving the existing authority, isolation, and parallel-work rules.
- Version 5.0.0 replaces unconditional continuation fields with action-based delivery: ordinary responses omit inapplicable fields, while governed handoffs preserve their complete contract.
- Version 5.0.1 clarifies that every authorised file-changing activity ends with an automatic scoped local commit after validation, without a second request or implied remote action.
- Version 5.1.0 adopts an executable-plan and development-loop capability with
  `Doctor`, `Setup`, `Quick`, `Full` and `PlanOnly`, while preserving the
  17-file corpus, `STATE-08` and separate runtime/lifecycle evidence.
- Version 6.0.0 replaces only the governed hand-off's extended routing contract
  with the compact RAG-Challenge structure: a result summary followed by the
  uninterrupted conversation, copy-ready title, reasoning, parallelism and
  copy-ready payload sequence. Ordinary-delivery triggers, worker controls,
  lifecycle authority and the 17-file corpus remain unchanged.
- Full pre-consolidation audit, delivery, state, snapshot, and version material is preserved under `../../docs/history/`.
- No project state transition resulted from the documentation reorganisation.
- The 17-file manifest and migration map are recorded in `../Start-Here.md`, `Prompt-System-Change-Log.md`, and `../../docs/governance-index.md`.

## Update rule

Keep this snapshot limited to current facts, risks, blockers, and evidence pointers. Put chronological narratives in the changelog, transition log, or `docs/history/`.
