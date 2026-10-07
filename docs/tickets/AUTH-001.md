# AUTH-001 — Add Email and Password Authentication

## Objective

Allow users to sign in and sign out using email and password.

## Scope

- Integrate Better Auth with Prisma and PostgreSQL.
- Add authentication models through a reviewed migration.
- Provide an English sign-in page.
- Manage sessions using the authentication library.
- Protect a minimal authenticated page.
- Provision a local development account without public registration.

## Acceptance Criteria

- Valid credentials establish a session.
- Invalid credentials show a generic error.
- Unauthenticated users cannot access the protected page.
- Signing out prevents further access to the protected page.
- Passwords are stored as hashes managed by the library.
- Authentication secrets remain outside Git.
- Local setup is documented.
- Relevant automated checks pass.

## Out of Scope

- Tenant membership and business permissions.
- Public registration.
- Social login.
- Email verification and password recovery.
- Production deployment.
## Implementation

- Added server-only Better Auth configuration with public registration disabled.
- Added User, Session, Account, and Verification models and migration.
- Added authentication API routes, a sign-in form, and a server-protected dashboard.
- Added sign-out and an idempotent local development account provisioning script.
- Added Chromium browser tests with isolated database fixtures.
- Extended CI with test-only authentication configuration and browser checks.
- Documented development setup and reproduction of the test environment.

## Recorded Validation

Validation performed locally on Windows with Node.js 22.23.2:

- Prisma schema validation and client generation passed.
- Both migrations applied successfully to an empty PostgreSQL 18 test database.
- TypeScript, ESLint, and production build passed.
- Six Chromium checks passed against the production build:
  - Anonymous dashboard access is denied.
  - Invalid credentials display a generic error for existing and unknown emails.
  - Login survives reload; logout invalidates the original session cookie.
  - Expired sessions are denied access.
  - Public registration fails without creating a user.
  - Stored password hashes verify the correct password and reject incorrect ones.
- Test fixture setup uses a SQL transaction and parameterized statements.
- Test accounts are removed after execution; development data is not used.
- Test requests honor the authentication rate limiter's retry delay.

GitHub Actions execution remains pending until this branch is pushed and a PR is opened.

## Dependency Audit Follow-up

npm audit currently reports nine high-severity dependency entries, including
transitive dependencies of Prisma tooling and the Next.js ESLint configuration.
No forced downgrade or automatic breaking dependency change was applied.
Review applicable advisories and compatible fixes in a separate dependency task.
