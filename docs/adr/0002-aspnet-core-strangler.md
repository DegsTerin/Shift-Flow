# ADR 0002: ASP.NET Core Strangler Migration

## Status

Accepted for incremental implementation. Cloud provider, identity provider and
production cutover remain undecided.

## Context

ShiftFlow currently has a Next.js frontend, an Express modular API, a mature
PostgreSQL model owned by Prisma and extensive Node.js validation. The owner has
selected C# with ASP.NET Core, Redis, OAuth 2.0/OpenID Connect, JWT, Docker,
Linux, Nginx and either Azure or AWS as the target platform combination.

A direct replacement would couple an HTTP-contract change, persistence rewrite,
identity migration and deployment redesign into one irreversible release. It
would also create a period in which Prisma and a .NET ORM could both claim
migration ownership over the same schema.

## Decision

Adopt a route-level strangler migration inside the existing modular monorepo:

- keep `apps/web` as the Next.js/React/TypeScript frontend;
- introduce a .NET 10 LTS modular host under `apps/api-dotnet`;
- keep Express as the fallback backend until each complete route group reaches
  contract, security and runtime parity;
- keep Prisma as the only schema, migration and seed owner during coexistence;
- use Npgsql against the existing physical PostgreSQL names and types;
- use Redis for distributed cache and the future server-side session boundary,
  while PostgreSQL remains authoritative for tenant, RBAC, revocation and audit
  evidence;
- keep REST as the canonical command and CRUD API;
- add GraphQL only after a measured composite-read requirement demonstrates
  value and has explicit query-cost and field-authorisation controls;
- place Nginx in front of Web, Express and ASP.NET Core so a route can be moved
  or rolled back without a browser contract change;
- migrate the read-only Audit module first, after health, readiness,
  authentication and authorisation compatibility are proven.

The first host temporarily validates the existing HS256 access token. It must
revalidate token revocation, credential version, active user/company membership
and current RBAC from PostgreSQL. Token permission claims are not authority.
This bridge is removed after the separately governed OAuth 2.0/OIDC migration.

For browser identity, the target recommendation is an OIDC Back End for
Frontend using Authorization Code with PKCE and a host-only, HttpOnly, Secure
session cookie backed by Redis. The final IdP, external identity schema,
provisioning policy and break-glass path require explicit decisions before that
phase begins.

Provider-specific infrastructure remains deferred. The portable runtime must
work on Linux containers behind Nginx before Azure or AWS services are selected.

## Consequences

- The migration is reversible per route and does not require dual writes.
- Node.js and .NET gates coexist until Express and Prisma have no remaining
  runtime, migration, seed or test responsibility.
- Public envelopes, status codes, headers, pagination and security behaviour
  need executable parity tests before each route promotion.
- PostgreSQL-specific lock and isolation semantics must be mapped explicitly;
  generic ORM behaviour is not presumed equivalent.
- Redis failure must fail closed for security state and readiness. Disposable
  cache use may degrade only through an explicit, load-bounded fallback.
- OAuth/OIDC requires a forward-only identity model keyed by issuer and subject;
  linking by e-mail alone is prohibited.
- Azure/AWS, IdP, region, recovery objectives and production deployment remain
  owner decisions rather than hidden implementation defaults.
