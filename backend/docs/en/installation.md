# Installation

Use the [Quick Start](../introduction/quickstart) for the shortest Docker-first path. This guide covers the complete Docker Compose deployment, source installation, and environment variables.

## Docker Compose

Docker Compose is the supported MVP deployment. It runs one OpenKB container and persists SQLite in a host directory.

```bash
git clone https://github.com/cetus-tech/openkb.git
cd openkb
docker compose up -d
curl http://localhost:6800/health
```

Open the web portal at `http://localhost:6800` and create the first account (display name + email + password). The first account is the owner. Sign-in uses a browser session; create an MCP/API token explicitly from **Settings → MCP tokens**. Migrations create the schema and seed default MCP instructions (`openkb-mcp-instructions`).

For local development with Compose overrides, `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` also starts a SQLite web UI on port **6801**.

Stop the service with:

```bash
docker compose down
```

The database remains in `data/openkb.db`. Back up that file before upgrading the application.

## Run from source

Requires **Node.js ≥ 22.13** (pnpm 11’s minimum). Docker images use `node:22-alpine`.

```bash
cd backend
pnpm install
pnpm build
OPENKB_HOST=127.0.0.1 OPENKB_PORT=6800 pnpm start
```

The source default is SQLite at `./data/openkb.db`. Create the directory automatically by starting the server from `backend`.

## Environment variables

| Variable                 | Default     | Purpose                                  |
| ------------------------ | ----------- | ---------------------------------------- |
| `OPENKB_HOST`            | `127.0.0.1` | Listen address                           |
| `OPENKB_PORT`            | `6800`      | HTTP port                                |
| `OPENKB_DB_CLIENT`       | `sqlite`    | Database adapter; SQLite is the MVP path |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite database path                     |
| `OPENKB_DATA_DIR`        | `./data`    | Runtime data directory                   |

The codebase keeps a MySQL migration path for later deployments, but it is not part of the current installation flow.

## pnpm and native modules (source install / Docker)

pnpm v10+ blocks dependency lifecycle scripts by default. Approvals live in each package’s **`pnpm-workspace.yaml`** (pnpm v11 no longer reliably reads a `package.json` `"pnpm"` block for this).

OpenKB sets both formats so installs work on pnpm 10 and 11:

```yaml
onlyBuiltDependencies: # array: used by pnpm 10.x
    - esbuild
allowBuilds: # map: used by pnpm 11.x
    esbuild: true
```

Required packages:

- **backend:** `better-sqlite3` (native SQLite), `esbuild` (dev tooling)
- **frontend:** `esbuild`, `vue-demi`

If you still see `Ignored build scripts`, set the package to `true` under `allowBuilds` (or list it under `onlyBuiltDependencies`), then:

```bash
rm -rf node_modules
pnpm install
pnpm rebuild esbuild   # frontend
# or
pnpm rebuild better-sqlite3 esbuild   # backend
```

The Dockerfile copies each package’s `pnpm-workspace.yaml` before `pnpm install` and rebuilds `better-sqlite3` for the production image.
