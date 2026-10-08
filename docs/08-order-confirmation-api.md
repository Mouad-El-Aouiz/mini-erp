# Order Confirmation API

## Contract

POST `/api/tenants/{tenantId}/orders/{orderId}/confirm` requires JSON, trusted
Origin, a verified session and active ADMIN or EMPLOYEE membership in the tenant.

```json
{ "version": 2, "taxVersion": 1 }
```

Both fields are integer JSON numbers from 1 to 2147483646. Extra fields (including
prices, totals, quantities and actors) are rejected. The server derives all state.
A new confirmation and an exact replay both return 200:

```json
{ "order": { "id": "uuid", "status": "CONFIRMED", "version": 3, "replayed": false } }
```

The existing order detail GET supports DRAFT, CONFIRMED, DELIVERED and CANCELLED. DRAFT totals remain current
previews; CONFIRMED totals/customer company name use the saved snapshots. Catalog
comparison fields are informational after confirmation and never rewrite snapshots.
The order list exposes the actual status and captured confirmed customer name.
Confirmed lines/customer cannot be edited or price-refreshed through the API/UI.

## Confirmation rules

- Require current draft version, at least one saved line, and supported amounts.
- Require unchanged taxVersion, even if the numeric rate happens to be unchanged.
- Captured prices must match locked current catalog prices; explicit price refresh
  remains a separate user action.
- Every quantity must fit physicalQuantity minus reservedQuantity.
- Capture tax rate/version, subtotal, rounded tax, total, customer company name,
  confirmation timestamp and confirming membership; retain the existing line snapshots.
- Increment order version once and reserve each line without physical movements.
- Roll back the entire transaction on any failed check/write.

The demonstration rate is not a fiscal compliance guarantee. Customer addresses,
contact data and final invoice numbering are not invoice snapshots.

## Retry safety

Confirmation identifies a command by tenant/order, original expected draft version,
reviewed taxVersion and confirming membership. These are retained in the saved
version and snapshots. A CONFIRMED order returns replayed=true only when all these
inputs match. Another actor, another version or another taxVersion returns 409.
Current active membership is required on every replay.

A lost response can be recovered by reloading the detail or retrying the exact
command. Both yield the saved result without reserving twice. The interface
instructs reloading after uncertain network failures.

## Transaction and lock protocol

Lock active membership FOR SHARE, order FOR UPDATE, tenant tax settings FOR SHARE,
then all product rows FOR UPDATE in ascending UUID order. Read captured lines,
check the reviewed tax and prices, lock the current customer name, and update
reserved balances/create reservation records before setting CONFIRMED and snapshots.
The transaction timeout is 15 seconds; no automatic retry of unexpected failures.

Physical adjustments and catalog writes use the same product row locks. Competing
confirmations cannot independently spend the same stock; multi-product operations
use a stable lock order. A later stock writer must follow this protocol.

Order detail reads remain Repeatable Read snapshots. Available quantity is derived
from the two balance fields; it is not an independently stored counter.

## Database guarantees

- SQL checks require 0 <= reserved_quantity <= physical_quantity.
- Reservation quantities are 1–1000000; primary key is tenant/order/product.
- Composite foreign keys enforce the exact tenant/order/product/line and actor.
- DRAFT snapshots must all be NULL; CONFIRMED/DELIVERED/CANCELLED snapshots must be complete, bounded,
  and consistent with the exact subtotal-level rounding formula.
- Accepted total uses BIGINT because it can reach 4294967294 cents; API conversion
  remains an exact safe integer JSON number.

The transaction maintains balance/reservation aggregate equality and legal state
transitions. These are not aggregate SQL constraints. Confirmed data is immutable
through the application, not tamper-proof against privileged direct SQL. Operational
reconciliation and restricted database roles remain future work.

## Errors and deferred operations

400 invalid route ID or JSON; 401 missing session; 403 membership/origin denial;
404 unavailable order; 409 stale draft/tax, changed prices, empty order, insufficient
stock or nonmatching replay; 415 wrong media type; 422 invalid payload. Other
methods return 405. Unexpected database failures follow the framework's 500 path.

Complete delivery consumes reservations; see [Delivery API](09-order-delivery-api.md).
Administrator cancellation releases reservations; see [Cancellation API](10-order-cancellation-api.md).
Final numbering, draft abandonment and fiscal invoicing are deferred. Reservations
remain as ACTIVE, CONSUMED or RELEASED historical records.
