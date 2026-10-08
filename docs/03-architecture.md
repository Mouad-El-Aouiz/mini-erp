# Technical Architecture

Status: implemented modular monolith; cloud hosting remains undecided.

## Application Structure

Use a modular monolith built with Next.js and TypeScript,
running on Node.js.

Organize business functionality into modules:

- Identity and tenancy
- Customers
- Products
- Orders
- Inventory
- Tenant settings

## Request Flow

User interface → API → Business service → Data access → Database

## Responsibilities

- UI components handle presentation and user interaction.
- API handlers validate requests and resolve authenticated context.
- Business services enforce permissions and business rules.
- Data access performs tenant-scoped database operations.
- Database constraints protect relational integrity.

## Database

Engine: PostgreSQL 18.

Data access and migration tooling: Prisma 7 with the PostgreSQL driver adapter.

## Data Access Tooling

Use Prisma for typed database access and schema migrations.

The generated client is recreated during installation/build; committed SQL migrations
define the database history.

Keep database access separate from API handlers and business rules.

SQL learning remains an explicit project requirement:

- Understand generated queries.
- Write SELECT, JOIN and aggregation queries.
- Understand constraints and transactions.
- Inspect query plans and indexes when measuring performance.

Version schema changes through migration files committed to Git.

Validate migrations locally before applying them to staging.
Never assume that changing a TypeScript type changes the database.

An ORM does not replace server authorization, tenant isolation
or business rule validation.

## Security

Validate tenant membership and permissions on the server.
Never treat browser-supplied tenant identifiers or totals as trusted.
Keep credentials and database secrets outside Git.

## Testing Strategy

- Unit tests for calculations and business rules.
- Integration tests for database constraints, transactions
  and tenant isolation.
- End-to-end tests for critical user workflows.

## Deployment Direction

Use a local development environment first.
Introduce automated checks through CI.
Deploy a staging environment before considering production.

## Open Decisions

- Hosting, TLS, production configuration and database deployment.
- Production onboarding, backups and deployment coordination.

## Implemented Runtime and Quality Tooling

Better Auth provides database-backed sessions. Prisma uses committed PostgreSQL
migrations and explicit transactions for order/stock invariants. Node test runner
covers validation/arithmetic; Playwright exercises UI, API, database constraints
and concurrency. GitHub Actions runs application and container checks.

The optional Docker runtime uses Linux standalone Next.js output, a separate
one-shot migration image and runtime environment injection. PostgreSQL persists
in a named volume; the web runtime is non-root with a read-only root filesystem.
The public readiness endpoint exposes only database connectivity state.
See [Container runtime](11-container-runtime.md) for the operational contract.
