# MCP 集成指南

OpenKB 对外提供一个核心 Agent 服务：位于 `/mcp` 的 Streamable HTTP MCP 端点。它与 Web 控制台运行在同一个容器中，读取并写入相同的 SQLite 数据库。

## 简单了解 MCP

MCP 是 Agent 客户端与 OpenKB 之间的连接协议。OpenKB 是 MCP 服务器；Codex、Grok、ChatGPT、Cursor 等则是 MCP 客户端。客户端向 `/mcp` 发送请求，OpenKB 执行知识工具，并将结果返回给 Agent。通常只需要在客户端中配置 URL 和令牌；不需要运行第二个 MCP 进程。

## 连接详情

| 设置项 | 值 |
| --- | --- |
| 端点 (Endpoint) | 本地安装为 `http://localhost:6800/mcp` |
| 传输协议 (Transport) | Streamable HTTP；请勿为远程 OpenKB 服务器使用 stdio |
| MCP 认证 | `Authorization: Bearer <OpenKB API 令牌>` |
| Web 认证 | HttpOnly 浏览器 Session Cookie |
| 身份请求头 (Header) | `X-OpenKB-Agent: codex`（用于权限判断，推荐设置） |

浏览器登录与 MCP 认证是分开的。登录会生成浏览器 Session，但不会创建或轮换 API 令牌。请从 **设置 → MCP 令牌 (Settings → MCP tokens)** 或已认证的 `POST /auth/tokens` 端点显式创建令牌。完整的令牌保存在数据库中，并可在设置中再次复制。切勿在 Prompt 中分享令牌或将其提交到项目文件中。

对于终端客户端，使用浏览器 Session Cookie 认证令牌管理请求，然后将返回的值作为 MCP Bearer 令牌使用：

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-mcp-client"}'
rm openkb.cookies
```

第二个响应包含 `.token.value`（服务端同样保存了该值，因此设置中可以再次复制）。将该值导出为 `OPENKB_TOKEN` 或输入到 MCP 客户端的 Bearer 令牌设置中。API 令牌本身仅保存在服务端，并使用 `Authorization: Bearer` 请求头（不涉及客户端 Cookie）。

身份认证端点各自的职责如下：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/auth/login` | 验证用户密码并设置浏览器 Session Cookie |
| `POST` | `/auth/register` | 创建账号（`name`、`email`、`password`）；第一个用户为所有者 owner |
| `POST` | `/auth/tokens` | 为 MCP/API 客户端创建一个具名 Bearer 令牌 |
| `GET` | `/auth/tokens` | 列出登录用户拥有的令牌（包含完整的 `value`） |
| `PATCH` | `/auth/tokens/:id` | 重命名令牌 |
| `DELETE` | `/auth/tokens/:id` | 显式撤销单个 Bearer 令牌 |
| `POST` | `/auth/logout` | 结束浏览器 Session 而不撤销 Bearer 令牌 |
| `GET` | `/v1/users` | 列出控制台用户 |
| `POST` | `/v1/users` | 创建用户（仅限 owner） |
| `PATCH` | `/v1/users/:id` | 更新姓名、角色或密码 |
| `DELETE` | `/v1/users/:id` | 删除用户（仅限 owner） |

对于远程安装，请使用 HTTPS 端点，例如 `https://kb.example.com/mcp`。在另一台机器上运行的客户端无法访问 OpenKB 主机上的 `localhost`。

对于 ChatGPT，从 **Settings → Plugins → MCP** 添加服务器。输入远程 `/mcp` URL 和 OpenKB Bearer 令牌。

## Agent 身份与权限

OpenKB 身份包含两个层级：

- **Bearer 令牌**：认证请求并识别 **人类所有者**。知识和提案均归属于该用户 (`createdBy`)。
- **Agent 名称**：客户端声明的名称 (`agentName` / `X-OpenKB-Agent`)，仅用于权限和注册。它不用于知识归属。

当 MCP 客户端支持自定义 HTTP 请求头时，请将 Agent 名称配置为 HTTP 请求头：

```text
X-OpenKB-Agent: codex
```

对于无法发送自定义 HTTP 请求头的客户端，请在每个 OpenKB 工具调用的 `arguments` 对象中传递 `agentName`。如果客户端还允许自定义初始的 `tools/list` 请求，请在它的 `params` 中包含相同的字段，以便能立即公布特定权限的工具。这些可选字段已包含在工具 Schema 中。`AGENTS.md` 仅是告诉 Agent 调用 OpenKB 的指令，它不是身份注册机制。

使用新 Agent 名称发起的第一次认证请求会在 **Agent (Agents)** 中自动将其注册为 `propose` 权限。OpenKB 还会记录该 Agent 使用的最后一个 MCP 令牌（显示在 Agent 页面上）。管理员可以打开 **Agent**，为受信任的客户端选择 `write`，或者保留为 `propose`，以便其记忆显示在 **提案 (Proposals)** 中供审核。`admin` 级别还允许 Agent 列出 Agent 身份。

使用稳定的 Agent 名称。例如，普通 Codex 工作区使用 `codex`，仅当代表具有单独权限的独立客户端时才使用其他名称（如 `codex-ci`）。

