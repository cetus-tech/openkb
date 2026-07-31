# 配置说明

OpenKB 通过环境变量进行配置，默认使用 SQLite。

| 环境变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENKB_HOST` | `127.0.0.1` | HTTP 服务器监听地址 |
| `OPENKB_PORT` | `6800` | HTTP 端口 |
| `OPENKB_DB_CLIENT` | `sqlite` | 数据库适配器 |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite 文件路径 |
| `OPENKB_DATA_DIR` | `./data` | 持久化运行时目录 |

对于 Docker 环境，Compose 文件将 `OPENKB_HOST=0.0.0.0`，并将数据库保存在容器内的 `/data/openkb.db`，该路径挂载到主机的 `./data/openkb.db`。

## 身份认证存储

OpenKB 将浏览器身份认证与 MCP 令牌分离开来：

- 用户包含 `email`、显示名称 `name` 和角色 `role`（`owner` 或 `member`）。可在**用户管理 (Users)** 中管理账号（所有者 owner 可创建/删除账号并更改角色）。
- 用户登录和注册会在 HttpOnly Cookie 中生成 30 天的浏览器 Session。Session 哈希保存在 `user_sessions` 表中。
- MCP/API 令牌需要在 **设置 → MCP 令牌 (Settings → MCP tokens)** 或通过 `POST /auth/tokens` 显式创建（登录时不会自动生成）。
- 完整的密钥保存在 `api_tokens.token_value` 中。认证服务匹配 Bearer 字符串与该列。令牌可在设置中列出、重命名、复制和撤销。
- 登出系统仅清除浏览器 Session，不会撤销 MCP/API 令牌。可在设置中显式撤销或通过 `DELETE /auth/tokens/:id` 撤销。
- `OPENKB_TOKEN` 是 MCP 客户端使用的环境变量，并非服务端数据库配置项。

## 公网部署

MCP 请求需要携带 Bearer 令牌。在允许私有网络之外的访问之前，请将 OpenKB 部署在 HTTPS 反向代理之后。请勿将令牌放在 URL 查询字符串中或提交到代码仓库。
