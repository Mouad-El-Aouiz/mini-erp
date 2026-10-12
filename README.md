# Mini ERP

A multi-tenant application for B2B computer hardware sales, with an English interface and USD amounts.

## Implemented Scope

- Email/password authentication, company selection and account password changes.
- Active ADMIN and EMPLOYEE memberships, administrator provisioning and versioned role/access management.
- Business customer directory and product catalog.
- Physical, reserved and available stock with traceable adjustments.
- Draft orders, explicit catalog price acceptance and configurable demonstration tax (10% initially).
- Confirmation reserves stock; complete delivery consumes reservations and physical stock; administrator cancellation releases reservations.
- Confirmed monetary snapshots and terminal delivered/cancelled states.

| Operation | ADMIN | EMPLOYEE |
| --- | --- | --- |
| Manage customers; read products and stock | Yes | Yes |
| Create/edit drafts; confirm and deliver orders | Yes | Yes |
| Change products/prices; adjust stock; configure tax | Yes | No |
| Cancel confirmed orders; manage company members | Yes | No |

Permissions are checked on the server and scoped to the company. Native public sign-up is disabled; an opt-in personal demo registration flow provisions isolated fictional workspaces. See [demo registration](docs/20-demo-registration.md) for activation, limits and cleanup.

## Stack

TypeScript, Next.js 16.4, React 19.3, Node.js 22, PostgreSQL 18, Prisma 7, Better Auth and Zod. PostgreSQL runs locally in Docker; staging uses Vercel and Neon. Exact package versions are recorded in package-lock.json.

## Local Setup

Use Node.js 22.23.2 and npm 10.9.8 to match the verified environment, Docker Desktop with Compose, and Git Bash. Run commands from the repository root.

```bash
npm ci
cp -n .env.example .env
```

Edit the private .env file before continuing:

- Set POSTGRES_PASSWORD and the matching password in DATABASE_URL. Use URL encoding for special characters in connection strings.
- Keep POSTGRES_DB=mini_erp and POSTGRES_USER=mini_erp_local for the local provisioning utilities. If POSTGRES_PORT changes, update DATABASE_URL as well.
- Set BETTER_AUTH_SECRET to a random value of at least 32 characters and BETTER_AUTH_URL=http://localhost:3000.
- Set DEV_USER_EMAIL, DEV_USER_NAME and DEV_USER_PASSWORD (12 to 128 characters).
- Optional DEV_TENANT_ID and DEV_TENANT_NAME select the demo company; defaults are in .env.example.

Generate the authentication secret locally and copy it into .env; do not publish it:

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Start PostgreSQL, install the committed schema, then create the initial local account and company:

```bash
docker compose up -d --wait &&
npx prisma generate &&
npx prisma migrate deploy &&
npm run db:check &&
npm run db:create-dev-user &&
npm run db:create-dev-company &&
npm run dev
```

