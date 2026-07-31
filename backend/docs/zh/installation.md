# 安装指南

如需了解最快捷的 Docker 优先部署路径，请参阅[快速开始](../introduction/quickstart)。本指南涵盖完整的 Docker Compose 部署、源码安装和环境变量设置。

## Docker Compose

Docker Compose 是受支持的 MVP 部署方式。它运行一个 OpenKB 容器，并将 SQLite 数据库持久化到主机目录中。

```bash
git clone https://github.com/cetus-tech/openkb.git
cd openkb
docker compose up -d
curl http://localhost:6800/health
```

在浏览器中打开 Web 控制台 `http://localhost:6800` 并创建第一个账号（显示名称 + 邮箱 + 密码）。第一个创建的账号即为所有者 (owner)。用户登录使用浏览器 Session；需要从 **设置 → MCP 令牌 (Settings → MCP tokens)** 中显式创建 MCP/API 令牌。数据库迁移会自动创建表结构并预置默认 MCP 指令（`openkb-mcp-instructions`）。

对于使用 Compose 覆盖配置的本地开发，运行 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` 还会启动一个位于端口 **6801** 的 SQLite Web UI。

使用以下命令停止服务：

```bash
docker compose down
```

数据库保存在 `data/openkb.db` 中。升级应用前请务必备份该文件。

## 源码运行

需要 **Node.js ≥ 22.13**（pnpm 11 的最低要求）。Docker 镜像使用 `node:22-alpine`。

```bash
cd backend
pnpm install
pnpm build
OPENKB_HOST=127.0.0.1 OPENKB_PORT=6800 pnpm start
```

源码安装的默认路径是位于 `./data/openkb.db` 的 SQLite。在 `backend` 目录下启动服务器会自动创建该目录。

## 环境变量

| 变量名 | 默认值 | 用途 |
| --- | --- | --- |
| `OPENKB_HOST` | `127.0.0.1` | 监听地址 |
| `OPENKB_PORT` | `6800` | HTTP 端口 |
| `OPENKB_DB_CLIENT` | `sqlite` | 数据库适配器；SQLite 是 MVP 路径 |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite 数据库路径 |
| `OPENKB_DATA_DIR` | `./data` | 运行时数据目录 |

代码库保留了用于未来部署的 MySQL 迁移路径，但它目前不属于当前安装流程的一部分。

## pnpm 与原生模块（源码安装 / Docker）

pnpm v10+ 默认会阻止依赖项的生命周期脚本。允许配置保存在每个包的 **`pnpm-workspace.yaml`** 中（pnpm v11 不再可靠读取 `package.json` 中的 `"pnpm"` 块）。

OpenKB 同时配置了这两种格式，因此在 pnpm 10 和 11 上均可正常安装：

```yaml
onlyBuiltDependencies: # 数组：用于 pnpm 10.x
    - esbuild
allowBuilds: # 映射：用于 pnpm 11.x
    esbuild: true
```

必须的原生包/构建包：

- **backend:** `better-sqlite3`（原生 SQLite）, `esbuild`（开发工具）
- **frontend:** `esbuild`, `vue-demi`

如果仍然看到 `Ignored build scripts` 警告，请在 `allowBuilds` 下将对应的包设置为 `true`（或在 `onlyBuiltDependencies` 中列出），然后运行：

```bash
rm -rf node_modules
pnpm install
pnpm rebuild esbuild   # 前端
# 或
pnpm rebuild better-sqlite3 esbuild   # 后端
```

Dockerfile 会在 `pnpm install` 之前复制每个包的 `pnpm-workspace.yaml`，并为生产镜像重新构建 `better-sqlite3`。
