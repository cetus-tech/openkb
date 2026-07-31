# syntax=docker/dockerfile:1
# Pin the base image digest for reproducible builds.
# pnpm 11 requires Node >= 22.13 — keep the image on Node 22 LTS alpine.
# Bump deliberately: docker pull node:22-alpine && docker image inspect --format '{{index .RepoDigests 0}}'
ARG NODE_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
# Match backend/frontend packageManager (pnpm v11: allowBuilds in pnpm-workspace.yaml).
ARG PNPM_VERSION=11.15.1

# ---------------------------------------------------------------------------
# pnpm base: corepack + native build tools, shared by the install stages
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS pnpm-base
ARG PNPM_VERSION
RUN apk add --no-cache python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate

# ---------------------------------------------------------------------------
# Backend dependencies (dev + prod, needed to compile TypeScript)
# ---------------------------------------------------------------------------
FROM pnpm-base AS backend-deps
WORKDIR /app/backend
# package.json alone is not enough on pnpm v11: allowBuilds lives in pnpm-workspace.yaml
# so better-sqlite3 (native) and esbuild (binary) lifecycle scripts can run.
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --prefer-offline --frozen-lockfile \
  && pnpm store prune

# ---------------------------------------------------------------------------
# Backend compile (TypeScript → dist)
# ---------------------------------------------------------------------------
FROM backend-deps AS backend-build
COPY backend/tsconfig.base.json backend/tsconfig.json ./
COPY backend/src ./src
RUN CI=true pnpm run build

# ---------------------------------------------------------------------------
# Production dependencies only (no typescript, vitest, tsx, @types/*).
# Installed once from scratch so the runtime never carries dev deps.
FROM pnpm-base AS backend-prod-deps
WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --prod --prefer-offline --frozen-lockfile \
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
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile \
  && pnpm store prune
COPY frontend/index.html frontend/vite.config.ts frontend/uno.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN CI=true pnpm exec vite build

# ---------------------------------------------------------------------------
# Runtime: Node + prod deps + compiled backend + frontend assets + docs
# App process runs as non-root `node` (uid 1000) via entrypoint.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
  OPENKB_DATA_DIR=/data

# npm/npx stay in the image: the dev compose override runs `npx tsx watch`.
RUN apk add --no-cache su-exec \
  && mkdir -p /data \
  && chown node:node /data

COPY --from=backend-prod-deps --chown=node:node /app/backend/package.json /app/
COPY --from=backend-prod-deps --chown=node:node /app/backend/node_modules /app/node_modules
COPY --from=backend-build --chown=node:node /app/backend/dist /app/dist
COPY --from=frontend-build --chown=node:node /app/frontend/dist /app/dist/public
COPY --chown=node:node backend/docs/ /app/docs/
COPY docker-entrypoint.sh /usr/local/bin/openkb-entrypoint.sh
RUN chmod 755 /usr/local/bin/openkb-entrypoint.sh

EXPOSE 6800
ENTRYPOINT ["openkb-entrypoint.sh"]
CMD ["node", "dist/server.js"]
