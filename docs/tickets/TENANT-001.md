# TENANT-001 — Tenant Memberships and Read Access

## Scope

- Link users to tenants through memberships.
- Support ADMIN and EMPLOYEE roles per tenant.
- Allow membership deactivation without deleting the record.
- Protect GET /api/tenants/[tenantId] using the authenticated session
  and an active membership.
- Return only the tenant ID, name, membership ID and role.

## Database Constraints

- Unique membership per tenant and user.
- Required references to an existing tenant and user.
- Referenced tenants and users cannot be deleted.
- Default role: EMPLOYEE.
- Default membership status: active.

## Validation

- Prisma validation, migration application and client generation passed.
- TypeScript, ESLint and production build passed.
- Eight authentication and tenant-access tests passed.
- Access to another tenant is denied, including for administrators.
- Deactivated memberships are denied access with an existing session.
- Six SQL constraint checks passed; temporary data was rolled back.

## Limitations

- At completion of this ticket, no tenant-selection or membership-management interface was implemented. Company selection is addressed by [TENANT-002](TENANT-002.md).
- No administrator-only business operation implemented yet.
- Authorization must be applied to every future tenant-owned operation.