# Container runtime

## Scope

Run the compiled Next.js application and PostgreSQL locally with Docker Compose.
This prepares a portable Linux runtime; hosting, TLS, backups, registry publishing
and automated deployment are not configured yet.

The existing `npm run dev` + `docker compose up -d --wait` workflow remains available.
The application overlay is optional and shares the existing development database
and `postgres_data` volume. It does not provision users or companies.

## Images and startup order

`Dockerfile` pins Node.js 22.23.2 on Debian Bookworm by digest. Shared dependency
installation uses `npm ci` and the committed lock file. The builder generates
Prisma and Next.js standalone output without contacting a database.

- `runtime`: compiled server, required traced dependencies, static files and public assets.
- `migrations`: Prisma CLI, configuration and committed migrations; a one-shot process.

The runtime excludes development CLI tools, test fixtures and private `.env`
files. `.dockerignore` excludes all environment files from the build context.
Non-secret build placeholders satisfy configuration imports; actual database and
authentication values are injected only at container startup. Never introduce
real credentials as Docker build arguments or `NEXT_PUBLIC_*` variables.

Startup order is PostgreSQL healthy -> `prisma migrate deploy` succeeds -> app.
The migration service exits after applying pending migrations. A failed migration
prevents a fresh app service from starting. An already-running app during a later
upgrade needs a separately designed deployment procedure and compatible migrations.

The app runs as the non-root `node` user with a read-only filesystem, dropped Linux
capabilities and no privilege escalation. Temporary files and Next.js cache use
writable, disposable tmpfs mounts. Compose forwards termination through an init
process and allows 30 seconds for shutdown.

## Configuration and local start

Install dependencies, configure `.env`, and provision your existing local user and
company through the existing guarded host scripts if needed. They intentionally
refuse production execution; do not change their guards to run inside this image.

For container mode, add these settings to your private `.env`:

```dotenv
# Use your actual local database credentials; URL-encode special characters.
CONTAINER_DATABASE_URL="postgresql://mini_erp_local:YOUR_ENCODED_PASSWORD@db:5432/mini_erp?schema=public"
APP_PORT=3000
BETTER_AUTH_URL=http://localhost:3000
```

Keep `DATABASE_URL` pointing to `127.0.0.1` for host-side Prisma commands.
Inside the app container, `db` is the database service hostname; `localhost`
would refer to the app container itself. Internal PostgreSQL port is always 5432,
even when its host port differs. `BETTER_AUTH_SECRET` must be a private random
secret of at least 32 characters. Startup rejects missing settings and the build
placeholder. When changing `APP_PORT`, also update the browser origin in
`BETTER_AUTH_URL`. Stop a native Next.js server already using the selected port.

From Git Bash at the repository root:

```bash
docker compose -f compose.yaml -f compose.app.yaml config --quiet
docker compose -f compose.yaml -f compose.app.yaml up --build -d --wait
docker compose -f compose.yaml -f compose.app.yaml ps
docker compose -f compose.yaml -f compose.app.yaml logs --tail=50 app migrations
curl --fail http://localhost:3000/api/health
```

Open `http://localhost:3000/sign-in` and use your existing local account.
For later code/schema changes, rebuild and explicitly rerun migrations before
recreating the app; `up` alone may retain a previously completed migration container:

```bash
docker compose -f compose.yaml -f compose.app.yaml build
docker compose -f compose.yaml -f compose.app.yaml run --rm migrations
docker compose -f compose.yaml -f compose.app.yaml up -d --wait --force-recreate app
```

Review migration compatibility before any deployment. An application image rollback
does not undo a database migration. Production backup/restore and deployment
coordination remain separate work.

Stop the full local stack while retaining the development database:

```bash
docker compose -f compose.yaml -f compose.app.yaml down
```

Do not use `--volumes` with this development stack unless intentionally deleting
its data. The image contains the application, while the named volume retains
PostgreSQL data across container replacement.

## Readiness and troubleshooting

`GET /api/health` performs `SELECT 1`, returning `200 {"status":"ok"}` when the
connection succeeds and `503 {"status":"unavailable"}` otherwise, with `no-store`.
The public response contains no database address, credentials or error details.
It measures database connectivity, not complete schema validity or every business
operation. Docker polls it to determine readiness. An unhealthy state alone does
not restart a container; the restart policy applies when its process exits.

Inspect `docker compose ... ps` and application/migration logs first. If startup
fails, check the required runtime settings and migration exit status. Host scripts
use the localhost URL; app and migration containers use the service-hostname URL.
Do not paste private environment dumps into issues or logs.

## Dedicated verification

Install Chromium once, then run the disposable container project:

```bash
npm ci
npx playwright install chromium
npm run test:container
# Full existing browser/integration suite against the container:
npm run test:container -- --full
```

The wrapper builds both images and uses only `mini-erp-container-tests`, database
`mini_erp_test` at localhost:5434 and the app at localhost:3100. Ports must be free.
Its fixed credentials are exclusively test fixtures. It refuses to take ownership
of existing containers in that project. It verifies runtime contents/settings,
migration replay, selected browser flows (or all with `--full`), database outage
responses, data persistence after database container replacement, and app restart.
Finally it removes only that disposable project's containers and volume, including
on failure. It never targets the development volume or the existing port-5433 test
project. After a forcibly interrupted terminal, clean up this dedicated project:

```bash
docker compose -p mini-erp-container-tests -f compose.container-test.yaml down --volumes --remove-orphans
```

CI retains the full native application suite and adds an independent **Container
checks** job using eight representative container flows and lifecycle checks. It builds
locally on the runner without publishing images or deploying a service.
