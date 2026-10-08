# Draft Orders and Tax Settings API

## Scope and roles

Active ADMIN and EMPLOYEE members can list, create and edit drafts belonging to
their tenant. Only ADMIN members can update the tenant tax rate. Every endpoint
checks session and active membership; writes require Origin matching
BETTER_AUTH_URL. All responses use Cache-Control: private, no-store.

DRAFT and CONFIRMED are supported. Confirmation/reservations have a separate
[contract](08-order-confirmation-api.md). Delivery, cancellation and draft deletion
are not exposed. A draft
can be empty and can contain quantities exceeding current stock: drafts never
reserve or consume stock.

## Endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | /api/tenants/{tenantId}/orders?page=1 | orders, page, pageSize, hasNextPage |
| POST | /api/tenants/{tenantId}/orders | order: id, replayed |
| GET | /api/tenants/{tenantId}/orders/{orderId} | order detail: current draft preview or accepted confirmed snapshots |
| PUT | /api/tenants/{tenantId}/orders/{orderId} | order: id, new version |
| POST | /api/tenants/{tenantId}/orders/{orderId}/refresh-prices | order: id, new version |
| GET | /api/tenants/{tenantId}/tax-settings | taxRateBps, version |
| PUT | /api/tenants/{tenantId}/tax-settings | taxRateBps, new version |

Lists use 20 records per page, ordered by updatedAt/id descending. A single
positive page parameter accepts 1–9999 and defaults to 1. Selection controls use
the existing paginated customer/product endpoints; records beyond page 1 remain
selectable. Pages between requests are not a retained database snapshot.

## Create an empty draft

```json
{ "requestId": "da1d7c01-1c94-40bf-9fa6-37a8ce625722", "customerId": "77a217b6-43b2-4412-907d-b122a62e85f6" }
```

Both fields require UUID syntax and normalize to lowercase. Customer must belong
to the authorized tenant. The server assigns ID, DRAFT status, creator membership,
version 1 and timestamps. No initial prices, totals or status may be supplied.

Creation is idempotent within tenant/requestId: a new resource returns 201;
an identical customer/actor replay returns 200 and the same order ID. Changing
the initial customer or actor with that key returns 409. A later edit of the
order's customer does not change the creation request fingerprint. The browser
retains the creation key after a lost response if the customer is unchanged.

## Replace editable draft content

```json
{
  "version": 1,
  "customerId": "77a217b6-43b2-4412-907d-b122a62e85f6",
  "items": [{ "productId": "ef5776ec-a1a9-4b47-bf84-65f1d6899b04", "quantity": 2 }]
}
```

PUT replaces the complete editable customer/line selection. Missing fields fail
validation; an empty items array removes all lines. At most 100 distinct product
lines, each quantity 1–1000000. Duplicate product IDs are rejected by the API;
the UI increases the existing line quantity when adding that product again.
Products and customer must belong to the same tenant as the order.

New lines capture the current catalog price, name and SKU on the server.
Existing lines retain those snapshots during quantity/customer edits. A removed
line added again after saving is a new capture. Client prices and totals are
rejected. Stable line IDs survive quantity updates. Subtotal must not exceed
2147483647 cents (21474836.47 USD).

Expected version is required. The transaction locks current membership and the
order, rejects an outdated version with 409, validates references and locks
products in deterministic ID order, applies all line changes and increments
version. A failure rolls back the whole edit. Neither normal edits nor price
refreshes affect inventory. Versioned mutation responses are not idempotent
replays: after an uncertain response, reload before editing/retrying.

## Read and explicitly refresh prices

The detail response includes captured unitPriceCents, productName/productSku,
currentUnitPriceCents, priceChanged and lineTotalCents for each line. Current
catalog prices do not silently replace snapshots. Draft quantity, captured prices,
current catalog comparison and tax settings are read from one Repeatable Read
transaction. The record includes current customer details, actor ID, timestamps,
version and taxVersion; customer data is not an invoice snapshot.

```json
{ "version": 2, "prices": [{ "productId": "ef5776ec-a1a9-4b47-bf84-65f1d6899b04", "unitPriceCents": 15000 }] }
```

Price refresh requires an acknowledgment for every current line, matching its
current catalog price. Old versions, missing/extra acknowledgments and catalog
changes since review return 409 without partial updates. Prices are locked during
acceptance. This endpoint updates captured prices only, retaining name/SKU
snapshots and increasing version. Save unsaved edits before refreshing prices.
Order confirmation rechecks prices again inside its transaction.

## Tax and exact totals

The tenant starts at 1000 basis points = 10.00%. One basis point is 0.01 percentage
point. The supported rate is 0–10000 basis points (0–100%), editable by ADMIN only:

```json
{ "version": 1, "taxRateBps": 1234 }
```

Tax configuration has its own expected version to avoid lost updates. Existing
drafts use the current tenant rate on their next server read. Tax is calculated
once on the subtotal and rounded half up to the nearest cent. Integer BigInt
arithmetic avoids floating-point multiplication and accumulated rounding errors.

subtotal = sum(quantity × captured price)

tax = floor((subtotal × taxRateBps + 5000) / 10000)

total = subtotal + tax

All serialized monetary values are exact safe integer JSON numbers. At the maximum
supported subtotal and 100% tax, total is 4294967294 cents. Draft previews are
derived rather than stored as final financial records. Confirmation freezes accepted prices, tax rate and totals. The demonstration rate establishes
no tax jurisdiction or fiscal compliance.

## Errors and limits

400 invalid route ID, JSON or pagination; 401 missing session; 403 unauthorized
membership/role or origin; 404 unavailable order; 409 stale version, conflicting
creation key, unreviewed prices or excessive subtotal; 415 wrong Content-Type;
422 invalid fields or unavailable same-tenant references; 405 unsupported methods.
Unexpected failures follow the framework's server-error path.

SQL composite foreign keys enforce tenant-safe customer, product, actor and line
ownership. Checks protect quantities, captured prices, tax bounds and versions.
Referenced customers/products/memberships use RESTRICT. The 100-line aggregate
limit and monetary subtotal limit are application rules, not SQL aggregate checks.

Confirmation and reservations are implemented; see [Order confirmation](08-order-confirmation-api.md).
Search, draft deletion/abandonment, final order numbering, delivery/cancellation,
fiscal invoicing, exports and deployment remain deferred.
