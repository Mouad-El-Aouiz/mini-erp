# Complete Order Delivery API

## Contract and permissions

POST `/api/tenants/{tenantId}/orders/{orderId}/deliver` requires a verified session,
active ADMIN or EMPLOYEE membership in the tenant, trusted Origin and JSON:

```json
{ "version": 3 }
```

Version is an integer from 1 to 2147483646. Extra quantities, items, financial
values, tenant/actor fields and timestamps are rejected. The server always delivers
all accepted lines. Record delivery after physical handover; this action does not
contact a carrier or arrange shipment.

A new success or exact replay returns 200 with private, no-store headers:

```json
{
  "order": { "id": "uuid", "status": "DELIVERED", "version": 4, "replayed": false },
  "delivery": { "id": "uuid", "orderId": "uuid", "deliveredAt": "ISO timestamp", "deliveredByMembershipId": "uuid" }
}
```

The existing order GET adds delivery=null for other states. DELIVERED detail includes
the event and current recorded actor name; its stable membership ID is retained.
Both CONFIRMED and DELIVERED detail use accepted customer/money snapshots, unaffected
by later catalog, tax or customer changes. Delivered orders have no edit/delivery
control. The list shows Delivered and movement history links back to the order.

## Atomic workflow

Lock active membership FOR SHARE, order FOR UPDATE, then all product rows FOR UPDATE
in ascending UUID order, following the existing stock-writer protocol. Require
CONFIRMED status and expected version. Verify nonempty accepted lines, an exact
matching ACTIVE reservation per product, and adequate physical/reserved balances.

Within the same transaction:

1. Create the tenant/order-unique Delivery event with actor and timestamp.
2. Decrease physical and reserved balances by each accepted line quantity.
3. Retain reservations as CONSUMED with the event timestamp.
4. Append DELIVERY movements with negative line quantities and server-generated
   request UUIDs, linked to the event and exact order/product line.
5. Set DELIVERED and increase version once, without updating monetary snapshots.

Any failed check/write rolls back the event, every balance, reservation, movement
and status. Transaction timeout is 15 seconds; unexpected failures are not retried
automatically. The derived available quantity remains unchanged by delivery itself.
Concurrent delivery/confirmation/corrections use the same product locks.

## Retry safety and terminal state

A DELIVERED order returns replayed=true only for its original delivering membership
and original expected version (current version minus one). Changed inputs or another
actor return 409. Current active membership is required for replay. The event and
movement IDs remain stable; no additional withdrawal is performed.

After a lost response, reload the order to see the committed state or retry the
exact original command. DELIVERED is terminal: no further business transition is
exposed. An old confirmation command cannot replay once the order has advanced.

## Database guarantees and limits

Delivery has a unique tenant/order key and same-tenant order/actor foreign keys.
Delivery movements have a unique tenant/order/product key and composite foreign
keys to the Delivery and exact OrderItem. Manual movements retain orderId=NULL;
PostgreSQL's NULL-distinct uniqueness permits repeated manual adjustments.

SQL checks require negative delivery deltas from -1000000 to -1 with an order;
manual adjustments must have no order. Reservation status/date must be ACTIVE/NULL
or CONSUMED/non-NULL. Existing stock bounds and accepted monetary checks remain.

Cross-record status/quantity equality and balance/history aggregate reconciliation
are application transaction guarantees and test checks, not SQL aggregate constraints.
Privileged direct SQL can bypass workflow. Historical events/reservations/movements
are not deleted by the application. Restricted database roles and production
reconciliation/alerts remain future work.

## Errors and deferred scope

400 invalid route ID/JSON; 401 missing session; 403 membership/origin denial;
404 unavailable order; 409 wrong state/version, nonmatching replay or inconsistent
reservations/balances; 415 wrong media type; 422 invalid payload. Unsupported methods
return 405. Unexpected database failures use the framework's 500 path.

Cancellation/release, partial deliveries, returns, shipping integrations, delivery
notes, final numbering and production deployment are deferred. No user-supplied
partial quantities or financial recalculation are accepted.
