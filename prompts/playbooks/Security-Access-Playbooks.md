# Security and Access Playbooks

This file combines general security, authentication/session, and password/credential workflows. Security analysis does not authorise remediation unless the user requests correction or execution.

## General security audit

Inspect:

- Authentication, authorisation, RBAC, tenant/company isolation, IDOR, and privilege escalation.
- Input validation, injection, XSS, CSRF where applicable, SSRF, unsafe redirects, uploads, and output encoding.
- Secrets, logs, errors, environment templates, generated artefacts, and repository history.
- JWT/session lifecycle, revocation, refresh rotation, lockout, rate limiting, CORS, headers, and production startup requirements.
- Dependency/supply-chain risk, CI/CD permissions, Docker/runtime exposure, database access, backups, and observability.

Use OWASP-aligned reasoning and distinguish verified vulnerabilities from hypotheses.

## Authentication and session audit

Validate:

- Login input, generic failure messages, active-user/company checks, throttling, and audit without plaintext credentials.
- Access-token secret requirements, expiry, claims, company context, and signature validation.
- Refresh-token rotation, reuse handling, revocation, company scope, secure persistence, and logout.
- Frontend reload/session restoration, expiry, refresh failure, logout cleanup, protected navigation, and safe storage.
- Backend enforcement of RBAC and tenant scope regardless of visual guards.
- CORS, cookies if used, proxies, HTTPS assumptions, and production configuration.

## Password and credential remediation

- Never commit real passwords, tokens, private keys, secret-bearing URLs, or usable fallback credentials.
- Passwords are hashed with an approved adaptive algorithm and never logged.
- Runtime/test credentials come from the local environment, per-run ephemeral
  CI generation, or CI secrets when a persistent external test identity is
  unavoidable. Disposable CI prefers generated per-run values.
- Seeds remain deterministic without embedding end-user credentials in versioned files.
- Documentation and historical evidence use redacted placeholders.
- Rotation is required when exposure may have occurred; deletion from the worktree alone is not sufficient.
- Secret scans cover the worktree and, when relevant, Git history and generated artefacts.

Password policy must follow the current application contract. Where the repository policy applies, require at least 12 characters with lowercase, uppercase, numeric, and symbol characters.

## Finding format

- Title and category.
- Severity and confidence.
- Affected resource, file/line, endpoint, or configuration.
- Evidence and realistic exploitation/failure scenario.
- Technical and business impact.
- Recommended correction and validation.
- Whether secret rotation or external coordination is required.

## Required validation for remediation

Select as applicable:

- Targeted auth/RBAC/tenant tests.
- Unit/integration/E2E tests.
- Dependency audit and override audit.
- Secret scan of worktree/history.
- Prisma validation/migration review.
- Lint, typecheck, build, and production-configuration checks.
- Direct negative tests for cross-company, inactive-role, revoked-session, and forbidden-resource access.

Do not disclose exploit details or secrets beyond what is necessary to fix and verify the issue.
