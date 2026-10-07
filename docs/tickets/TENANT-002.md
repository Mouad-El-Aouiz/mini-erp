# TENANT-002 — Company Selection and Workspace Navigation

## Objective

Let authenticated users choose an accessible company and open its protected workspace.

## Scope

- List only active memberships for the session's user on `/dashboard`.
- Display company names and tenant-specific Administrator or Employee roles.
- Order companies by name, with tenant ID as a stable tie-breaker.
- Provide a helpful empty state when no active membership exists.
- Navigate to `/tenants/[tenantId]`, with company identity, role, company switching and sign-out.
- Reuse the server access check and read the company through an active membership filter.
- Redirect anonymous users to sign-in.
- Show a neutral unavailable page for invalid, missing or unauthorized workspaces.
- Use responsive layout, semantic lists, descriptive links and keyboard focus styles.

## Design Decisions

- The route URL identifies the current company. No active-company cookie or stored preference is added.
- Selection and workspace pages are Server Components; only the existing sign-out control requires client code.
- Company links disable prefetching to avoid preparing stale membership views before navigation.
- Company data is not placed in a shared application cache.
- Access checks are performed in the page rather than only in a layout.
- This remains a workspace shell; role labels do not implement business permissions.

## Validation

Verified locally on Windows with Node.js 22.23.2:

- All three committed migrations applied to an empty PostgreSQL 18 test database.
- Prisma client generation, TypeScript, ESLint and production build passed.
- All eleven Chromium tests passed (33.0 seconds), including the eight existing checks.
- Company selection lists only active memberships and shows both role labels.
- Navigation, switching and workspace reload preserve the intended company.
- Cross-tenant, inactive and malformed workspace access show the unavailable page.
- Revoking membership denies a workspace reload and removes the company from the selector.
- Empty membership lists and anonymous workspace redirects are covered.
- A 375px viewport check found no horizontal overflow in the selector.
- Desktop selector and mobile selector/workspace screenshots were inspected using temporary test fixtures.
- Temporary users, memberships and tenants were removed; the disposable test service and its volumes were removed.
- `git diff --check` passed.

GitHub Actions must pass on the pull request before merge.

## Out of Scope

- Company creation, invitations and membership management.
- Persistent company preferences or automatic single-company selection.
- Products, customers, orders and other business modules.
- Production deployment.
