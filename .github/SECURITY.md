# Security Policy

## Supported Branch

Security fixes target `main` unless a maintained release branch is explicitly defined.

## Reporting

Do not open public issues for suspected vulnerabilities. Report privately to the project maintainers with:

- A concise description of the issue.
- Reproduction steps or affected routes.
- Expected impact.
- Suggested mitigation, if known.

## Security Baseline

- Production requires explicit `CORS_ORIGIN`.
- Production requires JWT secrets.
- Production browser-origin mutating requests must pass origin or referer validation.
- Cookie-backed refresh/logout requests require CSRF double-submit validation.
- Cookie-backed refresh/logout requests do not accept refresh tokens from request bodies.
- Access-token logout revocation is persisted until token expiry.
- Reused refresh tokens retained inside the bounded tombstone window revoke active successors only
  in the affected user/company/session-kind/rotation-family scope.
- Failed login responses use fixed secret-HMAC delay buckets without persistent account lockout.
- API responses include `x-request-id` for incident correlation.
- Caller request identifiers are accepted only as 1–120 safe ASCII characters; invalid values are
  replaced with an internal UUID before reflection or persistence.
- API requests are protected by configurable rate limiting and bounded password-verification lanes.
- Dependency audit runs in release gates.
- Secret scanning runs in release gates.
- Secrets must not be committed; use `.env.example` for variable names only.

## Production Controls

- Enforce branch protection on `main` with passing release gates and CODEOWNERS review.
- Require MFA for repository administrators and production operators.
- Replace in-memory API rate limiting with a shared store, such as Redis, before horizontal API scaling.
- Keep GitHub Actions pinned by commit SHA and rotate those pins through reviewed dependency updates.
- Keep production database endpoints private and credentials in managed secrets.

## Authentication Abuse Controls

Password login uses a single global FIFO budget of four concurrent bcrypt
comparisons. An exact e-mail identity can have only one comparison active or
queued, with at most 128 admitted identities and an independently enforced
128-entry queue ceiling. Identity admission is acquired before the relational
credential lookup. That lookup selects only credential-version fields;
memberships and role assignments are hydrated only after a valid password.
Identity admission is released as soon as the comparison settles; session
persistence and failed-response delay do not retain it. Saturation returns
`AUTHENTICATION_BUSY` (HTTP 429)
without durable failure-state mutation. The global per-IP HTTP limiter remains a high
emergency ceiling; the lower 10-request direct-access limiter applies only to
demo and portfolio endpoints, so unrelated failures behind a NAT do not create
a 15-minute password lockout.

Password-login transport cancellation is propagated from an aborted request or
prematurely closed response. Queued bcrypt work is removed before execution and
the production failure-response timer is cleared. A credential lookup that
already started remains within the fixed identity admission bound until it
settles; no bcrypt starts afterwards when the request was cancelled. Other
already-started database work, an active bcrypt comparison and an atomic session
transaction are deliberately allowed to settle before their work is released or
observed. An invalid comparison that settles after disconnect is counted once
before cancellation, but no response-delay timer is retained for the closed
transport. No credential or cookie is written to a closed response; a
post-commit disconnect can leave one inaccessible, bounded refresh row until
normal expiry or session eviction. This process-local cancellation hygiene
bounds queued and expensive work without pretending to cancel a database
operation already sent to PostgreSQL; it is not upstream bot mitigation.

