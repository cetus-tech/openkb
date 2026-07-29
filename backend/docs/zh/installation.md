# 安装指南

如需了解最快的方式，请使用[快速开始](../introduction/quickstart)。本指南涵盖了完整的 Docker Compose 部署、源码安装以及环境变量说明。

## Docker Compose 部署

Docker Compose 是推荐的部署方式。它在一个容器中运行 OpenKB 并将 SQLite 数据库持久化到主机目录中。

```bash
git clone https://github.com/cetus-tech/openkb.git
cd openkb
docker compose up -d
curl http://localhost:6800/health
```

在浏览器中打开 Web 控制台 `http://localhost:6800` 并创建第一个账号（显示名称 + 邮箱 + 密码）。第一个创建的账号即为所有者。首次运行会自动创建数据库表结构并预置默认 MCP 指令（`openkb-mcp-instructions`）。

如需停止服务：

```bash
docker compose down
```

数据库保存在 `data/openkb.db` 文件中。在升级应用前请备份该文件。

## 源码安装

需要 **Node.js ≥ 22.13** (pnpm 11 最低要求)。Docker 镜像使用的是 `node:22-alpine`。

```bash
cd backend
pnpm install
pnpm build
OPENKB_HOST=127.0.0.1 OPENKB_PORT=6800 pnpm start
```

## 环境变量说明

| 变量名                   | 默认值      | 说明              |
| ------------------------ | ----------- | ----------------- |
| `OPENKB_HOST`            | `127.0.0.1` | 监听地址          |
| `OPENKB_PORT`            | `6800`      | HTTP 端口         |
| `OPENKB_DB_CLIENT`       | `sqlite`    | 数据库适配器      |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite 数据库路径 |
| `OPENKB_DATA_DIR`        | `./data`    | 运行时数据目录    |
