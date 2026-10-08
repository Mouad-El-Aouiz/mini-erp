# Mini ERP

A multi-tenant SaaS for B2B computer hardware sales.

## Technology Choices

- TypeScript
- Next.js
- Node.js

## Business Scope

- Business customers only.
- Currency: USD.
- Tax-exclusive catalog prices.
- Configurable demonstration tax rate: 10%.
- Complete delivery after order confirmation.
- Administrators and employees can confirm and deliver orders.
- Only administrators can cancel confirmed orders before delivery.
- Draft price changes require explicit acceptance before confirmation.

## Project Status

Application foundation, PostgreSQL access, email/password authentication, tenant memberships, and company selection are implemented. Business customer listing, creation and editing, the role-protected product catalog, physical stock adjustment history, and orders with tax previews, confirmation/reservations, complete delivery and administrator cancellation are implemented. Membership management and the remaining business modules are deferred.

## Working Process

Each feature follows:
ticket → branch → implementation → verification → review → merge.

Project documentation, code and interface content use English.

## Design Documents

- [Business scope](docs/01-business-scope.md)
- [Data model](docs/02-data-model.md)

## Local Development

Use Node.js 22.23.2 and npm 10.9.8 to match the verified developer environment.
Docker Desktop and Compose run the local PostgreSQL database.

From the repository root:

```bash
npm ci
cp -n .env.example .env
# Configure database credentials and authentication settings in .env before continuing.
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000. Stop the development server with Ctrl+C.
The home page summarizes module availability. Sign in and select a company to manage its customers, products and physical stock.

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run build
```

Type checking generates Next.js route types before invoking TypeScript.
The build compiles the application; these checks do not replace business tests.
For a local production-mode check, run npm run start after a successful build.

Commit package.json and package-lock.json. Do not commit node_modules,
.next, next-env.d.ts or files containing secrets. The application uses system
fonts so its build does not require a Google Fonts download.

## Local Database

PostgreSQL 18 runs locally through Docker Compose.

Create the local configuration:

```bash
cp -n .env.example .env
```

Set a local password in .env. Never commit this file.

Start the database and wait until it is ready:

```bash
docker compose up -d --wait
docker compose ps
```

Verify the connection:

```bash
docker compose exec db psql -U mini_erp_local -d mini_erp -c "SELECT current_database(), current_user, version();"
```

Stop the database:

```bash
docker compose down
```

Database data persists in the postgres_data named volume.
Running docker compose down --volumes deletes that volume and its data.
Server-side database access is available through Prisma.


## Application Structure

- src/app/page.tsx: home page, rendered as a Server Component.
- src/app/layout.tsx: root HTML document, English language and metadata.
- src/app/globals.css: shared styles.
- src/app/page.module.css: styles scoped to the home page.
- tsconfig.json: strict TypeScript configuration and import aliases.
- eslint.config.mjs: Next.js and TypeScript lint rules.

## Prisma and Database Access

After installing dependencies and configuring `.env`, start PostgreSQL:

```bash
docker compose up -d --wait
```

Generate the Prisma client and apply existing migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

Verify database access:

```bash
npm run db:check
```

The verification script reads the tenant count without modifying data.

### Database Changes

Models are defined in `prisma/schema.prisma`.

During development, prepare a migration for review:

```bash
npx prisma migrate dev --name describe_change --create-only
```

Review the generated SQL before applying it:

```bash
npx prisma migrate dev
npx prisma generate
```

Commit the Prisma schema and migration files. Do not commit `.env`
or the generated Prisma client.

The `tenants_name_not_blank` SQL constraint rejects empty or
whitespace-only tenant names. It is defined in the migration because
Prisma schema syntax does not represent this CHECK constraint.

The `updated_at` column is maintained by Prisma when using the client.
Direct SQL writes must handle it explicitly.

### Continuous Integration

CI starts a temporary PostgreSQL database, validates the Prisma schema,
generates the client, applies committed migrations, and verifies database
access before running TypeScript, ESLint, and the production build. It then
runs unit tests and the full application browser/integration suite against that build and the temporary database.

## Additional Documents

- [Technical architecture](docs/03-architecture.md)
- [Application setup ticket](docs/tickets/SETUP-001.md)

## Authentication

Better Auth manages email/password authentication and database-backed sessions.
Public registration is disabled. `/dashboard` checks the session on the server;
it lists only the signed-in user's active company memberships. Company workspaces at `/tenants/[tenantId]` verify active membership again on every server request.

Configure these private values in `.env`:

- `DATABASE_URL`: local PostgreSQL connection string.
- `BETTER_AUTH_SECRET`: a high-entropy random secret, at least 32 characters.
- `BETTER_AUTH_URL`: `http://localhost:3000` for local development.
- `DEV_USER_EMAIL`, `DEV_USER_NAME`, and `DEV_USER_PASSWORD`: local account details.

Generate the authentication secret locally:

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Copy the generated value into `.env`; never commit or share it. Set a development
password containing 12 to 128 characters, then provision the local account:

```bash
npm run db:create-dev-user
```

