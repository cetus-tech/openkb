# OpenKB Server

[English](README.md) | [简体中文](README_zh.md)

OpenKB Server is a self-hosted knowledge service for AI agents. Agents connect through the built-in MCP endpoint; people use the web dashboard to add knowledge and review proposed memories.

## Quick start

Create a `docker-compose.yaml` file:

```yaml
services:
    openkb:
        image: ghcr.io/cetus-tech/openkb:latest
        container_name: openkb
        restart: unless-stopped
        environment:
            - OPENKB_SQLITE_FILENAME=openkb.db
            - OPENKB_DATA_DIR=/data
            - OPENKB_HOST=0.0.0.0
            - OPENKB_PORT=6800
            - LOG_LEVEL=info
            - SIGNUP_ENABLED=true
        ports:
            - '6800:6800'
        volumes:
            - ./data:/data
        healthcheck:
            test:
                [
                    'CMD',
                    'node',
                    '-e',
                    "fetch('http://127.0.0.1:6800/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
                ]
            interval: 30s
            timeout: 5s
            retries: 3
```

Start the service:

```bash
docker compose up -d
curl http://localhost:6800/health
```

The web dashboard and API are served on `http://localhost:6800`. The SQLite database is persisted in `./data/openkb.db`.

## MCP endpoint

```text
http://localhost:6800/mcp
```

The endpoint accepts Streamable HTTP JSON-RPC requests. It requires a bearer token created explicitly in **Settings → Tokens** (or `POST /auth/tokens`). Sign-in alone does not create an agent token. See:

- [`backend/docs/en/introduction/quickstart.md`](backend/docs/en/introduction/quickstart.md)
- [`backend/docs/en/integrations/mcp.md`](backend/docs/en/integrations/mcp.md)
- [`backend/docs/en/integrations/codex-cli.md`](backend/docs/en/integrations/codex-cli.md)
- [`backend/docs/en/integrations/grok-cli.md`](backend/docs/en/integrations/grok-cli.md)
- [`backend/docs/en/integrations/chatgpt.md`](backend/docs/en/integrations/chatgpt.md)
- [`backend/docs/en/integrations/antigravity.md`](backend/docs/en/integrations/antigravity.md)

## Agent workflow

1. Call `openkb_get_context` or `openkb_search` before working.
2. Use `openkb_get_knowledge` when a complete knowledge item is needed.
3. Call `openkb_remember` when a durable discovery should survive the session.
4. Review and approve proposals in the dashboard.

New authenticated agents can propose knowledge. Owners and admins grant direct write access per token in **Settings → Tokens** (members are capped at `propose`); the claimed agent name never changes permissions.
