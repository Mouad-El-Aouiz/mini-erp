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

## Order Workflow

Allowed transitions:

- Draft → Confirmed
- Confirmed → Delivered
- Confirmed → Cancelled

Delivered and cancelled orders are terminal states for the MVP.

Approved policy: confirmation reserves stock.
Confirmation, complete delivery and administrator cancellation are implemented.

Under this policy:

- Draft orders do not affect stock or reservations.
- Confirmation reserves quantities without decreasing physical stock.
- Available stock equals physical stock minus reserved quantities.
- Confirmation is rejected when available stock is insufficient.
- Complete delivery consumes the order's reservations
  and decreases physical stock.
- Cancellation releases the order's reservations
  without changing physical stock.

Repeating confirmation, delivery or cancellation must not
apply the same stock operation twice.

Delivery retains reservation records with CONSUMED status and a consumption timestamp.
It records one same-tenant delivery event and one negative movement per product.
Prices and monetary snapshots remain unchanged; partial quantities are not accepted.
Cancellation retains RELEASED reservations and a timestamp, plus one cancellation
event with administrator and required reason. It creates no physical movement.

Each transition must update the order and its stock records
atomically: either all changes succeed or none are retained.

Concurrent delivery and cancellation must not both succeed
for the same order.

## Tenant Isolation

Each tenant's business data must be isolated.

A tenant is a company using the SaaS.
A customer is a business purchasing hardware from that tenant.

The server checks role, tenant ownership and business rules
for every protected operation.

Administrator privileges apply only within the administrator's
authorized tenant.

## Roles and Permissions

| Action | Administrator | Employee |
| --- | --- | --- |
| Manage customers | Yes | Yes |
| View products and stock | Yes | Yes |
| Create and confirm orders | Yes | Yes |
| Record complete deliveries | Yes | Yes |
| Cancel confirmed orders before delivery | Yes | No |
| Change products and prices | Yes | No |
| Configure the tenant's tax rate | Yes | No |
| Adjust stock manually | Yes | No |
| Manage users and roles | Yes | No |

Customer deletion and archival rules remain to be defined. Draft deletion is deferred; drafts may be empty. Each product appears once per draft, with quantities from 1 to 1000000 and at most 100 lines.

## Draft Pricing

Capture the current catalog unit price when a product is
added to a draft order.

A later catalog price change must not silently update the draft.

Before confirmation, the server compares captured prices
with current catalog prices.

If a difference exists:

- Block confirmation without reserving stock.
- Display the previous and current prices.
- Require an explicit update of the draft prices.
- Recalculate the order totals.
- Recheck prices when confirmation is attempted again.

After confirmation, preserve the accepted unit prices,
tax rate and monetary totals. Also retain the customer company name, confirmation
timestamp and confirming membership. Confirmed orders are read-only through the application.
A changed tax settings version requires reloading and reviewing the preview before confirmation.

Negotiated prices and manual price overrides are outside
the initial scope.

## Currency and Tax

Use USD as the single currency.

Catalog prices exclude tax.
The approved demonstration tax rate is 10% and remains configurable.
Tax configuration supports 0–100%, with 0.01 percentage-point precision.

Calculate:

- Subtotal: sum of quantity multiplied by unit price.
- Tax: subtotal multiplied by the applicable tax rate.
- Total: subtotal plus the rounded tax amount.

The server calculates monetary totals rather than trusting
totals supplied by the browser.

Use integer cents or exact decimal values for monetary calculations.
Implemented draft previews use integer cents and calculate tax once on the subtotal, rounded half up to the nearest cent. The supported subtotal is at most 2147483647 cents.

Store the accepted tax rate and monetary totals when an order
is confirmed. Later tax configuration changes must not rewrite
confirmed orders.

The demonstration rate does not establish tax jurisdiction
or fiscal compliance.

## Deferred Features

- Supplier purchasing.
- Partial deliveries.
- Serial numbers and warranties.
- Returns.
- Complex discounts and negotiated prices.
- Online payments and paid subscriptions.
- Multiple currencies and currency conversion.
- Multiple tax rates and tax exemptions.
- Compliant invoicing.

## Open Questions

- Define final order numbering and fulfillment records.
- Define draft deletion or abandonment.
- Define customer duplicate handling, deletion and archival.

## Learning Objectives

- Translate business needs into verifiable rules.
- Distinguish confirmed decisions from assumptions.
- Document scope and maintain its history through Git.
- Review proposed changes before merging them.
- Prepare requirements for business logic, SQL transactions,
  authorization and meaningful tests.