# SETUP-002 — Local Demo Company

## Objective

Provision a repeatable company workspace for an existing local development credential user.

## Behavior

- Require local PostgreSQL `mini_erp` and reject production mode.
- Require an existing user selected by DEV_USER_EMAIL with a credential account.
- Use a stable default UUID and optional company configuration.
- Create the company and ADMIN membership atomically.
- Preserve existing company names, roles and active status on repeated runs.
- Reject existing companies without the configured user's membership.
- Keep credentials and database connection strings out of console output.
- No schema migration or application dependency change is needed.

## Validation

Verified on 2026-10-08 with Node.js 22.23.2:

- TypeScript, ESLint and production build passed.
- All 16 Playwright checks passed (35.1 seconds): 11 existing authentication/workspace checks and five new provisioning integration checks.
- Invalid configuration, production mode, remote hosts and the wrong database name were rejected.
- Missing users and users without credential accounts were rejected without company creation.
- Repeated runs preserved membership identity, role, active status and company name.
- An existing unrelated company did not receive a new membership.
- Simulated membership insertion failure rolled back company creation.
- Provisioning tests created a dedicated `mini_erp` database inside the isolated test PostgreSQL service, migrated it and dropped only the database they created.
- Browser fixtures were removed, and the disposable test service and volumes were removed.
- The local demo company was provisioned for the configured development user; a second execution made no changes.
- `git diff --check` passed.

GitHub Actions must pass on the pull request before merge.

## Limitations

- This is local provisioning, not production onboarding or membership administration.
- Conflicting concurrent setup runs can fail and may be retried after completion.
- A company only appears in the selector if the membership remains active.
