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
- API responses include `x-request-id` for incident correlation.
- API requests are protected by configurable rate limiting.
- Dependency audit runs in release gates.
- Secrets must not be committed; use `.env.example` for variable names only.

## Required Review Areas

- Authentication and refresh-token behavior.
- RBAC and tenant scope checks.
- Database migrations and data exposure.
- Logging of request bodies, credentials, tokens, or personal data.
- Public API error messages.
