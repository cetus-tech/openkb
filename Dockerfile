# syntax=docker/dockerfile:1
# Pin the base image digest for reproducible builds.
# pnpm 11 requires Node >= 22.13 — keep the image on Node 22 LTS alpine.
# Bump deliberately: docker pull node:22-alpine && docker image inspect --format '{{index .RepoDigests 0}}'
ARG NODE_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
# Match backend/frontend packageManager (pnpm v11: allowBuilds in pnpm-workspace.yaml).
ARG PNPM_VERSION=11.15.1

# ---------------------------------------------------------------------------
# Backend dependencies (includes devDependencies for tsc)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
RUN apk add --no-cache python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app/backend
# package.json alone is not enough on pnpm v11: allowBuilds lives in pnpm-workspace.yaml
# so better-sqlite3 (native) and esbuild (binary) lifecycle scripts can run.
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --prefer-offline --frozen-lockfile \
  && pnpm store prune

# ---------------------------------------------------------------------------
# Backend compile (TypeScript → dist)
# ---------------------------------------------------------------------------
FROM deps AS backend-build
COPY backend/ ./
RUN CI=true pnpm run build

# ---------------------------------------------------------------------------
# Production node_modules only (drops typescript, vitest, tsx, @types/*).
# Reinstall --prod instead of `pnpm prune --prod` so the build stays non-interactive
# (pnpm 10+ may prompt before purging node_modules).
# Workspace allowBuilds must still be present so better-sqlite3 rebuilds for --prod.
FROM backend-build AS backend-prod
RUN rm -rf node_modules \
  && pnpm install --prefer-offline --frozen-lockfile --prod \
  && pnpm rebuild better-sqlite3 \
  && pnpm store prune \
  && find node_modules -type d -name 'deps' -path '*/better-sqlite3/*' -exec rm -rf {} +

# ---------------------------------------------------------------------------
# Frontend static build (vite only — typecheck belongs in local/CI)
# Uses pnpm (same as backend) with the checked-in lockfile.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS frontend-build
ARG PNPM_VERSION
RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile \
  && pnpm store prune
COPY frontend/ ./
RUN CI=true pnpm exec vite build

# ---------------------------------------------------------------------------
# Runtime: Node + prod deps + compiled backend + frontend assets + docs
# App process runs as non-root `node` (uid 1000) via entrypoint.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
  OPENKB_DATA_DIR=/data

# Clean up unused Node tools (npm, yarn, corepack, headers) from base image to shrink runtime
RUN apk add --no-cache su-exec \
  && mkdir -p /data \
  && chown node:node /data

COPY --from=backend-prod --chown=node:node /app/backend/package.json /app/
COPY --from=backend-prod --chown=node:node /app/backend/node_modules /app/node_modules
COPY --from=backend-build --chown=node:node /app/backend/dist /app/dist
COPY --from=frontend-build --chown=node:node /app/frontend/dist /app/dist/public
COPY --chown=node:node backend/docs/ /app/docs/
COPY docker-entrypoint.sh /usr/local/bin/openkb-entrypoint.sh
RUN chmod 755 /usr/local/bin/openkb-entrypoint.sh

EXPOSE 6800
ENTRYPOINT ["openkb-entrypoint.sh"]
CMD ["node", "dist/server.js"]

