# ORDER-004 - Cancel confirmed orders before delivery

## Objective

Let active tenant administrators cancel confirmed orders, release all reservations
and retain an auditable event without changing physical stock or accepted amounts.

## Acceptance criteria

- Require active ADMIN, expected version, CONFIRMED and a nonempty bounded reason.
- Deny drafts, delivered orders, cross-tenant orders and employee writes.
- Preserve accepted customer, prices, tax and totals in cancelled reads.
- Commit event, balances, RELEASED reservations and status atomically.
- Keep physical stock and movements unchanged; preserve other orders' reservations.
- Exact retries apply once; changed actors/versions/reasons conflict.
- Revocation/demotion applies to first requests and replay, including concurrent writes.
- Delivery/cancellation races produce exactly one terminal outcome.
- Competing confirmations and adjustments preserve stock invariants.
- Show terminal history and recover from stale or lost responses on desktop/mobile.

## Implementation

Add CANCELLED, RELEASED, releasedAt and Cancellation with same-tenant actor/order
references, unique order event, reason bounds and lifecycle timestamp checks.
Add scoped service, ADMIN-only endpoint, role-aware form and accepted detail/list
views. Preserve existing stock-writer lock order and accepted snapshots.

## Verification

Apply all migrations on an empty dedicated database; validate/generate Prisma;
run TypeScript, ESLint, unit tests, production build and full browser suite.
Cover SQL constraints, role/tenant boundaries, exact retries, release/physical
reconciliation, terminal races, transaction failures and UI recovery.

### Recorded results (2026-10-08)

- All 10 migrations applied successfully to an empty dedicated PostgreSQL database;
  the cancellation migration also applied to the existing development database.
- Prisma format, validation and client generation succeeded.
- TypeScript, ESLint, production build and Git whitespace checks passed.
- 31 unit tests passed, including release arithmetic and cancellation validation.
- 18 focused cancellation browser scenarios passed (1.5 minutes).
- Complete Chromium suite: 112 tests passed (7.4 minutes), including terminal races,
  exact retries, authorization changes, forced transaction failures and UI recovery.
- Desktop (1280px) and mobile (375px) form, terminal detail, order list and inventory
  views verified with disposable fixtures; no horizontal overflow observed.
- Production dependency audit reported no vulnerabilities.
- Development database connection verified with its existing tenant retained.
- Test tenant, order, cancellation, delivery, movement and reservation counts
  returned to zero; dedicated test containers/volumes removed afterwards.
- GitHub CI remains to be run against the pull request before merging.

## Limits

Cancelled and delivered orders remain terminal. Draft deletion, reopening, partial
cancellation, goods returns, final numbering and production reconciliation remain
future work. Privileged direct SQL can bypass application lifecycle rules.
