# ORDER-001 — Draft orders and tax previews

## Objective

Prepare business customer orders with editable product quantities, preserved
catalog prices and exact USD/tax previews before implementing fulfillment.

## Acceptance criteria

- Active administrators and employees can create/read/edit tenant drafts.
- Customer, products and creator references remain tenant-safe in PostgreSQL.
- Empty drafts are allowed; at most 100 distinct lines and 1000000 units per line.
- Adding an existing product in the UI increases quantity without duplicate lines.
- New lines capture server prices; quantity edits retain snapshots.
- Reviewed catalog refresh is explicit and rejects changes since review.
- Current tenant tax defaults to 10%, editable only by administrators.
- Monetary arithmetic uses integer cents, subtotal tax and half-up cent rounding.
- Expected versions prevent concurrent edits silently overwriting each other.
- Repeated creation requests create only one draft.
- No draft operation changes stock or stock history.
- Customer/product pickers and order lists provide pagination.
- No confirmation, delivery, reservation or deletion operation is introduced.

## Implementation

Order/OrderItem schema and transactional migration, per-tenant tax/version fields,
shared validation/money calculation, scoped services, JSON routes, responsive
list/create/editor screens and administrator tax settings. Creation fingerprint
and key protect retries; version checks protect edits; reviewed prices are checked
against locked catalog records before acceptance.

## Verification

Prisma validation/generation; migration from an empty database; TypeScript; ESLint;
unit money/validation tests; production build; full Playwright suite. Cover
captured prices, rounding, optimistic conflicts, rollback, origin/roles/isolation,
SQL constraints, creation response loss, pagination and unchanged stock.

### Recorded results

- All 7 migrations applied successfully to an empty test database.
- Prisma validation, TypeScript, ESLint and production build passed.
- 23 unit tests passed.
- 61 Chromium end-to-end tests passed, including 13 order scenarios.
- Desktop (1280 px) and mobile (375 px) screens inspected with no horizontal overflow.
- Production dependency audit reported 0 vulnerabilities.
- Local database connection verified; the existing tenant was preserved.
- GitHub CI must run on the pull request before merging.

## Limits

Draft subtotal is capped at 2147483647 cents; tax rate at 10000 basis points.
No final financial snapshots or tax-compliance promises. Deletion/abandonment,
order numbering, fulfillment, monitoring and production deployment are deferred.