## 可用工具

工具是**按权限门控**的。客户端只能看到解析后的 Agent 有权调用的工具。这是有意的 MCP 设计：Schema 中更少、更有针对性的工具，更高权限的工具仅暴露给受信任的身份。

| 权限级别 | 典型工具数量 | 包含的工具 |
| --- | ---:| --- |
| `read` | 6 | `openkb_whoami`, `openkb_get_context`, `openkb_search`, `openkb_get_knowledge`, `openkb_list_types`, `openkb_list_versions` |
| `propose`（新认证 Agent 的默认权限） | 9 | read 工具 + `openkb_remember`, `openkb_list_proposals`, `openkb_get_proposal` |
| `write` | 11 | propose 工具 + `openkb_upsert_knowledge`, `openkb_delete_knowledge` |
| `admin` | 12 | write 工具 + `openkb_list_agents` |

### Read（读取）工具

| 工具 | 用途 |
| --- | --- |
| `openkb_whoami` | 返回解析后的 Agent 名称、令牌拥有者、权限等级、服务器版本以及在该等级下可用的工具 |
| `openkb_get_context` | **主入口**：获取针对项目和路径最相关的有效知识 |
| `openkb_search` | 搜索有效知识；省略 `query` 参数可列出有效条目（可选路径/类型过滤） |
| `openkb_get_knowledge` | 按 slug 获取单个完整的有效知识条目 |
| `openkb_list_types` | 列出有效的知识类型 |
| `openkb_list_versions` | 获取单个知识条目的版本历史 |

### Propose（提案）工具（可审核的写入）

| 工具 | 用途 |
| --- | --- |
| `openkb_remember` | 提议新知识或对现有 slug 的完整替换；在批准前不会更改有效知识 |
| `openkb_list_proposals` | 列出提案（默认：open 状态） |
| `openkb_get_proposal` | 按 ID 获取单个提案，包含完整的提议 Markdown |

### Write（写入）工具（仅限受信任 Agent）

| 工具 | 用途 |
| --- | --- |
| `openkb_upsert_knowledge` | 直接创建或更新 **有效** 知识（跳过审核） |
| `openkb_delete_knowledge` | 按 slug 删除知识条目 |

### Admin（管理）工具

| 工具 | 用途 |
| --- | --- |
| `openkb_list_agents` | 列出已注册的 Agent 身份和权限 |

批准或拒绝提案在设计上保持为人类在 **Web 控制台**（或通过 REST API）进行的操作。Agent 默认不提供 MCP 批准工具。

### 为什么没有更多工具？

MCP 客户端会将每个公布的工具 Schema 加载到模型上下文窗口中。因此 OpenKB：

- 将列表和搜索合并为 `openkb_search`（省略 `query` 即为列表）。
- 使用单一的提案路径：`openkb_remember`（新建或按 slug 更新）。
- 仅在 Agent 拥有对应权限时才暴露 write/admin 工具。
- 将人类工作流（批准提案、管理令牌）留在 Web 控制台中。

## 变更的处理流程

有两种安全的知识变更方式：

- 人类从 Web 控制台保存知识。它会立即变为有效状态并开启新版本。
- 具有 `propose` 权限的 Agent 调用 `openkb_remember`。OpenKB 创建一个待审核的 Open 提案，并保持当前有效知识不变。人类可以批准它以创建下一个版本，或者在不更改规范知识的情况下拒绝它。

只有有效 (`active`) 知识才会被正常的 MCP 搜索、上下文检索、列表和单条目提取返回。未激活 (`inactive`) 的条目仍保留在控制台中供人类进行管理和查看历史，但它们不会静默影响 Agent。

具有 `write` 权限的 Agent 可以调用 `openkb_upsert_knowledge` 直接保存有效知识。请仅对显式信任的身份使用此权限；提案模式是更安全默认选择。

## 作用域

当省略 `projectSlug` 时，知识是全局的。设置 `projectSlug` 可用于项目相关知识。任何知识条目还可以包含 `pathPatterns`。知识归属来源于令牌拥有者；Agent 名称不会过滤检索结果。

## 请求示例

初始化并列出工具：

```bash
curl -s https://kb.example.com/mcp \
  -H "Authorization: Bearer $OPENKB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"example","version":"1.0"}},"id":1}'
```

获取项目上下文：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "openkb_get_context",
    "arguments": {
      "agentName": "codex",
      "projectSlug": "openkb",
      "path": "backend/src/api/app.ts",
      "limit": 8
    }
  },
  "id": 2
}
```

记住新发现：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "openkb_remember",
    "arguments": {
      "title": "Authentication review rule",
      "summary": "Protected routes must validate bearer tokens before querying the database.",
      "type": "rule",
      "projectSlug": "openkb",
      "pathPatterns": ["backend/src/api/**"],
      "content": "# Authentication review rule\n\nValidate bearer tokens before protected routes access the database."
    }
  },
  "id": 3
}
```

提案将在 Web 控制台中可见。批准会创建或更新规范知识条目，并递增其版本号。
