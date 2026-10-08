# STOCK-001 — Physical inventory and adjustment history

## Objective

Allow active company members to consult physical stock and administrators to
record justified receipts/corrections without negative quantities or lost updates.

## Acceptance criteria

- One zero-initialized balance per catalog-created product and tenant.
- Existing products are initialized without altering catalog records.
- Administrators can add/remove whole units with a required reason.
- Employees can read inventory and history but cannot adjust stock.
- Each successful adjustment changes balance and history atomically.
- Concurrent withdrawals cannot make stock negative; additions are not lost.
- Retrying one request ID records an adjustment once, including lost responses.
- Tenant-safe actor and product references are enforced by PostgreSQL.
- No API edits/deletes movement history; corrections require a new movement.
- Inventory and history are paginated and usable on mobile.
- Existing application tests continue to pass.

## Implementation decisions

Integer physical units; maximum 2147483647. Positive delta adds units, negative
delta removes them. Opening stock uses the same manual adjustment contract.
Membership, request and product locks protect the write transaction. History
reads use a consistent database snapshot. No reservation policy is introduced.

The migration was generated with Prisma migrate diff after migrate dev refused
non-interactive execution. Its SQL was reviewed and CHECK guards/backfill added
before deployment. The new membership unique key includes the existing primary
key and cannot introduce duplicate conflicts in a valid database.

## Verification

Prisma validation/generation; migration on an existing-product fixture; TypeScript;
ESLint; unit tests; production build; full Playwright integration/browser suite.
Test stock underflow/overflow, concurrent writes, retry conflicts, lost successful
responses, forced movement-insert failure and cross-tenant SQL references.

Verified locally: Prisma schema/client and TypeScript/ESLint/build passed;
17 unit tests and 48 browser/integration tests passed, including 12 inventory
checks. Existing-product backfill was verified on PostgreSQL. Desktop and 375px
mobile stock list/history/form screens were inspected. Production dependency
audit reported zero known vulnerabilities. Development database access remains
valid. GitHub CI is still required on the pull request before merge.

## Deferred

Orders, reservations, deliveries, multiple locations, unit fractions, imports,
product deletion and production deployment. Monitoring/reconciliation and
privileged-database tamper protection remain separate work.
