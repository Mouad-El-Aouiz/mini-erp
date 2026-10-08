# ORDER-003 — Record complete order deliveries

## Objective

Record one complete delivery of a confirmed order, consume its reserved stock and
retain auditable history without changing accepted prices or totals.

## Acceptance criteria

- Both active roles can record tenant-owned deliveries.
- Require expected version, CONFIRMED state and matching active reservations.
- Commit event, balances, reservation consumption, movements and status atomically.
- Exact retries return the existing event without withdrawing stock twice.
- Concurrent delivery/confirmation/corrections preserve available-stock invariants.
- Keep accepted monetary and customer snapshots through DELIVERED reads.
- Preserve consumed reservations and one negative movement per accepted line.
- Show recorded delivery and linked inventory history on desktop/mobile.
- Preserve session, tenant, role, input and Origin protections.
- Reject partial quantities; cancellation and shipping integrations remain deferred.

## Implementation

Add DELIVERED, Delivery events, reservation consumption fields and movement kind/order
links. Extend SQL checks/foreign keys/uniqueness. Add scoped delivery service and
POST endpoint, terminal detail view, recording action and inventory history links.

## Verification

Apply all migrations to an empty database; validate/generate Prisma; run TypeScript,
ESLint, unit tests, build and complete browser suite. Test competing writers, retries,
forced mid-transaction failures, lost responses, tenant isolation, SQL constraints,
maximum accepted totals and physical/history plus active-reservation reconciliation.

### Recorded results (2026-10-08)

- All 9 migrations applied to an empty dedicated PostgreSQL test database;
  the delivery migration also applied to the existing development database.
- Prisma format, validation and client generation succeeded.
- TypeScript, ESLint, production build and Git whitespace checks passed.
- 28 unit tests passed, including stock consumption bounds and strict input checks.
- Final complete Chromium run: 94 tests passed (5.8 minutes), including 17 new
  delivery scenarios. An earlier run had 93 passes and one page-fixture startup
  timeout; the final run passed without increasing timeouts or enabling retries.
- Desktop (1280px) and mobile (375px) delivery, order list, inventory and movement
  screens verified with disposable fixtures and no horizontal overflow.
- Production dependency audit reported no vulnerabilities.
- Development database connection verified; its existing tenant retained.
- Test tenant, order, delivery, movement and reservation counts returned to zero;
  dedicated test containers/volumes removed afterwards.
- GitHub CI remains to be run against the pull request before merging.

## Limits

Delivered is terminal. Cancellation, release, partial delivery, returns, final
numbering, delivery notes, carrier integration and production monitoring remain
future work. Privileged direct SQL can bypass application lifecycle rules.
