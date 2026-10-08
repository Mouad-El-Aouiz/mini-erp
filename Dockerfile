# syntax=docker/dockerfile:1
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS builder
COPY . .
# These non-secret placeholders satisfy config evaluation without a database connection.
RUN mkdir -p public && DATABASE_URL=postgresql://build:build@127.0.0.1:1/build node node_modules/prisma/build/index.js generate
RUN NEXT_BUILD_STANDALONE=1 DATABASE_URL=postgresql://build:build@127.0.0.1:1/build BETTER_AUTH_URL=http://localhost:3000 BETTER_AUTH_SECRET=build-only-placeholder-secret-never-use-at-runtime npm run build

FROM dependencies AS migrations
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node docker/start.mjs docker/healthcheck.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=5s --start-period=20s --retries=12 CMD ["node", "healthcheck.mjs"]
CMD ["node", "start.mjs"]
