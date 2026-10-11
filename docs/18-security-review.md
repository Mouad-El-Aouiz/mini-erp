# Local Security Review

Review date: 2026-10-11. Scope: repository configuration, application access controls, authentication, dependency advisories and isolated local regression tests. This is not a penetration test or a review of live cloud configuration.

## Verified controls

- Public registration is disabled. Password length is enforced server-side at 12 to 128 characters.
- Tenant access requires an authenticated session and an active membership. Administrative mutations enforce ADMIN permissions and recheck membership inside transactions.
- Business reads are tenant-scoped; composite database relationships constrain cross-tenant references.
- Business mutation handlers check the canonical request origin and validate input with strict schemas.
- Password credentials are hashed; API member projections omit credential hashes and session tokens.
- Sensitive business responses use private, no-store caching headers.
- Membership administration serializes changes and prevents removal of the last active administrator.
- SQL inspected in application data modules uses parameterized Prisma queries.
- Local environment files and Vercel configuration are excluded from Git; environment files are also excluded from Docker build and Vercel upload contexts.

## Dependency results

`npm audit --omit=dev --json` reported zero known production dependency vulnerabilities. The full audit reported five high-severity package entries from one underlying advisory: GHSA-vfj7-8cjw-p6xm, affecting braces through the ESLint dependency chain. The registry's latest braces version was 3.0.3; the advisory lists no patched version.

The reported impact is stack exhaustion when processing deeply nested brace patterns. Treat untrusted tooling configuration and patterns as potentially hostile. Do not apply the audit's suggested downgrade to eslint-config-next 14.x to a Next.js 16 application. Recheck the advisory when a compatible upstream fix is available.

Reference: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

## Remaining limitations

- Better Auth's default production rate limiter uses process memory in this configuration. Counters are not shared across serverless instances; this is not a distributed brute-force protection guarantee.
- The installed password-change implementation does not wrap password update and session replacement in one transaction. An uncertain failure may occur after the password hash has changed. See docs/16-account-password.md.
- Forgotten-password recovery, MFA and mandatory initial-password changes are not implemented.
- Secret checks inspected tracked sensitive filenames and selected token/private-key patterns in the current tree, plus selected sensitive filenames across local history. They are not a comprehensive historical secret scan.
- Live Vercel/Neon settings, penetration testing and concurrent load testing are outside this local review.

## Validation

- TypeScript checks, ESLint and production build passed.
- All 36 unit tests passed.
- All 60 selected browser/API regression tests passed (4.3 minutes): authentication, password changes, members, customers, products and inventory.
- The complete 136-test E2E suite was not rerun in this review.
- Tests used only mini_erp_test on localhost port 5433; staging and development data were not test fixtures.
- Targeted secret checks found no matches; only .env.example was tracked among the inspected sensitive filename patterns.
- git diff --check passed.
