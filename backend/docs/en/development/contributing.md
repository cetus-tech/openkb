# Contributing

OpenKB uses TypeScript, tests, and numbered SQLite migrations for every DB schema change.

## Product boundaries

OpenKB is MCP-first, Docker-hosted, and web-based.

Do not add:

- local agent integration packages
- a VS Code extension under `vscode/`
- desktop-app architecture
- static export flows as the main integration path

Focus changes on:

- MCP tools and protocol behavior
- DB-backed knowledge items and proposals
- web UI administration/review flows (prefer **Naive UI** components when available)
- Docker/self-hosted delivery
- user-facing docs served by the app

When changing schema: add a new numbered SQLite migration under `backend/src/db/migrations/`. Keep product docs under `backend/docs/` in sync with behavior.

## Development

Backend:

```bash
cd backend
pnpm install
pnpm test
pnpm build
```

Frontend:

```bash
cd frontend
pnpm install
pnpm test
pnpm build
```

## Code style

- TypeScript only.
- Prefer async/await.
- Named exports only unless a tool requires otherwise.
- Tests live in `tests/` beside `src/`, not nested under source directories.
- Update MCP docs when adding/changing MCP tools.
- Update API docs when adding/changing HTTP endpoints.
