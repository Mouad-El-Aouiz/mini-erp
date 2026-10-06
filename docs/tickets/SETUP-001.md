# SETUP-001 — Initialize the Application

## Objective

Create the Next.js application foundation using TypeScript
and Node.js while preserving existing project documentation.

## Scope

- Configure Next.js with App Router and TypeScript.
- Organize application code under src/.
- Enable strict TypeScript checking.
- Configure ESLint.
- Create a minimal English home page.
- Document installation and development commands.
- Record dependency versions through package-lock.json.

## Acceptance Criteria

- Existing documentation and Git history are preserved.
- npm run dev starts the application.
- The home page is accessible at http://localhost:3000.
- The document language is English.
- npm run typecheck succeeds.
- npm run lint succeeds.
- npm run build succeeds.
- Secrets and generated files are excluded from Git.
- The README explains how to install and run the application.

## Out of Scope

- Database connection.
- Authentication.
- Customer and order functionality.
- Production deployment.

## Validation Evidence

Record command results and the browser verification
in the pull request description.

## Implementation Notes

- Replaced the generated starter content with a minimal English home page.
- Planned modules are informational; no unavailable navigation or business actions are presented.
- Kept the page as a Server Component and used CSS Modules for page styles.
- Set English document language and project metadata in the root layout.
- Used system fonts to avoid a build-time Google Fonts download.
- Added a keyboard skip link and responsive layouts.
- Updated the README with installation, launch, checks and file responsibilities.

## Recorded Validation

- Next.js route type generation and TypeScript checking: passed.
- ESLint: passed.
- Next.js production build: passed.
- Local HTTP response at /: 200.
- Browser document language: en; title matches Mini ERP metadata.
- Browser console: no captured warnings or errors during inspection.
- Responsive checks at 375px and 1280px: no horizontal document overflow.
- Git tracked diff whitespace check: passed.

Assistant-run command checks used the bundled Node.js v24.19.0 runtime.
The developer reported that typecheck, lint and build also passed with Node.js v22.23.2 after the home page changes.

Authentication, persistence, business functionality and CI remain outside
this ticket. No business tests were added for this static foundation page.
