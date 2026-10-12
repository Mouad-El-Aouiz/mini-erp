# Personal Demo Registration

## Scope

The opt-in /sign-up page and POST /api/demo/sign-up create a personal, isolated demo company for a new account. The native Better Auth sign-up endpoint remains disabled. Existing administrative and development provisioning utilities are unchanged.

Visitors supply a name, email, a 12–128 character password and consent to fictional data and expiration. Confirmation stays in the browser. Passwords use Better Auth hashing; account, credential, company, ADMIN membership and seed records are created in one transaction. A seed failure leaves no partially provisioned identity. Duplicate emails never reset credentials or attach the visitor to an existing company.

A successful registration does not create an authentication cookie. The visitor signs in through the normal Better Auth flow and selects the demo company. Their personal password can be changed normally; no shared account is used.

## Data and Limits

Each demo starts with two fictional customers, three hardware products and 50 physical units per product. No visitor receives access to pre-existing companies. The demo owner can test customer/product changes, taxes, stock, drafts, confirmation, complete delivery and cancellation.

- Access expires 24 hours after registration. Existing sessions cannot authorize access to an expired company.
- At most 100 customers, 100 products and 100 orders per demo, including seed records. Creation budgets are checked within serialized transactions.
- At most 1,000 manual stock adjustments. Delivery history remains bounded by the order and line limits.
- Provisioning additional members is denied; the workspace hides that action.
- At most 20 valid signup attempts per rolling hour globally, including duplicates and provisioning failures; up to 100 retained demo companies globally.
- The signup budget is stored in PostgreSQL, serialized before password hashing and shared across server instances. It is a global resource budget, not a per-person quota or comprehensive bot protection.
- Requests require the configured origin, application/json, a strict schema and a body no larger than 4 KiB.

Email ownership is not verified, email is not sent, and forgotten-password recovery is not provided. Do not treat demo email addresses as verified identities. No real customer or confidential business data should be entered. This does not turn the deployment into a production service or guarantee a zero cloud bill; resource quotas and account usage still need attention.

## Expiration and Cleanup

The hourly Demo cleanup workflow is gated by the repository variable DEMO_SIGNUP_ENABLED=true and uses the existing GitHub staging environment's direct Neon connection and host confirmation. It shares staging-release concurrency with setup and delivery. Scheduled jobs can be delayed; expiration blocks access even if deletion has not yet run.

The cleanup utility deletes only expired companies with paired demo metadata and one membership belonging to the recorded owner. It skips accounts with memberships in other companies and companies with extra members. It waits for in-flight authorized writes, deletes dependent business records in one transaction, then removes the demo owner and their credentials/sessions. Ordinary companies are never cleanup candidates. At most 100 companies are considered per run; old signup counters are also pruned.

Cleanup can be run manually from Actions after the same target checks. The CLI accepts only confirmed staging or isolated local test/CI databases and requires DEMO_CLEANUP_CONFIRM=mini-erp-demo-cleanup. It does not accept the development database. Deleted demos are not recoverable through this utility.

## Activation After Merge

1. Wait for main CI, migration deployment and staging delivery to succeed.
2. Set repository variable DEMO_SIGNUP_ENABLED=true in GitHub Actions settings to enable the hourly cleanup job. Verify a manual cleanup run succeeds before opening signup.
3. Set DEMO_SIGNUP_ENABLED=true privately in Vercel's Production environment for mini-erp-staging and redeploy the reviewed main revision through the established delivery process. Local .env can enable the feature separately.
4. Test /sign-up at the stable origin https://mini-erp-staging.vercel.app using a fresh account and fictional data.
5. Test from a private browser window without a Vercel session. Vercel Deployment Protection is separate from application authentication; if it blocks external visitors, explicitly configure public access for this demo project. Never publish an administrator account or a protection bypass token.

The feature is disabled when the application environment value is absent or not exactly true. Turning it off closes new signup but does not immediately revoke unexpired demo accounts. Keep cleanup enabled to remove expired records. Runtime feature flags do not require exposing secrets to the browser.

## Verification

Validation covers schema input, browser registration/sign-in, fictional seed records, a complete order, tenant isolation, refusal of extra members, duplicate preservation, transactional seed failure, concurrent creation budgets, expiry/session denial, cleanup safeguards and persisted signup limits. Use the isolated test database; do not run fixtures against staging.

Local validation: TypeScript, ESLint, production build, 38 unit tests and 147 browser/API tests passed. Separate runtime checks confirm that disabling signup closes its page/API and removes its home link, and that cleanup refuses an unconfirmed or development-database target.

Container validation also passed: all 12 migrations, migration replay, 6 staging-bootstrap integration tests, 9 browser smoke scenarios, startup guards, database-outage readiness/recovery and a read-only application restart.

The v1.0.0 tag remains unchanged. This feature is intended for the next compatible minor release after review, merge and live activation verification.
