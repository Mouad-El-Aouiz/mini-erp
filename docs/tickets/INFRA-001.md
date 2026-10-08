# INFRA-001 - Portable application container runtime

## Objective

Run the compiled mini-ERP in an isolated Linux container with migration sequencing,
runtime-only configuration and reproducible automated verification.

## Acceptance criteria

- Pin the Node base digest and install packages from the committed lock file.
- Build standalone output without private environment files or database access.
- Separate application runtime from migration tooling; run both as non-root.
- Preserve the database-only local workflow and its persistent development volume.
- Require runtime authentication/database configuration and gate startup on migrations.
- Return coarse readiness with no credentials or internal errors.
- Verify browser flows in a separate disposable Compose project.
- Exercise migration replay, database outage/recovery, data persistence and restart.
- Add CI container verification without publishing images or provisioning hosting.

## Implementation

Add multi-stage Dockerfile, build-context exclusions, optional app Compose overlay,
dedicated container test project, runtime guards, database readiness endpoint,
external-server Playwright configuration and lifecycle verification script.
Generate standalone output only when `NEXT_BUILD_STANDALONE=1` to preserve native
Windows builds. Document environment boundaries and operational commands.

## Verification

Run TypeScript, ESLint and unit checks, compile the production container, run the
full existing browser/integration suite against it, and validate image contents,
migration sequencing/replay and container/database lifecycle behavior.

### Recorded results (2026-10-08)

- TypeScript, ESLint and 31 unit tests passed.
- Native Windows production build and Linux standalone container build passed.
- All 10 committed migrations applied to an empty disposable database; replay
  reported no pending migrations.
- Complete Chromium suite against the container: 112 passed (7.3 minutes).
- Runtime inspection confirmed non-root execution, no embedded environment files,
  no baked-in authentication/database environment values, and no Prisma CLI or
  TypeScript compiler in the application image.
- Final CI command passed locally: eight representative browser scenarios (35.7 seconds),
  migration replay and all lifecycle checks.
- Inspection confirmed read-only root filesystems, dropped Linux capabilities and
  no-new-privileges for both app and migration containers.
- Missing settings, malformed database/auth URLs, short secrets and build-placeholder
  secrets prevented startup.
- Database outage returned generic uncached 503; readiness recovered after database
  container replacement and the named-volume marker remained present.
- The app restarted successfully with its read-only root filesystem.
- Dedicated test containers and volume were removed; development data was not targeted.
- Production dependency audit reported zero vulnerabilities. The existing documented
  development-only braces finding remains; no dependency versions were changed.
- GitHub Actions still needs to run on the pull request before merge.

## Limits

Local container runtime only. Registry publishing, hosting, HTTPS, production
account onboarding, backups, deployment coordination and observability remain
future work. Image rollback does not roll back SQL migrations.
