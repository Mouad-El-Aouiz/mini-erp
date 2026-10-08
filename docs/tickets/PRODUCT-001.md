# PRODUCT-001 — Tenant product catalog

## Objective

Allow administrators to maintain their company's computer hardware catalog,
while employees can consult product identifiers and tax-exclusive USD prices.

## Acceptance criteria

- Active members can list and read only their tenant's products.
- Only ADMIN members can create and fully edit products.
- SKU is normalized to uppercase and unique within the tenant.
- Name is required; prices are nonnegative integer USD cents.
- Form decimal prices preserve cents exactly and reject extra decimals.
- Invalid payloads and untrusted origins produce useful errors without writes.
- Duplicate SKU writes, including concurrent requests, return 409.
- List, creation and editing pages provide accessible field labels and errors.
- Database guards reject malformed SKUs, blank names and negative prices.
- Migration applies to both existing local and empty test databases.
- Existing authentication, customer and development-setup checks still pass.

## Implementation

Product schema and migration; tenant-scoped data functions; GET/POST/PUT handlers;
list/create/edit pages; shared decimal and payload validation; documented API.
The page access guard, UUID/page schemas and transactional membership lock are
shared with customer management. Product writes recheck ADMIN under that lock.

## Verification

Run Prisma validation/generation, TypeScript, ESLint, unit tests, production build
and the full Playwright suite against the isolated PostgreSQL test database.
Verified locally:

- Prisma schema validation and client generation passed.
- All five migrations applied to an empty test database.
- TypeScript, ESLint and the production build passed.
- 13 unit tests passed.
- 36 Playwright browser/integration tests passed, including 10 product checks.
- Desktop and 375px mobile catalog/form views were visually inspected.
- Production dependency audit reported zero known vulnerabilities.

The existing CI workflow already discovers the new unit and browser tests.
The pull request must pass its GitHub checks before merge.

## Limits

No stock, orders, tax calculation, deletion or retirement in this change. Price
limit is PostgreSQL INTEGER's upper bound in cents. Pagination is offset based;
simultaneous edits use last-write-wins. No production deployment is performed.