All completed pre-session credential failures enter the same 256 fixed,
secret-HMAC response-delay buckets, 1,000–30,000 ms curve and window expiry. No
login failure reads or writes principal-specific PostgreSQL state, so account
existence does not select a distinct state boundary and attacker-controlled
identities create no database or append-only audit rows. Failures emit one
fixed, windowed aggregate telemetry stream without an existence classification.
For a live transport, this delay shapes the public failure response; a transport
cancelled after comparison retains the accounting but skips its now-unobservable
timer. It is deliberately not a pre-verification account lock and therefore
cannot deny a later correct credential while an earlier response is still
delayed.
Successful password login updates mutable `lastSuccessAt`, hashed source-IP and
user-agent state for the exact principal, plus one fixed, windowed aggregate
telemetry stream and a canonical append-only `LOGIN_SUCCESS` audit event.
Password, demo and portfolio sessions also retain the 20 most
recent attributable rows per user/company/session kind in the dedicated
`authentication_session_observations` current-state table. The session kind,
request identifier, source IP and user-agent are preserved in each observation.
The mutable password state, canonical password-login audit, bounded observation
and refresh token commit atomically; an audit or observation failure rolls the
session back before any credential is returned. Pruning is limited to excess
rows in that dedicated table.
`AuditLog` remains canonical append-only history and authentication session
retention never updates or deletes it. The bounded table is not a substitute for
durable security audit or compliance retention; operators must configure and
verify downstream retention before claiming longer-term granular session history.
Historical demo and portfolio audit rows remain untouched. Prospectively, those
public session-open flows use bounded observations and the same aggregate success telemetry rather
than canonical compliance audit so public traffic cannot amplify append-only
storage. They must not be represented as complete audit history.

Refresh-token creation, rotation and compromise revocation serialise on the user
row. Session kind and an unguessable rotation-family identifier are persisted for
new tokens. Reuse or a logout race revokes only active successors in that exact
user/company/session-kind/family scope, so one public portfolio visitor cannot
revoke another visitor or a password session. Password and demo scopes retain at
most five active tokens per user/company/session kind; expired rows and the oldest
active rows beyond that cap are removed in the same transaction before a successor
is created. Consumed-token tombstones remain until their token expiry so replay can
still revoke later successors. Rotation inside 60 seconds is idempotent and returns
the current refresh token without creating a row. Physical tombstone growth is
therefore bounded by refresh-token TTL and rotation rate, not by a fixed row count.
A displaced old password or demo session is invalid and must authenticate again.

The migration backfills existing refresh rows as `PASSWORD`, preserving ordinary
password and demo sessions. A legacy portfolio token still carries its existing
`portfolio.` prefix; that prefix conflicts with the backfilled persisted class,
so refresh rejects and conditionally revokes only that exact token. Logout also
limits any class/prefix mismatch to exact-token revocation. This deliberately
requires legacy portfolio sessions to reopen while preventing them from evicting
or revoking password sessions.
Each pre-migration row receives its own family identifier because prior rows did
not record lineage. Replay remains rejected, but family-wide successor revocation
is guaranteed only for tokens created after this migration. This bounded residual
lasts until the legacy refresh TTL expires and avoids guessing a family that could
cross session classes.

Portfolio is a separate public-session pool: it admits up to 1,000 active
families per configured user/company, never evicts a live visitor to admit a new
one, and returns HTTP 429 with the next-expiry retry interval when full. Portfolio
refresh credentials expire after one hour and are reused idempotently rather than
rotated; logout deletes only that visitor's row. Expired rows are pruned on the
next admission. This keeps the database pool bounded while allowing far more than
five simultaneous visitors. Distributed traffic can still exhaust the pool for
at most its one-hour lifetime, so upstream bot controls remain necessary.

Each admitted credential failure observes a fixed one-second minimum duration
measured from request processing. After a failed comparison, its bounded HMAC
bucket records the failure and may add the fixed escalating backoff; this
deliberately favours throttling and does not claim that database time is absorbed
by that backoff. Every admitted credential class uses the same bucket curve, and
no identity, queue or bcrypt slot remains held while a response is delayed.
Correct credentials are compared without a persisted account lock; only a
simultaneous comparison for that exact identity or global capacity exhaustion
can receive a transient HTTP 429 and must retry.

Rate-limit state has an isolated fixed 10,000-bucket cap per limiter and
periodic TTL cleanup. The two current stores therefore permit at most 20,000
buckets in this process. Because the global middleware runs first, demo and
portfolio traffic consumes both a global bucket and a direct-access bucket.
Separate stores prevent direct-access-specific state from occupying the global
store, but distributed direct-access traffic can still fill both bounded stores
and temporarily shed unseen callers. Once either store is full, unseen keys are
shed with HTTP 429 rather than evicting live keys and silently reopening their
budgets.

