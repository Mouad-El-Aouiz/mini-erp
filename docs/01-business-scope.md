# Business Scope

## Purpose

Build a multi-tenant SaaS for companies selling computer
hardware exclusively to business customers.

## Confirmed Decisions

- Stack: TypeScript, Next.js and Node.js.
- All project content uses English.
- Currency: USD.
- Catalog prices exclude tax.
- Configurable demonstration tax rate: 10%.
- Only administrators can configure the tax rate.
- Orders are delivered after confirmation.
- Each order is delivered completely in one delivery.
- Administrators and employees can confirm and deliver orders.
- Only administrators can cancel confirmed orders before delivery.
- Cancellation releases reservations without changing physical stock.
- Delivered orders cannot be cancelled.
- Drafts retain their captured product prices.
- Catalog price differences require an explicit draft update
  before confirmation.
- Confirmed orders retain their accepted prices and totals.

## Proposed MVP

- Authentication and tenant membership.
- Administrator and employee roles.
- Business customer directory.
- Product catalog.
- Orders.
- Stock reservations and stock movements.
- One stock location per tenant.

## Proposed Order Workflow

Draft → Confirmed → Delivered
                  → Cancelled

Confirmation reserves stock.
Delivery consumes reservations and decreases physical stock.
Cancellation releases reservations.

## Tenant Isolation

Each tenant's business data must be isolated.
The server checks role, tenant ownership and business rules
for every protected operation.

## Deferred Features

- Supplier purchasing.
- Partial deliveries.
- Serial numbers and warranties.
- Returns.
- Online payments and paid subscriptions.
- Compliant invoicing.

## Open Questions

- Confirm the stock reservation policy.
- Define monetary rounding and tax rate limits.
- Define draft deletion and customer duplicate handling.

## Learning Objectives

- Translate business needs into verifiable rules.
- Distinguish confirmed decisions from assumptions.
- Document scope and maintain its history through Git.