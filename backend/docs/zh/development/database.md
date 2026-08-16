# 数据库

OpenKB 自托管服务器使用 **SQLite**（通过 `better-sqlite3`）。

## 基线布局

迁移文件位于 `backend/src/db/migrations/`：

- `0001_initial_schema` 是 **当前的完整基线 Schema**（自增整数 ID；知识状态包含 `active`/`inactive`；用户包含 `name`），并预置了全局 MCP 指令（`openkb-mcp-instructions` v1，作者 `openkb`）。
- 未来的 Schema 变更请添加按数字编号的新迁移文件（`0002_…`、`0003_…` 等）。

## 数据库管理工具

你可以在 `docker-compose.yaml` 文件中添加外部基于 Web 的数据库管理容器，以可视化方式查看数据表。

### SQLite（使用 `sqlite-web`）

```yaml
services:
    openkb:
        # ... (现有的 openkb 服务配置)

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

通过浏览器访问 `http://localhost:6801` 即可进入 Web UI。

> **注意：** `sqlite-web` 通过主机卷挂载直接访问 `./data/openkb.db`。
