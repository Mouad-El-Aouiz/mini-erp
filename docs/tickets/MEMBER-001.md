# MEMBER-001 — Company member administration

## Problem
Administrators currently depend on setup scripts to provision company members.
Provide a company-scoped interface for account creation and role/access updates.

## Acceptance criteria
- Only active administrators can list, create and update company members.
- Provision a new user, hashed credential and active membership atomically.
- Do not attach or reset an existing global account.
- Preserve at least one active administrator, including simultaneous changes.
- Reject stale updates and recheck actor permissions inside transactions.
- Deactivation preserves history and other-company access.
- Do not return or log credentials.
- Provide accessible forms, pagination and actionable error messages.
- Cover browser flows, authorization, conflicts and concurrency with tests.

## Verification
Unit validation tests and Playwright membership tests run in Application checks.
Existing Container checks continue to verify the packaged application.
No staging configuration, paid service or automatic deployment is required.
