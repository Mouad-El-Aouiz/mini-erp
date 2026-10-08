# Data Model

Status: Tenant, authentication records, Membership, Customer, Product, InventoryBalance with physical/reserved quantities, manual StockMovement, Order/OrderItem, StockReservation and complete Delivery are implemented. DRAFT, CONFIRMED and DELIVERED are supported. The remaining entities describe proposed logical design. This document extends the business scope without approving its open business questions.

## Design Principles

- Use PostgreSQL 18 as the relational database.
- Use stable primary keys. Implemented tenants, memberships and customers use UUIDs; Better Auth user and authentication IDs use text. Types for remaining entities will be selected during implementation.
- Use required fields, foreign keys, uniqueness and check constraints alongside server validation.
- Every tenant-owned entity has a required tenant_id referencing Tenant.
- Use integer USD cents for monetary amounts. Draft calculations use exact BigInt intermediates and bounded safe-number responses.
- Store timestamps consistently; timezone and display formatting are separate concerns.
- Historical records use restricted deletion. Disposable derived zero balances may cascade with products; movements prevent deleting referenced products.

## Tenant

A company using the SaaS.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| name | Required, nonblank |
| created_at | Required timestamp |

## User

A person who can authenticate, independent of tenant-specific roles.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| email | Required; unique after a documented normalization policy |
| display_name | Required, nonblank |
| created_at | Required timestamp |

Better Auth manages credential hashes and database-backed sessions. Public registration is disabled. Account deactivation remains deferred; membership deactivation is separate.

## Membership

A user's role within a tenant.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| user_id | Required foreign key to User |
| role | ADMIN or EMPLOYEE |
| created_at | Required timestamp |

Unique (tenant_id, user_id). A user may belong to multiple tenants. The server validates membership in the active tenant on every protected operation. Revocation sets is_active to false without deleting the membership, preserving its stable identity for future historical actor references. Membership deletion is not implemented.

## TenantSettings

Implemented tax_rate_bps and tax_version live directly on Tenant. A separate settings record and settings audit actor remain future design.

| Field | Constraint or purpose |
| --- | --- |
| tenant_id | Primary key and foreign key to Tenant |
| currency | USD only in the MVP |
| tax_rate_bps | Required integer when explicitly configured |
| updated_at | Required timestamp |
| updated_by_membership_id | Same-tenant administrator who changed settings |

Implemented representation: basis points, where 100 basis points equal 1 percentage point and 1000 represent the demonstration rate of 10%. Supported rates are 0–10000, with 0.01 percentage-point precision. Zero is distinct from absent configuration. Only the tenant administrator can modify settings; a foreign key does not enforce that permission.

## Customer

Implemented: tenant-scoped listing, creation and full editing. Duplicate company names are allowed; deletion and archival are deferred. See [Customers API](04-customers-api.md).

A business purchasing hardware from a tenant.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| company_name | Required, nonblank |
| contact_name | Optional |
| email | Optional; validate format when provided |
| phone | Optional text, not a numeric quantity |
| address | Optional text for the initial design |
| created_at | Required timestamp |
| updated_at | Required timestamp |

Customer names are not automatically unique. Duplicate handling and archival/deletion remain open. A customer contact is not automatically a User.

## Product

Implemented: tenant-scoped listing and reading for active members; creation and full editing for administrators. See [Products API](05-products-api.md).

A tenant's hardware catalog entry.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| sku | Required, unique within the tenant |
| name | Required, nonblank |
| unit_price_cents | Required, nonnegative integer; excludes tax |
| created_at | Required timestamp |
| updated_at | Required timestamp |

Unique (tenant_id, sku) and (tenant_id, id). SKUs are trimmed uppercase ASCII identifiers of at most 64 characters. Prices range from 0 to 2147483647 USD cents. Index (tenant_id, name, id) supports ordered listing. SQL CHECK constraints enforce SKU format, nonblank names and nonnegative prices.

A SKU identifies a catalog product, not an individual serialized device. Serial numbers and warranties are deferred. Future historical order references must prevent deleting a referenced product; define product retirement separately.

## Order

Implemented draft preparation and DRAFT → CONFIRMED. Confirmation stores the accepted tax rate/version, subtotal, rounded tax, total, customer company name, timestamp and same-tenant confirming actor. Delivery records are implemented; cancellation fields remain proposed. See [Draft orders API](07-draft-orders-api.md) and [Order confirmation](08-order-confirmation-api.md).

A customer's order within one tenant.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| customer_id | Required same-tenant reference to Customer |
| status | DRAFT, CONFIRMED or DELIVERED; CANCELLED deferred |
| currency | USD |
| subtotal_cents | Accepted subtotal snapshot; required after confirmation |
| accepted_tax_rate_bps | Accepted rate snapshot; required after confirmation |
| tax_cents | Accepted rounded tax snapshot; required after confirmation |
| total_cents | Accepted total snapshot; required after confirmation |
| created_by_membership_id | Required same-tenant actor |
| confirmed_by_membership_id | Required after confirmation |
| confirmed_tax_version | Reviewed settings version, required after confirmation |
| customer_company_name | Accepted company name, required after confirmation |
| cancelled_by_membership_id | Required when cancelled |
| created_at | Required timestamp |
| updated_at | Required timestamp |
| confirmed_at | Required after confirmation |
| cancelled_at | Required when cancelled |

