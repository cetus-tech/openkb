# 数据库

SQLite 是自托管服务器的默认数据库。代码库保留了独立的 MySQL 迁移路径以备未来的部署目标使用。每次 Schema 变更都需要同时提供这两种迁移变体。

## 基线布局

- `0001_initial_schema` 是 **当前的完整 Schema**（自增整数 ID；知识状态包含 `active`/`inactive`；用户包含 `name`），并预置了全局 MCP 指令（`openkb-mcp-instructions` v1，作者 `openkb`）。
- 未来的 Schema 变更请添加按数字编号的新迁移文件（`0002_…` 等）。

## 数据库管理工具

你可以在 `docker-compose.yaml` 文件中添加外部基于 Web 的数据库管理容器，以可视化方式查看和管理数据表。

### SQLite（使用 `sqlite-web`）

使用默认 SQLite 引擎时，在 `docker-compose.yaml` 中添加 `sqlite-web` 服务：

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

### MySQL / MariaDB（使用 `phpMyAdmin`）

将 OpenKB 连接到 MySQL 数据库时，在 `docker-compose.yaml` 中添加 `phpMyAdmin`：

```yaml
services:
  openkb:
    # ... (现有的 openkb 服务配置)

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

通过浏览器访问 `http://localhost:8080` 即可进入 phpMyAdmin。
