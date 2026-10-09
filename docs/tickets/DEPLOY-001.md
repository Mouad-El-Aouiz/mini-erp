# DEPLOY-001 - Prepare Neon staging database setup

## Objective

Provide controlled initialization of the Neon staging database while
keeping local development and test configuration independent.

## Acceptance Criteria

- Provide a manual main-only workflow scoped to the staging environment.
- Validate the direct Neon hostname, database name and SSL connection.
- Apply committed Prisma migrations.
- Optionally create the administrator, credentials, company and membership atomically.
- Preserve existing credentials and permissions on matching retries.
- Reject unrelated records and revoked or demoted memberships.
- Verify concurrency, rollback and successful sign-in.
- Document private configuration and migration ordering.

## Validation

TypeScript, ESLint, 33 unit tests, six staging integration tests and
eight representative container browser tests passed during implementation.
These are historical implementation results; documentation cleanup does
not modify the tested runtime, workflow or provisioning scripts.

## Limits

Application hosting is configured separately.
Manual migrations require SQL review and compatibility with the running app.
Production account management and backup restoration remain separate work.