Snapshot amounts are nonnegative and total_cents equals subtotal_cents plus tax_cents. Draft previews are derived from captured line prices and current settings; they are not confirmed financial records. PostgreSQL checks require all snapshot fields to be absent for DRAFT and complete/consistent for CONFIRMED and DELIVERED. total_cents uses BIGINT, bounded by the supported subtotal and tax rate, and serializes as a safe JSON number.

Proposed transitions: DRAFT to CONFIRMED, then CONFIRMED to DELIVERED or CANCELLED. The server enforces legal transitions; a status check constraint alone does not enforce the workflow.

A confirmable order must contain at least one line. Customer details may change; document snapshots for compliant invoicing are deferred.

## OrderItem

Implemented: captured product name/SKU/price, quantity, same-tenant order/product references and unique product per draft. Stable line IDs survive quantity changes.

One product and quantity within an order.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| order_id | Required same-tenant reference to Order |
| product_id | Required same-tenant reference to Product |
| quantity | Required positive integer |
| unit_price_cents | Required nonnegative captured price |

Implemented uniqueness: (tenant_id, order_id, product_id). Repeated additions in the UI increase the existing quantity; duplicate IDs in API input are rejected.

Order version checks reject stale edits. Creation request IDs are tenant-unique and retain the initial request fingerprint. Per-tenant tax_rate_bps defaults to 1000 and tax_version protects updates. Draft totals are derived; confirmed totals are stored and are not recalculated from later settings.

Capture the catalog price when adding a line. A changed catalog price blocks confirmation until the user explicitly refreshes prices. Recheck at confirmation. Freeze lines and accepted totals after confirmation.

## InventoryBalance

Implemented: one physical/reserved balance per product and tenant, at one stock location. See [Inventory API](06-inventory-api.md).

| Field | Constraint or purpose |
| --- | --- |
| tenant_id | Required tenant ownership, enforced through the composite product foreign key |
| product_id | Required same-tenant reference to Product |
| physical_quantity | Required nonnegative integer |
| reserved_quantity | Required integer, from zero to physical_quantity |
| updated_at | Required timestamp |

Primary key (tenant_id, product_id), with a same-tenant product foreign key. physical_quantity is an integer from 0 to 2147483647. Catalog creation initializes zero; manual adjustments update it atomically with movements.

SQL requires 0 <= reserved_quantity <= physical_quantity. Derive available_quantity as physical_quantity minus reserved_quantity; do not store a third independently mutable balance.

These balances are transactionally maintained summaries, not independent facts. Tests compare reserved quantity with reservation rows. Operational reconciliation will compare physical quantity with stock movements and reserved quantity with outstanding reservations.

## StockReservation

Implemented allocation of stock to a confirmed order line. Confirmation creates
one reservation per product, matching the line quantity, in the same transaction
as the reserved balance and accepted snapshots.

| Field | Constraint or purpose |
| --- | --- |
| tenant_id | Same tenant as order, product and line |
| order_id | Required same-tenant order |
| product_id | Required product on the referenced order line |
| quantity | 1–1000000, matches the confirmed line in the application |
| created_at | Reservation timestamp |
| status | ACTIVE or CONSUMED |
| consumed_at | Required only for CONSUMED |

Primary key (tenant_id, order_id, product_id). Composite foreign keys reference
Order, Product and the exact OrderItem. SQL rejects duplicate reservations and
invalid quantities. The counter/row aggregate equality is maintained by the
application transaction, not a SQL aggregate constraint.

Reservations have ACTIVE or CONSUMED status. Delivery retains every reservation
with consumed_at set, while decreasing reserved quantities. SQL enforces status/date
consistency. Cancellation and reservation release remain deferred.

## Delivery

Implemented: complete delivery by either active role with safe retries and an
expected confirmed-order version. See [Delivery API](09-order-delivery-api.md).

The single complete delivery of a confirmed order.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| order_id | Required same-tenant reference to Order |
| delivered_by_membership_id | Required same-tenant actor |
| delivered_at | Required timestamp |

Unique (tenant_id, order_id) enforces at most one delivery per order. Fulfilled quantities are the frozen order lines; no partial-delivery quantities are accepted. Delivery and inventory updates commit together.

## StockMovement

Implemented: manual adjustments and complete delivery movements, append-only through the application, with stable same-tenant actor references. Privileged direct SQL is not blocked from changing history.

| Field | Constraint or purpose |
| --- | --- |
| id | Primary key |
| tenant_id | Required foreign key to Tenant |
| product_id | Required same-tenant reference to Product |
| request_id | Implemented UUID, unique with tenant_id; repeated identical requests apply once |
| quantity_delta | Required nonzero signed integer |
| kind | ADJUSTMENT or DELIVERY |
| order_id | Required for DELIVERY, absent for ADJUSTMENT; references the same-tenant Delivery and exact OrderItem |
| reason | Required, nonblank for every movement |
| recorded_by_membership_id | Required same-tenant actor |
| created_at | Required timestamp |