These lanes are process-local. Production therefore rejects
`API_INSTANCE_COUNT` greater than one until a reviewed shared coordinator exists.
Without MFA, a user-facing challenge or independently verified upstream bot
mitigation, application controls cannot eliminate distributed credential
stuffing or volumetric denial of service. Fixed decoy-bucket collisions can also
change failure-response delay for unrelated identities, and process restart
resets those delay buckets. Delayed HTTP responses still rely on upstream
connection and request controls for volumetric bounds. Upstream monitoring and a
reviewed challenge/MFA design remain necessary before claiming general bot
resistance.

New passwords are limited to 72 UTF-8 bytes in API create/update writers, seed
preflights and administration UI controls so bcrypt cannot silently truncate
them. New API and seed credentials use bcrypt cost 12. Login retains the
existing 160-character transport ceiling and passes legacy credentials through
verification unchanged; it does not silently rehash or rewrite them. Existing
non-cost-12 hashes therefore require an offline inventory and reviewed migration
before operators can claim an identical bcrypt work factor for every historical
account.

## Browser Company Context

The workspace displays the active company and its timezone. Company switching
requires password authentication and a destination projected by the current
session; it does not grant membership or authority through a request header.
The server revalidates the principal, membership and current permissions.

The client reserves a switch before dispatch, refuses it while a protected
mutation is pending and blocks new mutations until it settles. Participating
cookie operations use the same same-origin Web Lock when available; the
fallback queue coordinates only one JavaScript instance. Response installation
is bound to the originating session generation and the expected user/company.
This is not cross-tab interface synchronisation or cancellation of a write
already accepted by the server.

A recognised incorrect-password response preserves a still-current originating local
session. After an ambiguous dispatched login, such as transport failure or an
invalid success response, the affected local session fails closed. A same-tab
`sessionStorage` marker containing only `1` requires explicit reauthentication
after reload and prevents automatic refresh or public-session restoration.
It stores no password, token, identity or company selection. Failure to establish
or verify the marker before login prevents dispatch; clearing it can also fail
after dispatch and does not prove that the request was never sent. This marker
does not delete server cookies, roll back
an issued session or coordinate another tab; those outcomes must never be
inferred from local recovery.

## Proxy Trust

`TRUST_PROXY` accepts only `false` or a comma-separated allowlist of literal
proxy IP addresses. Forwarded client IP, host and protocol values are ignored
unless the immediate socket peer is trusted. Production Render services must set
this decision explicitly. Keep it `false` unless the real ingress peer addresses
have been independently verified; this intentionally loses per-client
attribution rather than trusting spoofable direct headers. Behind a shared
proxy, that fail-closed choice also collapses the high emergency IP budget onto
the ingress peer and can reduce availability under volume until trusted peer
addresses are configured.

## Secret and OCI Evidence Gates

The secret gate scans exact staged-index blobs, any differing worktree or
untracked bytes, and every blob reachable from Git refs without depending on a
path or object name. ASCII signatures remain detectable in NUL-bearing content.
Reads are size bounded, worktree bytes are verified from the same open file
descriptor, and Git blobs are processed in cumulative-size batches. Historical
exceptions come only from the exact indexed
`eng/secret-history-allowlist.json` blob. Version 2 entries identify an exact
secret-detector finding by its opaque identifier; they cannot suppress
oversized blobs, incomplete coverage, stale entries or other structural
failures. Public findings contain only detector, scope, origin, line and a
stable opaque identifier. They never contain a raw path, Git object identifier,
detected value or source line, and placeholders are a small exact literal set
rather than a prefix exemption.

OCI evidence is correlated with the workflow checkout: `git rev-parse HEAD`
must equal `GITHUB_SHA`, the local image tag embeds that exact commit and
validation requires the same `--source-commit`. These are unsigned,
self-reported correlation inputs, not cryptographic provenance or an external
attestation. Registry evidence remains digest pinned and cannot carry
build-only commit metadata. The Trivy reports currently lack authenticated
vulnerability-database freshness metadata; no database-age claim is made until
verifiable evidence is available.

## Required Review Areas

- Authentication and refresh-token behavior.
- RBAC and tenant scope checks.
- Database migrations and data exposure.
- Logging of request bodies, credentials, tokens, or personal data.
- Public API error messages.
