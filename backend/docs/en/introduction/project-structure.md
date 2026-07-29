# Project Structure

OpenKB is a server/web application with two in-repo packages:

```
backend/
├── backend/             # Fastify server + MCP endpoint
│   ├── src/
│   │   ├── api/         # Internal routes, auth, docs, static UI serving
│   │   ├── config/      # Configuration loader (env vars)
│   │   ├── core/        # Knowledge model and retrieval logic
│   │   ├── db/          # Knex setup, migrations, seeds, and DB access
│   │   │   ├── migrations/
│   │   │   │   ├── sqlite/    # SQLite-specific migrations
│   │   │   │   └── mysql/     # MySQL-specific migrations
│   │   │   └── seeds/         # Install seed knowledge (e.g. MCP instructions)
│   │   └── mcp/         # MCP tool server for agent integration
│   ├── docs/            # Product documentation served by /v1/docs
│   ├── dist/            # Compiled backend + built frontend
│   └── package.json
│
├── frontend/            # Vue 3 SPA
│   └── src/
│       ├── views/       # Home, Docs, portal pages
│       ├── components/  # Layout, knowledge Markdown pane, forms
│       ├── stores/      # Pinia state
│       └── router/      # Vue Router config
│
├── AGENTS.md            # Thin pointer to OpenKB MCP workflow (seeded knowledge is canonical)
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
└── README.md
```

## backend/

The backend owns the canonical knowledge model, persistence, internal routes, MCP endpoint, auth (users, sessions, tokens), docs serving, and production static frontend serving. It ships with SQLite by default and MySQL dual-migration support. Primary keys are integer autoincrement IDs.

## frontend/

The web UI is for humans: setup, knowledge (search, import/export, versions, Markdown rendered/raw), reviewing proposals, managing agents, users, tokens, and reading documentation. Prefer Naive UI components when they cover the need.

## Out of scope

Agents connect through MCP-compatible clients, and humans use the web UI.
