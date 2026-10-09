# DEPLOY-001 - Prepare free Render and Neon staging

## Objective

Prepare a free Docker web service and controlled initialization of the existing
Neon staging database without modifying local development configuration.

## Acceptance criteria

- Declare one Render Free Docker service in Ohio with runtime secrets and readiness.
- Keep initial auto-deploy disabled until the first live deployment is verified.
- Provide a manual main-only workflow scoped to the GitHub staging environment.
- Validate the direct Neon hostname, staging database and SSL before migrations.
- Optionally bootstrap user, hashed credential, company and ADMIN atomically.
- Preserve existing passwords, names and permissions on matching replay.
- Refuse unrelated records and revoked/demoted membership; serialize setup retries.
- Test rollback, concurrent setup and successful real sign-in on an isolated database.
- Document secrets, migration/deployment ordering, limitations and the later CI gate.

## Limits

This PR prepares code and configuration. It does not deploy Render, migrate Neon
or create a real administrator. Free-plan quotas/cold starts apply. Production
account management, password reset, backups/restore and a fully coordinated release
pipeline remain separate work. Manual staging migrations require review and
compatibility with the currently running app.

## Verification

- TypeScript and ESLint pass; 33 unit tests pass.
- Render Blueprint validates against the official JSON schema; workflow YAML parses.
- Six staging integration scenarios pass against an isolated PostgreSQL database,
  including sign-in, replay, revoked membership, unrelated data, concurrency and rollback.
- Eight representative Playwright container flows pass.
- Docker production build, ten committed migrations, migration replay, database-outage
  readiness, persistent-volume recovery and read-only runtime restart pass.
- Live Render deployment and Neon setup workflow execution are pending after merge.