Positive deltas increase physical stock; negative deltas decrease it. Delivery deltas equal the negative confirmed line quantities. Validate that referenced line, delivery, order and product belong together.

Enforce one delivery movement per delivered order line, using a conditional uniqueness constraint or an equivalent database-specific design. Confirmation and cancellation do not create physical movements.

Record initial stock and administrator adjustments as movements in the same transaction as balance changes. Implemented adjustments reject negative physical stock. Adjustments also reject stock lower than active reservations. Correct mistakes through compensating movements, not edits to history.

## Tenant-Safe Relationships

For tenant-owned entities with an id primary key, also declare unique (tenant_id, id) where needed as a composite foreign-key target.

For example, Order references Customer through (tenant_id, customer_id), not customer_id alone. Apply the same pattern to order lines, deliveries, actor memberships and inventory references.

Where relationships include more than tenant ownership, use additional composite references or transactional validation. A reservation must reference a line in its own order; a delivery movement must reference that delivery's order line and product.

Composite foreign keys prevent cross-tenant associations. They do not authorize reads or writes; every server operation must still check membership, role and tenant scope. Row-level security may be evaluated after selecting the database.

## Relationship Summary

- Tenant has many Memberships, Customers, Products and Orders.
- User has many Memberships.
- Tenant has at most one TenantSettings record.
- Customer has many Orders in the same tenant.
- Order has many OrderItems in the same tenant.
- Product has many OrderItems and one InventoryBalance.
- OrderItem has at most one StockReservation under the proposed lifecycle.
- Order has at most one Delivery.
- Delivery has one StockMovement per fulfilled OrderItem.
- Product has many StockMovements.

## Transaction and Concurrency Requirements

Confirmation: validate actor, state, nonempty lines, current catalog prices, explicit tax settings and available stock; create reservations, update balances, freeze prices/tax/totals and change status in one transaction.

Delivery: validate actor and CONFIRMED state; create the complete delivery, consume reservations, update physical and reserved balances, append movements and set DELIVERED in one transaction.

Cancellation: validate tenant administrator and CONFIRMED state; release reservations, decrease reserved balances and set CANCELLED in one transaction without changing physical stock.

Use database-supported locking or conditional updates so competing transitions and stock allocations cannot both pass stale checks. Confirmation and delivery use PostgreSQL row locks in a stable product UUID order and a 15-second transaction timeout. Unexpected failures require an explicit retry; no automatic transaction retry is implemented.

Price and tax snapshots must be consistent at confirmation, including concurrent catalog/settings changes. A check performed outside the transaction is insufficient.

## Proposed Indexes

Start with indexes supporting actual queries; verify query plans before adding more.

- Membership uniqueness on (tenant_id, user_id).
- Product uniqueness on (tenant_id, sku).
- Order lookup on (tenant_id, customer_id, created_at).
- Order filtering on (tenant_id, status, created_at).
- OrderItem lookup on (tenant_id, order_id).
- Active reservation lookup scoped by tenant and order.
- StockMovement history on (tenant_id, product_id, created_at).

Foreign-key indexing behavior varies by engine; inspect it rather than assuming automatic indexes.

## Verification Scenarios for Implementation

- Reject a relationship linking an order to another tenant's customer or product.
- Deny another tenant's reads and writes, including administrator requests.
- Reject duplicate membership and same-tenant SKU; allow the same SKU in different tenants.
- Reject invalid quantities and monetary values.
- Confirming beyond available stock preserves all records and balances.
- Concurrent confirmations cannot overreserve stock.
- Catalog changes block confirmation until explicit price refresh.
- Confirmed prices and tax totals survive later catalog/settings changes.
- Repeated confirmation, delivery or cancellation has no duplicate effect.
- Delivery failure on any line rolls back all changes.
- Concurrent cancellation and delivery produce one consistent terminal state.
- Reconcile balances against movements and active reservations.

## Open Decisions Before Migrations

- Identifier types for remaining entities and production authentication recovery/verification workflows.
- Reservation closure records for delivery and cancellation.
- Final order numbering and invoice requirements.
- Account/membership deactivation and historical actor retention.
- Customer/product archival, duplicate handling and draft abandonment.
- Initial inventory and adjustment workflow details.

## Competency Mapping

- 3: business invariants and legal order transitions.
- 5: primary/foreign keys, relationships, constraints, transactions and indexes.
- 6: separate identity, tenancy, commercial records and inventory history.
- 7: derive meaningful failure, concurrency and authorization tests.
- 8: deliver this design through a branch, reviewed diff and pull request.
- 12: combine server authorization with tenant-safe database relationships.
- 13: plan indexes from query patterns and measure before optimizing.
- 16: record assumptions, decisions and implementation requirements.
- 17: exact monetary representation and derived inventory quantities.
- 19: review assistant-generated design against the agreed business scope.

This design is not evidence that these competencies are mastered. Verification requires implementation and explainable results. The other competency areas remain part of later delivery steps.