The script requires the local `mini_erp` database, hashes the password with Better
Auth, and creates the user and credential account atomically. If the email
already exists, it makes no changes and does not reset the password. It is a
local development utility, not a production user-management procedure.

Visit `http://localhost:3000/sign-in`. Signing out invalidates the session.
Email verification, password recovery, membership management, and production
configuration are deferred.

## Authentication Browser Tests

Playwright runs authentication and tenant-access checks against a production build in Chromium:

- Anonymous dashboard access is denied.
- Incorrect passwords and unknown emails display the same generic message.
- Sign-in persists across reloads; sign-out rejects reuse of the original session.
- Expired sessions cannot access the dashboard.
- Public registration is rejected without creating a user.
- Credential passwords are stored as verifiable hashes rather than plaintext.

Use the separate PostgreSQL test service on port 5433. Tests create a temporary
account and remove it afterward. They never use the local development account.

Install the browser once:

```bash
npx playwright install chromium
```

Start the test database, then run the remaining commands in a Bash subshell so
test configuration does not replace your terminal's development configuration:

```bash
docker compose -f compose.test.yaml up -d --wait
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

Playwright starts and stops its own server on port 3100. It refuses to reuse an
existing server and requires a local database named `mini_erp_test` or
`mini_erp_ci`. Authentication secrets and database credentials shown here are
only for isolated test environments. Browser traces, videos, and screenshots
are disabled to avoid retaining session credentials in test artifacts.

Remove the disposable test service and its data when finished:

```bash
docker compose -f compose.test.yaml down --volumes
```

This command targets the test project, not the development database.

## Dependency Security

Scoped npm overrides pin corrected transitive versions of mysql2 and deepmerge-ts.
CI rejects high or critical findings in the production dependency graph.
Run the full audit as well when reviewing dependency changes:

```bash
npm audit
npm audit --omit=dev --audit-level=high
```

A known unpatched braces finding remains in the Next.js ESLint dependency chain.
See [SEC-001](docs/tickets/SEC-001.md) for advisories, exposure, and validation.

## Company Selection

After sign-in, `/dashboard` lists companies with an active membership for the
current user, showing the user's role in each company. Users without an active
membership see an empty state and can still sign out. No membership or company
is created automatically.

Opening a company navigates to `/tenants/[tenantId]`. The URL identifies the
workspace; no global active-company cookie or persistent selection is stored.
Each workspace request checks the session and active membership on the server.
Invalid identifiers, missing companies, and unauthorized access show the same
unavailable page. Anonymous requests redirect to sign-in.

Company links disable prefetching, and returning to the selector fetches the
current memberships. Role labels are informational; future business operations
must enforce their own tenant and role checks. The workspace links to customer and product management; order confirmation and reservations are implemented; complete delivery and administrator cancellation are available.

See [TENANT-002](docs/tickets/TENANT-002.md) for scope and validation.

## Local Demo Company

After provisioning your existing local account, create a demo workspace:

```bash
npm run db:create-dev-user
npm run db:create-dev-company
```

The company script requires a local PostgreSQL database named `mini_erp`, refuses
`NODE_ENV=production`, and identifies the existing credential user using
`DEV_USER_EMAIL`. It does not create users or change passwords.

Optional `.env` settings `DEV_TENANT_ID` and `DEV_TENANT_NAME` select the company
UUID and name. Their defaults are shown in `.env.example`. Keep the UUID stable
between runs; changing it deliberately creates a separate company.

The initial run creates the company and its ADMIN membership in one transaction.
Repeated runs leave existing names, roles and active status unchanged. An
existing company without this user's membership is rejected rather than granting
access. This script does not reactivate a revoked membership or promote an
existing employee. Concurrent conflicting setup runs may fail; rerun after the
first completes.

Sign in and open `/dashboard` to select the demo company and manage its customers, products and physical stock. This is a local setup utility, not production onboarding.
See [SETUP-002](docs/tickets/SETUP-002.md).

## Business Customers

Open your company workspace and select **Manage customers**. Active employees
and administrators can create and edit customers for their own company.
Customer names need not be unique. Optional fields may be cleared. Deletion
and archival are not available.

Pages:

- `/tenants/[tenantId]/customers`: list, 20 records per page.
- `/tenants/[tenantId]/customers/new`: creation form.
- `/tenants/[tenantId]/customers/[customerId]/edit`: full edit form.

Use the same browser origin as BETTER_AUTH_URL when saving; local development
normally uses `http://localhost:3000`. The application refuses foreign or missing
Origin headers on customer writes. This policy supplements session and
membership checks.

Run the unit tests independently of PostgreSQL:

```bash
npm run test:unit
```

The existing browser-test setup also runs customer API, form, isolation and SQL
constraint checks on the isolated test database. CI now runs unit tests before
the production build and application integration/browser checks.

See [Customers API](docs/04-customers-api.md) and
[CUSTOMER-001](docs/tickets/CUSTOMER-001.md) for contracts and decisions.

## Product Catalog

