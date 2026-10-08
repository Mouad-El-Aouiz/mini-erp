# Physical Inventory API

## Scope

One physical stock balance per product and tenant, at a single stock location.
All active members can consult stock and movement history. Only administrators
can record manual adjustments. Reservations, order delivery and available stock
calculations are deferred until the order workflow is approved and implemented.

Catalog-created products receive a zero balance in the same transaction. The
migration initializes existing products at zero; it never invents starting
quantities. Record real opening quantities as positive adjustments with reasons.
Products inserted directly through SQL may have no balance; reads treat this as
zero and the first adjustment initializes it transactionally.

## Endpoints

| Method | Path | Response |
| --- | --- | --- |
| GET | /api/tenants/{tenantId}/inventory | inventory, page, pageSize, hasNextPage |
| GET | /api/tenants/{tenantId}/inventory/{productId}/movements | product, physicalQuantity, movements, page, pageSize, hasNextPage |
| POST | /api/tenants/{tenantId}/inventory/{productId}/movements | movement, replayed |

Lists use 20 records per page. Inventory orders by product name/id ascending;
history orders by createdAt/id descending. The single page parameter accepts
1–9999, defaults to 1, and returns empty pages past the end. History quantity and
movements are read in one Repeatable Read transaction. Pagination between
requests is offset based and does not retain a snapshot.

All responses use Cache-Control: private, no-store. IDs require UUID syntax.
A product outside the authorized tenant has the same 404 as a missing product.

## Adjustment contract

POST requires application/json, a verified session, active ADMIN membership,
and an Origin matching BETTER_AUTH_URL's origin.

```json
{
  "requestId": "3d3db15a-3ac7-4f03-b624-a15c8221b4ad",
  "quantityDelta": 10,
  "reason": "Opening stock count"
}
```

- requestId: required UUID, normalized to lowercase.
- quantityDelta: nonzero signed integer JSON number, -2147483647–2147483647.
- reason: required trimmed string, 1–500 characters.
- Extra fields, including tenantId, actor IDs and final stock, are rejected.
- The resulting physical quantity must remain between 0 and 2147483647.

The server supplies the tenant, actor membership, movement ID and timestamp.
Movement records expose id, productId, requestId, quantityDelta, reason,
recordedByMembershipId, recordedByName and createdAt. The actor name is the
current user name; stable membership identity is retained independently.

## Retry safety and concurrency

A new successful adjustment returns 201 with replayed=false. Reusing the same
tenant/requestId with the same product, normalized fields and actor returns 200,
replayed=true and the original movement. It makes no additional stock change.
Reusing it for different input or another actor returns 409. Authentication and
current ADMIN membership are required even for a replay. Keys are retained for
the lifetime of the movement.

The browser retains its request ID after a failed/lost response when input is
unchanged. Retry unchanged values to recover safely. Editing values constitutes
a new operation with a new request ID; do not edit an uncertain operation and
resubmit it as a replacement.

Each write transaction locks the active ADMIN membership, serializes the
request ID with a PostgreSQL advisory lock, then locks the tenant's product row.
It checks the latest physical quantity, updates the balance and inserts the
movement together. Any failure rolls back both changes. All future stock
writers must follow the same product-lock protocol. Concurrent withdrawals
cannot independently spend the same units.

## Errors

400: malformed identifiers, JSON or pagination; 401: missing authentication;
403: inactive/missing membership, insufficient role or untrusted origin;
404: unavailable product; 409: insufficient stock, stock limit overflow or key
reuse with different data; 415: wrong media type; 422: invalid fields.
Unsupported methods return 405. Unexpected failures use the framework's 500 path.

## History and database guarantees

There is no endpoint to edit or delete movements. Correct errors with a
compensating adjustment and a reason. SQL CHECK constraints reject negative
balances, zero deltas and blank/oversized reasons. Composite foreign keys enforce
same-tenant product and actor references. Unique tenant/requestId prevents
repeated movement records. Referenced products and memberships cannot be deleted.

Movement history is append-only through this application, not tamper-proof
against privileged direct SQL. Quantity/history reconciliation, operational
alerts and separate database roles are future work. A derived balance can cascade
when deleting a product without movements; historical movement references use
RESTRICT. Product deletion is not exposed by the application.
