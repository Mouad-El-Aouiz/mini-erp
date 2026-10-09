# DEPLOY-002 - Prepare Vercel staging deployment

## Objective

Build the existing Next.js application on Vercel Hobby using the initialized
Neon staging database and private account configuration.

## Changes

- Add build:vercel to generate Prisma Client before compiling Next.js.
- Declare the Next.js framework, npm ci and the cloud build command.
- Select cle1 near the Neon us-east-2 database.
- Disable automatic Git deployments pending an explicit release gate.
- Document account linking, private values, first-release verification and limits.

## Validation

- npm run build:vercel, TypeScript and ESLint pass.
- Configured fields validate against their official Vercel schema definitions.
- git diff --check passes.
- Account preflight reports loggedIn: false.

## Pending External Verification

The user must complete CLI authentication and merge the reviewed configuration.
No Vercel project has been created or linked, no environment values have been
uploaded, and no deployment URL or runtime verification exists yet.
The existing staging database is preserved; this change runs no migrations.
