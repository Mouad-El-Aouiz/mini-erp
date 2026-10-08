# CUSTOMER-001 — Business Customer Management

## Objective

Let active tenant members manage business customer contact details without accessing another tenant's records.

## Scope and Permissions

- Active ADMIN and EMPLOYEE members may list, create, read and update customers of their tenant.
- A customer is a purchasing business, not an authenticated user or a SaaS tenant.
- Company name is required; contact name, email, phone and address are optional.
- Duplicate company names are allowed.
- Customer deletion and archival are deferred.

## Database

- Add Customer with required tenant ownership, timestamps, UUID identifiers and a restrictive foreign key.
- Keep unique (tenant_id, id) for future same-tenant order references.
- Index (tenant_id, company_name, id) supports the ordered company list.
- The SQL customers_company_name_not_blank constraint rejects empty or whitespace-only names.
- Prisma's updatedAt is maintained through Prisma writes; direct SQL must supply it.

## Validation

- Trim leading and trailing whitespace; convert omitted, blank or null optional fields to null.
- Limits: company name 200, contact name 150, email 254, phone 50, address 1000 characters.
- Validate email syntax; existence and delivery are not verified.
- Preserve phone formatting as text.
- Reject unexpected fields, including tenantId, id and createdAt in request bodies.
- Reuse Zod rules in the form and server, with independent server validation.

## Security and Transactions

- Derive user identity from the verified session and tenant ownership from the verified membership.
- Scope customer reads and writes by tenant; an ID alone never authorizes access.
- Reads additionally filter through the active membership.
- Mutations require the exact canonical Origin configured by BETTER_AUTH_URL and JSON Content-Type.
- The Origin policy is for same-site cookie-authenticated clients; it does not replace authentication or authorize arbitrary API clients.
- Mutations hold a shared PostgreSQL lock on the active membership until commit. A concurrent membership revocation waits for an already-authorized write; subsequent writes are denied.
- API responses use private, no-store. Authorization is performed inside each page and handler, not only in a layout.

## Interface

- Workspace link to a paginated customer list; list and forms show the current company name.
- New and edit forms with required/optional labels, associated field errors and keyboard focus styles.
- Pending submission state prevents repeated submissions while a request is in progress.
- Success messages after save; error responses preserve entered values.
- Empty-list and invalid-page states; unauthorized pages use the neutral unavailable view.
- Layout supports narrow screens.

## Validation Results

Verified locally on 2026-10-08 with Node.js 22.23.2:

- Prisma validation and client generation passed; all four migrations applied to an empty PostgreSQL 18 test database.
- TypeScript, ESLint and production build passed.
- All 10 unit tests passed: normalization, input types, limits, email, pagination and request origins.
- All 26 Playwright integration/browser checks passed, including 16 existing checks and 10 customer checks.
- Employees and administrators can create customers; interface creation, editing, clearing optional values, pagination and reload were verified.
- Anonymous, revoked and cross-tenant access were rejected; rejected writes left customer data unchanged.
- JSON syntax, content type, unexpected fields, foreign/missing origins and SQL constraints were checked.
- Form values survive server and network errors.
- A controlled concurrency test verified that membership revocation waits for an authorized write to commit, then denies subsequent writes.
- Customer list and form screenshots were inspected on desktop and mobile; a narrow viewport overflow check passed.
- Production dependency audit reported zero known vulnerabilities. The existing development-tooling advisory is tracked separately in SEC-001.
- Temporary users, tenants, memberships and customers were removed; disposable test databases and service volumes were removed.
- `git diff --check` passed.

GitHub Actions must pass on the pull request before merge.

## Limitations

- PUT replaces the full editable record; omitted optional fields are cleared to null. PATCH is not implemented.
- Offset pagination uses a deterministic order, not a snapshot: concurrent inserts can shift page contents.
- Concurrent customer edits use last-write-wins; edit conflict detection is deferred.
- Search, customer archival, orders and production deployment are deferred.
