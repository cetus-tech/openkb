# 数据库架构与迁移

OpenKB 使用 Knex 作为数据库查询构建器与迁移工具，默认采用 SQLite 数据库存储。

数据库表包括：
- `users`: 用户表
- `api_tokens`: Agent API 令牌表
- `active_knowledge`: 当前生效的知识条目表
- `proposals`: 变更提案表
- `agents`: 注册的 Agent 权限与信息表
- `app_settings`: 系统设置键值表

## 数据库管理工具配置

你可以在 `docker-compose.yaml` 中添加外部 Web 数据库管理容器，以便可视化查看和管理数据库。

### SQLite 可视化管理（使用 `sqlite-web`）

在使用默认 SQLite 数据库时，可在 `docker-compose.yaml` 中添加 `sqlite-web` 服务：

```yaml
services:
  openkb:
    # ... (原有 openkb 服务配置)

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

启动后访问 `http://localhost:6801` 即可查看并管理 SQLite 数据库。

> **注意：** `sqlite-web` 共享挂载 `./data` 目录以读取数据库文件。

### MySQL / MariaDB 可视化管理（使用 `phpMyAdmin`）

在使用 MySQL 部署时，可在 `docker-compose.yaml` 中添加 `phpMyAdmin` 服务：

```yaml
services:
  openkb:
    # ... (原有 openkb 服务配置)

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

启动后访问 `http://localhost:8080` 即可进入 phpMyAdmin 管理界面。
