# Staging Database Setup

## Scope

Neon hosts the separate mini_erp_staging PostgreSQL database.
Local development and test databases remain independent.
Application hosting is configured separately.

## GitHub Environment

Create a GitHub environment named staging.

Configure these environment secrets:

- STAGING_DATABASE_URL: direct Neon connection to mini_erp_staging with SSL.
- STAGING_ADMIN_PASSWORD: unique administrator password, 12-128 characters.

Configure these environment variables:

- STAGING_DATABASE_HOST: exact direct Neon hostname.
- STAGING_ADMIN_EMAIL: initial administrator email.
- STAGING_ADMIN_NAME: initial administrator display name.
- STAGING_TENANT_ID: stable company UUID.
- STAGING_TENANT_NAME: initial company name.

Never commit or publish credentials. Restrict deployment branches to main and
add a reviewer when supported by your GitHub account and repository.

## Initial Setup

Open GitHub Actions -> Staging database setup -> Run workflow.
Select main and enable bootstrap_admin for the initial setup.

The workflow validates the destination, applies committed migrations,
generates the Prisma client and optionally creates the administrator.

User, hashed credential, company and active ADMIN membership are created
in one transaction. Matching retries preserve credentials and permissions.
The script refuses unrelated existing records, incomplete setup and
revoked or demoted memberships.

The workflow serializes setup runs. The bootstrap advisory lock coordinates
this procedure only; do not run initial setup while other processes are
creating users or companies. This utility is not password recovery or user management.

## Later Migrations

Leave bootstrap_admin disabled for ordinary schema updates.
Review migration SQL and compatibility with the running application
before executing the workflow.

Use migrate deploy for staging. Never use migrate dev or db push.
Back up before changes that risk existing data.

Application deployment and database migrations are separate operations.
Rolling back application code does not reverse database migrations.
Use backward-compatible schema changes when the previous app remains live.
A fully coordinated release pipeline remains separate work.

## Application Configuration

The application requires DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL.
Configure them privately with the selected hosting provider.
Use the Neon pooled SSL connection for application traffic when enabled,
a new high-entropy authentication secret of at least 32 characters,
and the exact HTTPS origin assigned to the deployed application.

The setup workflow uses the direct Neon connection for migrations.
Never use local or test authentication secrets for staging.

## Verification

Staging initialization scenarios run against an isolated local database
in the Container checks job, before the browser tests.
They cover sign-in, replay, membership protection, unrelated records,
concurrent retries and transaction rollback.

## Operations

Use demonstration data and monitor Neon Free quotas.
Readiness queries consume database compute; avoid artificial keepalive traffic.
Keep backups outside Git and verify restoration separately.
