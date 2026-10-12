# Vercel Staging Deployment

## Scope

Deploy the personal, non-commercial mini-ERP on Vercel Hobby using the
existing Neon mini_erp_staging database. Vercel calls the primary deployment
Production; this project and database still represent our staging environment.
Do not provision another database or upgrade the account to a paid plan.

Vercel builds Next.js directly. Docker remains available for local development
and container verification. Node.js 22.x should be selected in project settings.

## Build Configuration

The committed vercel.json uses npm ci and npm run build:vercel.
That script generates Prisma Client before next build, including on fresh or
cached cloud builds. Generation does not apply migrations or create users.
The generated client is excluded from Git. The .vercelignore file also excludes
local environment files, credentials, generated artifacts and test reports from
CLI uploads; Git exclusions alone do not define the Vercel upload boundary. Functions run in cle1 (us-east-2),
near the existing Neon database. The framework manages the output directory.

## Account and Project

Use the official Vercel CLI with an authenticated personal Hobby account.
Inspect available teams and projects before selecting a target. Verify the
linked owner and project before setting environment values or deploying.
The local .vercel directory is ignored by Git.

Use a dedicated project named mini-erp-staging. Initial creation and linking
may require an explicit account selection. Do not enter tokens in chat or
command-line flags. Complete login directly in the browser when requested.

## Environment Configuration

Configure these values privately for the project's Production environment:

- DATABASE_URL: pooled SSL connection to the existing mini_erp_staging database.
- BETTER_AUTH_SECRET: a new high-entropy secret of at least 32 characters.
- BETTER_AUTH_URL: the exact HTTPS origin assigned to this project.

Do not replace local development settings or reuse local/test secrets.
Do not expose database credentials to unreviewed PR previews. Preview databases
and authentication origins must be isolated before enabling preview releases.
The stable application origin and deployment-specific preview URLs are different;
verify authentication on the configured stable origin.

## Initial Release

1. Merge the configuration PR after the GitHub CI checks pass.
2. Confirm the exact main commit, Hobby account, project and environment.
3. Verify environment configuration and the existing database initialization.
4. Deploy the reviewed commit using the authenticated CLI.
5. Confirm the deployed commit and READY status, then check /api/health.
6. Sign in, select the company and verify a disposable company-scoped flow.
7. Inspect runtime errors before considering the release complete.

The application uses its existing self-managed Better Auth and Prisma/pg driver.
No authentication or database-provider migration is part of deployment.

## CI and Delivery

GitHub Actions runs Application checks and Container checks on isolated databases.
The staging-deploy.yml workflow waits for successful push CI on main from this
repository. Repository variable STAGING_CD_ENABLED must equal true.
Native Vercel Git deployments remain disabled in vercel.json; GitHub Actions
provides the deployment gate. PR CI and manually dispatched CI do not trigger delivery.

The GitHub staging environment supplies VERCEL_TOKEN and STAGING_DATABASE_URL
as secrets, plus VERCEL_ORG_ID, VERCEL_PROJECT_ID and STAGING_DATABASE_HOST as
variables. The direct Neon connection is used for migrations; Vercel's private
Production environment supplies the pooled application connection and auth settings.
The manual staging setup workflow remains responsible for optional initial bootstrap.

The workflow checks out the exact tested commit and verifies the configured owner
and project against its explicit staging target. It skips a commit superseded on
main, validates the database destination, and applies committed migrations. It
then deploys a Production-target candidate with --skip-domain and verifies its
/api/health response before changing the stable domain.

After another main-commit check, the workflow verifies the candidate identity,
owner, project and READY status, promotes it through the team-scoped Vercel API,
and checks that the stable domain points to the candidate and reports readiness.
The Actions summary records the commit and candidate URL. The stable origin is
https://mini-erp-staging.vercel.app; use it for sign-in.

Setup and delivery share the staging-release concurrency group. Migrations run
before candidate promotion, so they must remain compatible with the currently
live application, including when a candidate fails or becomes superseded.
Do not run migrations from the build command. A deployment rollback does not
undo database changes. The readiness endpoint checks connectivity; it does not
replace complete application acceptance tests.

## Limits and References

Hobby is intended for personal non-commercial projects and has usage quotas.
Keep demonstration data and stay within the included limits. Live deployment,
authentication and runtime behavior must be verified after account linking.

- [Hobby plan](https://vercel.com/docs/plans/hobby)
- [Git configuration](https://vercel.com/docs/project-configuration/git-configuration)
- [Function regions](https://vercel.com/docs/regions)
- [Prisma Client generation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client)
