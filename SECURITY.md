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
- API responses include `x-request-id` for incident correlation.
- API requests are protected by configurable rate limiting.
- Dependency audit runs in release gates.
- Secret scanning runs in release gates.
- Secrets must not be committed; use `.env.example` for variable names only.

## Production Controls

- Enforce branch protection on `main` with passing release gates and CODEOWNERS review.
- Require MFA for repository administrators and production operators.
- Replace in-memory API rate limiting with a shared store, such as Redis, before horizontal API scaling.
- Keep GitHub Actions pinned by commit SHA and rotate those pins through reviewed dependency updates.
- Keep production database endpoints private and credentials in managed secrets.

## Required Review Areas

- Authentication and refresh-token behavior.
- RBAC and tenant scope checks.
- Database migrations and data exposure.
- Logging of request bodies, credentials, tokens, or personal data.
- Public API error messages.
