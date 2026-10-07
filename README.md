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

Application foundation implemented. Business modules, authentication and database integration are not implemented yet.

## Working Process

Each feature follows:
ticket → branch → implementation → verification → review → merge.

Project documentation, code and interface content use English.

## Design Documents

- [Business scope](docs/01-business-scope.md)
- [Data model](docs/02-data-model.md)

## Local Development

Use Node.js 22.23.2 and npm 10.9.8 to match the verified developer environment.
Docker Desktop and Compose will be used for the database in a later ticket.

From the repository root:

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Stop the development server with Ctrl+C.
The home page displays planned modules; it does not provide business operations yet.

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
The application is not connected to the database yet.


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
access before running TypeScript, ESLint, and the production build.

## Additional Documents

- [Technical architecture](docs/03-architecture.md)
- [Application setup ticket](docs/tickets/SETUP-001.md)
