# Account Password Changes

## Scope

Authenticated users can open /account from the company dashboard, including
users without an active company membership. Anonymous visitors are redirected
to /sign-in.

## Request and Validation

The form uses the existing Better Auth POST /api/auth/change-password endpoint.
It submits currentPassword, newPassword and revokeOtherSessions: true.

The browser checks confirmation and prevents reusing the current password.
Better Auth verifies the current password and enforces 12 to 128 characters
server-side. Password values are not trimmed, logged or persisted in browser
storage. The confirmation field is not sent to the server.

The page uses a server-side session check; the interactive form is a separate
client component. The form disables submission while a request is pending,
labels every input and announces errors and success accessibly.

## Sessions and Persistence

In the installed Better Auth 1.7.7 implementation, a successful request updates
the credential account hash, deletes the user's old sessions and creates a new
session for the current browser. Other browsers must sign in again.

Prisma adapter transactions are enabled. This setting does not establish one
transaction around the entire password-change endpoint in this installed
version. Do not assume a failure midway through session replacement rolls back
the password update. An uncertain response requires checking sign-in with the
new password before retrying.

No database migration is required. Credentials are managed by Better Auth;
application code does not update password hashes directly.

## Verification

Browser and API tests cover anonymous access, client confirmation, unchanged
password rejection, incorrect current password, server length bounds, rejected
origins, hash verification, preserved password spaces, rotated cookies,
revoked old sessions, continued access and new-password sign-in.

Fixtures use only the dedicated local test or CI database and are removed after
the test suite.

## Deferred

Forgotten-password recovery, email delivery, mandatory initial password changes
and password-change failure atomicity hardening are separate work.
