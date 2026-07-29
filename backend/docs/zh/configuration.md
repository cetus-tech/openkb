# 配置说明

OpenKB 主要通过环境变量进行配置。当前 MVP 使用 SQLite。

| 环境变量名               | 默认值      | 说明                  |
| ------------------------ | ----------- | --------------------- |
| `OPENKB_HOST`            | `127.0.0.1` | HTTP 服务器监听地址   |
| `OPENKB_PORT`            | `6800`      | HTTP 端口             |
| `OPENKB_DB_CLIENT`       | `sqlite`    | 数据库适配器          |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite 数据库文件路径 |
| `OPENKB_DATA_DIR`        | `./data`    | 持久化数据存储目录    |

在 Docker 环境中，Compose 文件会将 `OPENKB_HOST` 设置为 `0.0.0.0`，并将数据库文件保存在容器内的 `/data/openkb.db`，该路径已挂载到主机的 `./data/openkb.db`。

## 身份认证存储说明

OpenKB 将浏览器身份认证与 MCP 令牌隔离开来：

- 用户拥有 `email`、显示 `name` 和角色 `role`（`owner` 或 `member`）。可在**用户管理**中管理账号。
- 用户登录和注册会在 HttpOnly Cookie 中生成 30 天的浏览器 Session。
- MCP / API 令牌需要在**设置 → MCP 令牌**中手动创建。
- 登出系统仅清除浏览器 Session，不会撤销 MCP / API 令牌。如需撤销令牌，请在设置中手动删除。

## 公网部署建议

MCP 请求必须携带 Bearer 令牌。在允许公网访问之前，请将 OpenKB 部署在 HTTPS 反向代理之后。请勿将令牌暴露在 URL 查询参数中或提交到代码仓库。
