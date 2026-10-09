# Render and Neon staging

## Scope and architecture

A single Render Free Docker web service runs the compiled Next.js app. Neon Free
hosts the separate `mini_erp_staging` database in Ohio (`aws-us-east-2`), PostgreSQL
18. The Render Blueprint selects Ohio too. The existing local PostgreSQL, test
services and guarded development provisioning scripts remain unchanged.

`render.yaml` is a declarative Blueprint, not a Docker Compose deployment. It
uses the final runtime stage of the existing Dockerfile, binds `0.0.0.0` using
`PORT=10000`, and checks `/api/health`. Render manages inbound HTTPS. Database and
authentication values are entered privately; no credentials are committed.

Auto-deploy is initially **off** so initialization can be completed before the
first deployment. This change prepares infrastructure configuration only; it
does not create a Render service, apply Neon migrations or provision a real user.

## Initialize the staging database after merge

In GitHub repository Settings -> Environments, create `staging`. If available
for your account/repository, restrict deployment branches to `main` and add a
reviewer. The workflow itself also refuses any ref other than `main`.

Add these **environment secrets**:

| Name | Value |
| --- | --- |
| `STAGING_DATABASE_URL` | Direct Neon connection to `mini_erp_staging`, with SSL; not the `-pooler` hostname |
| `STAGING_ADMIN_PASSWORD` | Unique staging password, 12-128 characters; required only for bootstrap |

Add these **environment variables**:

| Name | Value |
| --- | --- |
| `STAGING_DATABASE_HOST` | Exact direct hostname from the selected Neon endpoint, without scheme/path/port |
| `STAGING_ADMIN_EMAIL` | Email used for the initial staging login |
| `STAGING_ADMIN_NAME` | Initial administrator display name |
| `STAGING_TENANT_ID` | One generated UUID, kept stable across retries |
| `STAGING_TENANT_NAME` | Initial staging company name |

Retrieve the connection from the existing Neon project's connection dialog and
select database `mini_erp_staging`. Keep the URL and password private. Never
substitute your local database URL or a different Neon project's credentials.
Generate a company UUID locally in Bash if needed:

```bash
node -e 'console.log(require("node:crypto").randomUUID())'
```

In GitHub Actions -> **Staging database setup** -> Run workflow, choose `main`.
Select `bootstrap_admin` for the initial setup. The workflow installs locked
dependencies, validates the confirmed SSL/direct Neon destination, applies the
committed Prisma migrations, generates the client, and optionally runs bootstrap.
It is manual, never runs for a pull request, and serializes staging setup runs.
There is no API that exposes this operation to anonymous visitors.

The bootstrap atomically creates user, hashed credential, company and active
ADMIN membership. The first run requires no existing users or companies. A
matching active administrator can be replayed without changing passwords, names
or permissions. Existing unrelated records, incomplete setup or revoked/demoted
memberships are refused. It is an initial setup utility, not user management or
password recovery. Do not run it while other administrators are writing to an
initially empty database; all writers are not coordinated by its advisory lock.

For later schema updates, leave `bootstrap_admin` unselected. Review SQL and
backward compatibility first. `migrate deploy` applies existing migration files;
never use `migrate dev` or `db push` on staging. No automatic destructive reset
or SQL rollback is provided. Back up before a migration that risks existing data.

## Create the first Render service

After the workflow succeeds, connect Render to the GitHub repository and create
a Blueprint from the merged `render.yaml`. Review the preview: one **Free** web
service, no Render database, disks, workers or paid resources.

Provide the three private values requested by `sync: false`:

- `DATABASE_URL`: the staging database connection with SSL; use Neon's pooled
  connection for app traffic when enabled. The workflow uses the direct connection.
- `BETTER_AUTH_SECRET`: a new high-entropy random secret of at least 32 characters,
  distinct from local/test secrets.
- `BETTER_AUTH_URL`: the exact assigned Render HTTPS origin, no path or query.

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Store the generated secret only in the Render configuration. If the service URL
is not known during creation, update `BETTER_AUTH_URL` to the actual assigned
origin before accepting the first deployment as usable. Do not assume the desired
service name guarantees a particular `onrender.com` hostname. Keep the Docker
command unset so the image's validated startup command is used.

Render may start an initial build/deploy during creation even with auto-deploy off.
Check the assigned origin and required secrets before retrying that initial deploy.
Validate readiness, login, dashboard and a disposable company-scoped business
flow over HTTPS. Inspect logs without exporting environment values or credentials.

## CI and staged delivery

GitHub Actions keeps Application checks and Container checks. Tests run against
disposable local/CI databases, never Neon staging. The new provisioning scenarios
run through Node/tsx in the Container checks job, before the Playwright browser flows.

After the first deployment is validated, change the Blueprint's `autoDeployTrigger`
to `checksPass` in a reviewed PR and sync it in Render. Render then waits for CI on
the actual `main` commit before deploying. Automatic app deployment does not apply
migrations: use the setup workflow before deploying schema-dependent code. Stage
schema changes separately with backward-compatible migrations so the old app can
continue running while the migration is applied. Disable auto-deploy temporarily
for changes that cannot follow that procedure. A fully coordinated migration and
application deployment pipeline remains future work.

Rolling back a Render image does not undo database changes. The manual workflow
is setup/migration automation, not an automatic production release pipeline.

## Free-plan limits and operations

- Render Free sleeps after 15 minutes without inbound traffic; startup can take
  about a minute. Its filesystem is ephemeral and persistent disks are unavailable.
- Pre-deploy commands and one-off jobs are not available on the free web service;
  migrations/bootstrap are therefore handled by the manual GitHub workflow.
- Keep services on Free and avoid adding payment methods for this zero-budget setup.
  Track included build/bandwidth quotas; services/builds can be suspended at limits.
- Neon Free has compute, storage and transfer quotas and can suspend idle compute.
  Check the current allowance in the console; do not schedule artificial keepalive
  traffic. Readiness queries also consume compute while the app is awake.
- Use synthetic staging records. Keep exports/backups outside Git and test restore
  separately before considering production readiness.

## References

- [Render Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render Free limits](https://render.com/docs/free)
- [Render deployment behavior](https://render.com/docs/deploys)
- [Render port binding and TLS](https://render.com/docs/web-services)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