Open [localhost:3000](http://localhost:3000), sign in with the configured development account and select the demo company. New databases contain no business records; create customers and products, then adjust stock before confirming an order.

The provisioning scripts accept only the local mini_erp database. Repeating user setup does not reset an existing password. Repeating company setup does not promote or reactivate an existing membership and refuses unrelated existing companies.

Stop the server with Ctrl+C. `docker compose down` stops the development database while preserving its named volume. Adding `--volumes` deletes that database's stored data.

Next.js also loads .env.local when present; conflicting values there can override .env for the application. The provisioning scripts load .env through dotenv. Keep configuration consistent and never commit environment files, .vercel credentials or database archives.

## Quality Checks

```bash
npm run typecheck &&
npm run lint &&
npm run test:unit &&
npm run build
```

Type checking generates Next.js route types. After a successful build, `npm run start` starts the local production-mode server. It still uses the local configuration.

For browser/API tests, install Chromium once:

```bash
npx playwright install chromium
```

Use the dedicated test database on port 5433. A Bash subshell keeps test configuration separate from the parent terminal:

```bash
docker compose -f compose.test.yaml up -d --wait &&
(
  export TEST_DATABASE_URL='postgresql://mini_erp_test:test_only_password@127.0.0.1:5433/mini_erp_test?schema=public'
  export DATABASE_URL="$TEST_DATABASE_URL"
  export BETTER_AUTH_URL='http://127.0.0.1:3100'
  export BETTER_AUTH_SECRET='test-only-auth-secret-never-use-in-production-2026'
  npx prisma generate &&
  npx prisma migrate deploy &&
  npm run build &&
  npm run test:e2e
)
```

Playwright manages its own server on port 3100; this port must be free. It permits only local mini_erp_test or mini_erp_ci databases. Fixtures are removed after tests; generated reports remain ignored by Git. Test credentials shown here are disposable fixtures.

Remove only the disposable test service when finished:

```bash
docker compose -f compose.test.yaml down --volumes
```

Optional container validation builds and checks a separate Docker project and automatically removes its test data. It also needs port 3100 free and database port 5434 available:

```bash
npm run test:container
```

See [container runtime](docs/11-container-runtime.md) for the optional full-container development setup.

## Database Changes

Edit prisma/schema.prisma, prepare and inspect the SQL migration against the local development database, then apply it:

```bash
npx prisma migrate dev --name describe_change --create-only
# Review generated SQL before continuing.
npx prisma migrate dev && npx prisma generate
```

Commit schema and migration files together. SQL CHECK constraints are defined in migrations; not all are represented by Prisma schema syntax. Prisma maintains updated_at through client writes; direct SQL must set it explicitly.

Use `prisma migrate deploy` for staging, not migrate dev or db push. Client generation does not apply migrations.

## Staging and CI/CD

[Staging application](https://mini-erp-staging.vercel.app) uses Vercel's Production target with the Neon staging database. This is a staging deployment, not a claim of production readiness. Vercel builds Next.js directly; it does not deploy the local Docker image.

GitHub CI runs application and container checks on isolated databases. After successful push CI on main, the gated staging workflow applies reviewed migrations, deploys and verifies a candidate, then promotes it to the stable domain. Native Vercel Git deployments remain disabled to avoid a second deployment path.

Private configuration and the delivery flow are described in [staging database setup](docs/12-staging-database.md) and [Vercel staging deployment](docs/13-vercel-staging.md). Reverting application code does not reverse database migrations.

## Known Limits

- One stock location per company, USD only and complete deliveries only.
- No supplier purchases, returns, serial-number tracking, payments, subscriptions or compliant invoice numbering.
- No unrestricted public registration, existing-account invitations, forgotten-password recovery, MFA or mandatory initial-password change. Personal demo registration is separately gated and does not verify email ownership.
- Authentication rate limits use per-instance memory. Password update and session replacement are not one atomic transaction in the installed authentication implementation.
- Performance/load optimization, centralized observability, cloud backup/restore verification and a complete operational runbook are outside the current delivery scope.
- Interface tests cover selected responsive and keyboard scenarios; they are not a complete accessibility certification.

CI audits production dependencies. The full audit also contains a known unpatched development-tooling advisory. See [security review](docs/18-security-review.md) for findings and review boundaries. Automated checks do not guarantee absence of defects.

## Documentation

- [Business scope](docs/01-business-scope.md), [data model](docs/02-data-model.md), [architecture](docs/03-architecture.md).
- APIs: [customers](docs/04-customers-api.md), [products](docs/05-products-api.md), [inventory](docs/06-inventory-api.md).
- Orders: [drafts](docs/07-draft-orders-api.md), [confirmation](docs/08-order-confirmation-api.md), [delivery](docs/09-order-delivery-api.md), [cancellation](docs/10-order-cancellation-api.md).
- [Company members](docs/14-members-api.md), [account passwords](docs/16-account-password.md), [interface review](docs/17-interface-review.md).
- [Personal demo registration](docs/20-demo-registration.md).
- [Final validation snapshot](docs/19-validation-summary.md).

Numbered API documents describe implemented behavior; the data model marks proposed entities explicitly. Documents under docs/tickets retain implementation history.
