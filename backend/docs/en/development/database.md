# Database

OpenKB uses **SQLite** (via `better-sqlite3`) for the self-hosted server.

## Baseline layout

Migrations live in `backend/src/db/migrations/`:

- `0001_initial_schema` is the **full baseline schema** (integer autoincrement IDs; knowledge status `active`/`inactive`; users include `name`) and seeds global MCP instructions (`openkb-mcp-instructions` v1, author `openkb`).
- Add new numbered migrations (`0002_…`, `0003_…`, …) for future schema changes.

## Database management tools

You can add an external web-based database management container to your `docker-compose.yaml` file to inspect tables visually.

### SQLite (using `sqlite-web`)

```yaml
services:
    openkb:
        # ... (existing openkb service config)

    sqlite-web:
        image: coleifer/sqlite-web:latest
        container_name: openkb-sqlite-web
        ports:
            - '6801:8080'
        environment:
            SQLITE_DATABASE: /data/openkb.db
        volumes:
            - ./data:/data
        depends_on:
            - openkb
```

Access the Web UI at `http://localhost:6801`.

> **Note:** `sqlite-web` accesses `./data/openkb.db` directly via host volume mount.
