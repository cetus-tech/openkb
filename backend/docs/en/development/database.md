# Database

SQLite is the default database for the self-hosted server. The repository keeps a separate MySQL migration path for a later deployment target. Every schema change requires both migration variants.

## Baseline layout

- `0001_initial_schema` is the **full current schema** (integer autoincrement IDs; knowledge status `active`/`inactive`; users include `name`) and seeds global MCP instructions (`openkb-mcp-instructions` v1, author `openkb`).
- Add new numbered migrations (`0002_…`, …) for future schema changes.

## Database Management Tools

You can add an external web-based database management container to your `docker-compose.yaml` file to inspect and manage tables visually.

### SQLite (using `sqlite-web`)

When using the default SQLite engine, add the `sqlite-web` service to `docker-compose.yaml`:

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

### MySQL / MariaDB (using `phpMyAdmin`)

When connecting OpenKB to a MySQL database, add `phpMyAdmin` to `docker-compose.yaml`:

```yaml
services:
  openkb:
    # ... (existing openkb service config)

  phpmyadmin:
    image: phpmyadmin:latest
    container_name: openkb-phpmyadmin
    ports:
      - '8080:80'
    environment:
      PMA_HOST: mysql
      PMA_PORT: 3306
    depends_on:
      - mysql
```

Access phpMyAdmin at `http://localhost:8080`.
