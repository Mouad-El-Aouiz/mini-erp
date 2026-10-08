# Confirmed Order Cancellation API

## Scope and permissions

POST `/api/tenants/{tenantId}/orders/{orderId}/cancel` requires a verified session,
active ADMIN membership in that tenant, trusted Origin and application/json:

```json
{ "version": 3, "reason": "Customer withdrew the purchase request" }
```

Version is an integer from 1 to 2147483646. Reason is trimmed, nonempty and limited
to 500 JavaScript UTF-16 code units; unsupported control characters are rejected.
No quantities, totals, tenant/actor fields, status or timestamps can be supplied.
Cancellation releases all accepted lines of a CONFIRMED order before delivery.
DRAFT and DELIVERED cannot be cancelled. CANCELLED is terminal: no edit, price
refresh, confirmation, delivery or reopening is exposed.

Only administrators see the cancellation form. Both active roles can read its
record. The form preserves the reason after errors and offers an explicit reload
following stale versions or uncertain network responses.

## Response and reads

A new success or exact replay returns 200 with Cache-Control: private, no-store:

```json
{
  "order": { "id": "uuid", "status": "CANCELLED", "version": 4, "replayed": false },
  "cancellation": {
    "id": "uuid", "orderId": "uuid", "cancelledAt": "ISO timestamp",
    "cancelledByMembershipId": "uuid", "reason": "Customer withdrew the purchase request"
  }
}
```

Order GET adds cancellation=null for other states; CANCELLED detail includes the
event and current actor name. Stable membership ID and reason/date are retained.
Accepted customer, prices, tax and monetary snapshots remain unchanged, including
large safe JSON totals, regardless of later catalog, tax or customer changes.
Lists show Cancelled and retain links to read-only details. Reasons render as text.

## Atomic workflow and concurrency

1. Recheck active ADMIN membership inside the transaction and hold FOR SHARE.
2. Lock the tenant-owned order FOR UPDATE; require CONFIRMED and expected version.
3. Lock accepted products FOR UPDATE in ascending UUID order, following the shared
   confirmation/delivery/manual-adjustment protocol.
4. Require 1-100 accepted lines and an exact matching ACTIVE reservation per product;
   validate balance bounds and enough reserved units.
5. Create the tenant/order-unique Cancellation event with server actor/time/reason.
6. Decrease reserved balances by line quantities; preserve physical balances.
7. Retain reservations as RELEASED with releasedAt equal to the event timestamp.
8. Set CANCELLED and increase version once, preserving accepted financial fields.

No physical stock movement is created. Available stock increases by the released
quantity. Other orders' reservations remain intact. Any failed check/write rolls
back the event, balances, reservations and order. Transaction timeout is 15 seconds;
unexpected errors are not retried automatically.

Cancellation and delivery serialize on the same order, so only one can succeed.
Product locks coordinate release with other confirmations, deliveries and manual
corrections. A competing confirmation/correction may fail before release commits;
it can be explicitly retried after reviewing current state. Concurrent revocation
or demotion waits for an already authorized transaction to finish.

## Exact retries

CANCELLED returns replayed=true only when expected version equals current version
minus one, the original cancelling membership matches and normalized reason equals
the stored reason. Changed inputs or another actor return 409. Revoked or demoted
memberships return 403, including replay. Event/date/IDs remain stable and reserved
stock is not reduced again. Reload after a lost response to inspect committed state.

## SQL guarantees and limits

Cancellation has unique (tenant_id, order_id) and composite same-tenant order/actor
foreign keys with RESTRICT. SQL bounds reason length to 1-500 characters and rejects
whitespace-only text. Reservation checks permit ACTIVE with both dates absent,
CONSUMED with consumedAt only, or RELEASED with releasedAt only. Accepted snapshots
are required for CONFIRMED, DELIVERED and CANCELLED.

Current administrator role, exact reservation/line equality, counter/history
reconciliation, event/status consistency and mutually exclusive terminal outcomes
are application transaction guarantees and tests, not aggregate SQL constraints.
Privileged direct SQL can bypass workflow or change history; production database
roles and reconciliation/alerts remain future work.

## Errors and deferred scope

400 invalid route ID/JSON; 401 missing session; 403 tenant/role/origin denial;
404 unavailable order; 409 wrong state/version, mismatched replay or inconsistent
reservations/balances; 415 wrong media type; 422 invalid payload. Unsupported methods
return 405; unexpected failures follow the framework's 500 path.

Draft deletion/abandonment, reopening, partial cancellation, returns, fiscal
invoicing, final numbering, shipment integrations and production deployment remain
deferred. Cancellation releases reservations and does not represent a goods return.
