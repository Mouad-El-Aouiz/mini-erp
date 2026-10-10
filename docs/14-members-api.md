# Company Members

## Scope
Only active company administrators may list, create, or update members.
Creation provisions a new global Better Auth user, a credential account with a
hashed initial password, and one active membership in a single transaction.
Public registration remains disabled. Share initial passwords privately.
Existing identities cannot be attached or reset by this endpoint; invitations,
self-service password changes, recovery and verified email delivery are deferred.

## Endpoints
| Method | Path | Success |
| --- | --- | --- |
| GET | /api/tenants/{tenantId}/members?page=1 | 200: members, page, pageSize, hasNextPage |
| POST | /api/tenants/{tenantId}/members | 201: member |
| PUT | /api/tenants/{tenantId}/members/{membershipId} | 200: member |

Member responses contain id, role, isActive, version and user name/email only.
They never contain hashes, plaintext passwords, sessions or account tokens.
Lists use 20 rows per page, ordered by user name then membership ID. Page accepts
1–9999. These are private administrator-only responses with no-store caching.

Creation accepts exactly name (1–200 trimmed characters), normalized email
(up to 254 characters), password (12–128 characters, preserved exactly), and role
(ADMIN or EMPLOYEE). New memberships start active with version 1.
Updates accept exactly version, role and isActive; names, email, credentials and
global account status cannot be changed through membership administration.

## Security and consistency
Writes require JSON and an exact trusted Origin as well as authentication.
Every query scopes membership IDs to the authorized company. Foreign IDs return
the same 404 as missing IDs. Employees cannot see the administration pages.

All membership mutations take a per-company PostgreSQL transaction advisory lock
(hashtextextended of the tenant ID with namespace seed 42001), then recheck and
hold the acting ADMIN membership with FOR SHARE. Updates lock the target row
FOR UPDATE. The advisory lock serializes company administrators before counting
active administrators, preventing concurrent removal of the final two.
At least one active ADMIN must remain. Self-demotion/deactivation is allowed
only when another active administrator exists; the interface returns to dashboard.

Versioned updates reject stale versions with 409. Actual changes increment
version; unchanged settings keep the current version. After uncertain network
results, reload before retrying. Creation does not have an idempotency key;
a retry with an existing email returns 409 without changing credentials.
The unique email constraint handles concurrent creation across companies.

Deactivation retains membership IDs and historical foreign-key references.
It revokes this company's permissions on subsequent access checks, including
existing sessions; it does not delete the user or revoke their other memberships.
Already-authorized writes complete before a conflicting membership update.
No deletion or global credential/session reset is exposed.
The advisory lock is released with commit/rollback and avoids conflicting with
tenant row locks used for tax/order transactions. Out-of-band SQL writers must
respect this locking and version protocol.

## Errors
400: invalid identifiers, page or JSON. 401: missing session. 403: insufficient
access or foreign Origin. 404: missing member. 409: stale version, last active
administrator or existing account. 415: wrong media type. 422: invalid fields.
Unexpected database failures remain server errors.

## Migration and release
Apply the committed add_membership_versions migration before deploying this
version. Existing memberships receive version 1; positive values are constrained.
Current earlier application versions do not write this column, so the additive
migration is compatible with the currently deployed version.
Verify administrator creation, employee login, role changes, deactivation and
last-administrator rejection on staging after deployment.
