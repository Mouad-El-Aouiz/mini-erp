# Vercel Staging Deployment

## Scope

Deploy the educational, non-commercial mini-ERP on Vercel Hobby using the
existing Neon mini_erp_staging database. Vercel calls the primary deployment
Production; this project and database still represent our staging environment.
Do not provision another database or upgrade the account to a paid plan.

Vercel builds Next.js directly. Docker remains available for local development
and container verification. Node.js 22.x should be selected in project settings.

## Build Configuration

The committed vercel.json uses npm ci and npm run build:vercel.
That script generates Prisma Client before next build, including on fresh or
cached cloud builds. Generation does not apply migrations or create users.
The generated client is excluded from Git. Functions run in cle1 (us-east-2),
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

GitHub Actions continues to run Application checks and Container checks against
isolated test databases. Automatic Git deployments are disabled in vercel.json
until a release gate and isolated preview configuration are established.
An initial Dashboard import can create a deployment even when Git push deployments
are disabled; configure private values before importing or use controlled CLI setup.

This first step is manual delivery after successful CI, not an automated CD pipeline.
Do not claim that Vercel automatically waits for GitHub CI. Configure and verify
an explicit deployment gate before enabling unattended releases.

Schema changes still use the manual staging setup workflow and reviewed committed
migrations. Do not run migrations from a build command. Use backward-compatible
changes while an older application is live. Rolling back a deployment does not
undo database changes.

## Limits and References

Hobby is intended for personal non-commercial projects and has usage quotas.
Keep demonstration data and stay within the included limits. Live deployment,
authentication and runtime behavior must be verified after account linking.

- [Hobby plan](https://vercel.com/docs/plans/hobby)
- [Git configuration](https://vercel.com/docs/project-configuration/git-configuration)
- [Function regions](https://vercel.com/docs/regions)
- [Prisma Client generation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client)