Select **Manage products** in the company workspace. Active members can consult
the catalog; only administrators see creation/edit links and can save changes.
Each product has a company-unique uppercase SKU, a name, and a tax-exclusive USD
unit price. The UI accepts amounts such as 129.99; the database stores 12999 cents.
A conflicting SKU produces a field error while preserving form input.

Pages:

- `/tenants/[tenantId]/products`: list, 20 records per page.
- `/tenants/[tenantId]/products/new`: administrator creation form.
- `/tenants/[tenantId]/products/[productId]/edit`: administrator edit form.

Product writes use the same session, tenant and Origin policy as customers and
add the ADMIN role requirement. Physical stock is available through inventory management. Draft tax previews are implemented; order confirmation is available and deletion is deferred.
See [Products API](docs/05-products-api.md) and [PRODUCT-001](docs/tickets/PRODUCT-001.md).

## Physical Inventory

Select **Manage inventory** in your company workspace. Each catalog product
starts at zero units. Administrators record positive receipts or negative
corrections with a required reason; employees can consult the quantity/history.
Physical stock cannot become negative. No movement edit/delete operation exists.

- `/tenants/[tenantId]/inventory`: paginated physical stock list.
- `/tenants/[tenantId]/inventory/[productId]`: history and administrator form.

If a response is lost, retry with unchanged values so the form reuses its request
ID. A successful adjustment is applied only once per request ID. Quantity changes
and history commit together. Confirmation reserves stock; complete delivery and administrator cancellation are available.

See [Inventory API](docs/06-inventory-api.md) and [STOCK-001](docs/tickets/STOCK-001.md).

## Draft Orders and Tax Settings

Select **Manage orders**, create a draft for a customer, add products and edit
whole-unit quantities. Both active roles can prepare drafts. Existing product
lines retain captured prices; use **Accept current catalog prices** only after
reviewing differences and saving edits. Drafts do not change stock.

The server derives integer-cent subtotals, current demonstration tax and totals.
Tax rounds once on the subtotal, half up to the nearest cent. Administrators can
edit the tenant rate (default 10.00%) through **Tax settings**. Stale draft/tax
versions return conflicts; **Reload draft** discards unsaved edits.

Pages: `/tenants/[tenantId]/orders`, `/orders/new`, `/orders/[orderId]` under the
same tenant prefix; administrator `/tenants/[tenantId]/tax-settings`.

Customer/product selectors are paginated. Draft creation safely retries unchanged
customer input after a lost response. Administrator cancellation is available before delivery. Draft deletion remains deferred.

See [Draft orders API](docs/07-draft-orders-api.md) and [ORDER-001](docs/tickets/ORDER-001.md).

## Order Confirmation and Reservations

Save the draft, review current prices/totals, then use **Confirm order**. Both active
roles can confirm. The server requires unchanged draft/tax versions, current
catalog prices, at least one line and sufficient available stock for every product.
Confirmation records accepted monetary snapshots, customer company name, timestamp
and actor; confirmed orders are read-only through the application.

Inventory now shows physical, reserved and available quantities. Confirmation
changes reserved quantities only; manual corrections cannot reduce physical
stock below reservations. Repeating the same confirmation by its original actor
with the original versions returns the existing result without another reservation.

Complete delivery consumes reservations; administrator cancellation releases reservations.
Final numbering and production reconciliation remain deferred.

See [Order confirmation API](docs/08-order-confirmation-api.md) and [ORDER-002](docs/tickets/ORDER-002.md).

## Complete Order Delivery

Open a confirmed order and use **Record complete delivery** only after all ordered
units have been handed over. Both active roles can record delivery. The server
requires the reviewed order version and matching active reservations, then creates
one delivery event, decreases physical/reserved quantities, retains consumed
reservations and appends one negative movement per product in a transaction.
Accepted prices, tax and totals are preserved. Delivered orders are terminal.

The inventory history distinguishes adjustments from deliveries and links delivery
movements to their order. Exact retries by the original actor/version return the
recorded result without another withdrawal. After an uncertain network response,
reload the order before retrying.

Partial delivery, shipping integrations and final document numbering
remain deferred. See [Delivery API](docs/09-order-delivery-api.md) and [ORDER-003](docs/tickets/ORDER-003.md).

## Confirmed Order Cancellation

An active tenant administrator can cancel a confirmed order before delivery.
Open the order, enter a cancellation reason (1-500 characters after trimming),
and use **Cancel confirmed order**. Employees can read the resulting record.

The server checks the expected version and matching active reservations, records
one cancellation event with actor/reason/date, marks reservations RELEASED and
decreases only reserved balances in a single transaction. Physical stock and its
movement history remain unchanged; accepted prices, tax and totals are preserved.
Cancelled orders cannot be reopened, edited or delivered.

Exact retries by the original administrator/version/normalized reason return the
existing result without releasing stock twice. Current administrator rights are
required even for replay. After an uncertain response, use **Reload before
cancellation** to inspect the current order before retrying.

Cancellation and delivery lock the same order and sorted product rows; only one
terminal outcome can commit. Draft deletion, returns and reopening remain deferred.
See [Cancellation API](docs/10-order-cancellation-api.md) and [ORDER-004](docs/tickets/ORDER-004.md).
