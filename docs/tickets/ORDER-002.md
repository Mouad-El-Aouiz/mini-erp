# ORDER-002 — Confirm orders and reserve available stock

## Objective

Turn a reviewed draft into a confirmed order with stable accepted monetary
records and stock reservations, while preserving physical quantities.

## Acceptance criteria

- Both active roles can confirm tenant-owned orders.
- Require saved lines, reviewed versions/prices and sufficient available stock.
- Commit status, actor/date, customer name, monetary snapshots and all reservations atomically.
- Repeated exact confirmations reserve once; conflicting retries return 409.
- Concurrent orders and stock corrections cannot overspend available stock.
- Confirmed orders are read-only and retain accepted totals after catalog/tax changes.
- Inventory exposes physical, reserved and derived available quantities.
- Corrections cannot reduce physical stock below reservations.
- Origin, input validation, roles and tenant boundaries remain enforced.
- No delivery/cancellation or reservation closure endpoint is introduced.

## Implementation

Extend OrderStatus, Order snapshots and InventoryBalance; add tenant-safe line
reservations and SQL checks in a migration. Add transaction service and POST
confirmation endpoint, read-only confirmed view, draft confirmation action, and
inventory availability display. Document lock ordering, retry semantics and limits.

## Verification

Apply all migrations to an empty test database; validate/generate Prisma; run
TypeScript, ESLint, unit tests, build and full browser suite. Cover concurrent
confirmation/retries/adjustments, forced rollback at reservation and order writes,
reviewed price/tax conflicts, lost responses, immutable snapshots, maximum totals,
SQL constraints and mobile display. Record final results after verification.

### Recorded results

- All 8 migrations applied successfully to an empty test database.
- Prisma validation/generation, TypeScript, ESLint and production build passed.
- 25 unit tests passed.
- Full Chromium suite: 77 tests passed, including 16 confirmation scenarios.
- Two strengthened scenarios rerun successfully for unsaved edits/stale versions.
- Desktop (1280 px) and mobile (375 px) confirmation/inventory screens inspected.
- Production dependency audit reported 0 vulnerabilities.
- Local database connection verified; existing tenant preserved.
- GitHub CI must pass on the pull request before merging.

## Limits

Outstanding reservations have no release/consumption lifecycle yet. Delivery,
cancellation, final numbering, invoice snapshots and production reconciliation
remain deferred. Privileged direct SQL can bypass application workflow rules.
