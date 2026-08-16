# 配置说明

OpenKB 通过环境变量进行配置。

| 环境变量名               | 默认值      | 说明                |
| ------------------------ | ----------- | ------------------- |
| `OPENKB_HOST`            | `127.0.0.1` | HTTP 服务器监听地址 |
| `OPENKB_PORT`            | `6800`      | HTTP 端口           |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite 文件路径     |
| `OPENKB_DATA_DIR`        | `./data`    | 持久化运行时目录    |

OpenKB 使用 SQLite（`better-sqlite3`），持久化数据保存在容器内的 `/data/openkb.db`，该路径在缺省配置时挂载到主机的 `./data/openkb.db`。

## 身份认证存储

OpenKB 将浏览器身份认证与 MCP 令牌分离开来：

- 用户包含 `email`、显示名称 `name` 和角色 `role`（`owner`、`admin` 或 `member`）。owner 和 admin 共享管理面；owner 额外管理 owner 角色。可在**用户管理 (Users)** 中管理账号。
- 用户登录和注册会在 HttpOnly Cookie 中生成 30 天的浏览器 Session。Session 哈希保存在 `user_sessions` 表中。
- MCP/API 令牌需要在 **设置 → MCP 令牌 (Settings → MCP tokens)** 或通过 `POST /auth/tokens` 显式创建（登录时不会自动生成）。
- 每个令牌都带有一个 MCP 权限等级（`read`、`propose` 或 `write`，默认 `propose`）。owner 和 admin 可设置任意等级，member 仅限 `read`/`propose`。管理员权限通过 Web 控制台管理。令牌等级决定 MCP 工具面；Agent 名称只是身份标签，绝不改变权限。
- 完整的密钥保存在 `api_tokens.token_value` 中。认证服务匹配 Bearer 字符串与该列。令牌可在设置中列出、重命名、复制和撤销。
- 登出系统仅清除浏览器 Session，不会撤销 MCP/API 令牌。可在设置中显式撤销或通过 `DELETE /auth/tokens/:id` 撤销。
- `OPENKB_TOKEN` 是 MCP 客户端使用的环境变量，并非服务端数据库配置项。

## 基于角色的 API 授权

所有 `/v1/*` 接口都需要已认证的 Session 或 Bearer 令牌。在此基础之上，接口按用户角色区分权限：

- **任意已认证用户** 都可以读取知识、搜索、获取上下文、创建提案，以及编辑待处理（open）提案的内容。
- **owner 或 admin** 可以创建/删除知识、删除知识版本、决定提案状态（批准/拒绝/重新开启）、删除提案、管理 Agent（创建、删除），以及读写应用设置。
- **仅 owner** 管理用户账号与 owner 角色（创建/删除用户、更改角色、创建 owner）。

member 是只读 + 提案用户；直接写入知识以及审查决定需要 owner/admin。无论请求使用浏览器 Session 还是 Bearer 令牌，以上规则均适用。（REST 授权依据用户角色；MCP 工具授权依据令牌权限等级。参见 MCP 集成文档。）

## 公网部署

MCP 请求需要携带 Bearer 令牌。在允许私有网络之外的访问之前，请将 OpenKB 部署在 HTTPS 反向代理之后。请勿将令牌放在 URL 查询字符串中或提交到代码仓库。
