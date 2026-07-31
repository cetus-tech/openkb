# Grok CLI 集成指南

本指南介绍如何通过 Streamable HTTP 将 Grok CLI (xAI Grok Build TUI) 连接到 OpenKB 服务器。

## 1. 创建 MCP 令牌

启动 OpenKB 并在 Web 控制台中创建第一个账号。登录会生成控制台所使用的浏览器 Session。然后在 **设置 → MCP 令牌 (Settings → MCP tokens)** 中创建一个 MCP 令牌。或者使用下面的终端命令行流程，它使用临时 Cookie Session 来创建一个具名 Bearer 令牌：

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

export OPENKB_TOKEN="$(curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"grok"}' \
  | jq -r '.token.value')"
```

在命令完成后删除 `openkb.cookies`；API 令牌本身仅保存在服务端，并使用 `Authorization: Bearer` 请求头（不涉及客户端 Cookie）。在你的 Shell 环境变量中保留 `OPENKB_TOKEN`（例如在 `~/.bashrc` 或 `~/.zshrc` 中）。Grok 在加载时会在 MCP 配置中展开 `${OPENKB_TOKEN}`，因此如果可以的话，请避免将字面令牌直接写入 `config.toml`。

## 2. 注册服务器

OpenKB 是一个远程 Streamable HTTP MCP 服务。在 Grok CLI 中注册它：

```bash
grok mcp add --transport http openkb http://localhost:6800/mcp \
  --header 'Authorization: Bearer ${OPENKB_TOKEN}' \
  --header 'X-OpenKB-Agent: grok'
```

对于远程服务器，请将 URL 替换为其 HTTPS 端点。请求头值周围的单引号可防止 Shell 在 Grok 读取配置之前展开 `${OPENKB_TOKEN}`。

该命令会写入 `~/.grok/config.toml`。等效的 TOML 配置为：

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
enabled = true

[mcp_servers.openkb.headers]
Authorization = "Bearer ${OPENKB_TOKEN}"
X-OpenKB-Agent = "grok"
```

使用命令生成的配置或 TOML 形式，不要两者混用。身份请求头不是 Bearer 令牌；它们仅用于标识客户端。为每个独立的 Grok 实例选择一个稳定的 Agent 名称。

要将 OpenKB 的作用域限定为单个仓库而不是所有项目，可添加 `--scope project`，这样条目就会写入当前目录下的 `.grok/config.toml`。在项目作用域的配置中优先使用 `${OPENKB_TOKEN}`，以防密钥被提交。

请勿为远程 OpenKB 服务器使用 stdio 传输。OpenKB 已经在 `/mcp` 暴漏了 HTTP 接口；Grok 会直接与该 URL 通信。

## 3. 验证

```bash
grok mcp list
grok mcp doctor openkb
```

`doctor` 应当报告握手成功以及非零的工具数量（例如在 propose 权限下有 9 个工具）。添加服务器后启动一个**新**的 Grok 会话，以便在该会话中发现工具。

要求 Grok 调用 `openkb_list_types`。然后在处理实际任务之前要求其调用 `openkb_get_context`。使用 `openkb_remember` 创建的记忆会出现在 OpenKB **提案 (Proposals)** 中。

首次完成认证的请求会在 OpenKB **Agent (Agents)** 中自动创建 `grok` 并赋予 `propose` 权限。打开控制台的 **Agent** 页面，如果信任该 Grok 实例可直接保存有效知识，请将该身份权限更改为 `write`。不要为每个会话创建新名称；同一个客户端实例请使用相同的名称。

在运行中的 TUI 会话中，你还可以打开 `/mcps`，确认 `openkb` 已启用，并在编辑 `config.toml` 后按 `r` 刷新服务器列表。

## 4. 指示 Grok 使用 OpenKB

注册 MCP 服务器可以使其工具可用，但你还应该显式告诉 Grok 何时使用它们。对于一次性指令，启动 Grok 并使用如下 Prompt：

```text
Use the OpenKB MCP server for this task. Before starting any non-trivial work, call openkb_get_context with the current project and file path, then use the returned knowledge in your plan. Before finishing, call openkb_remember for any durable decision, rule, workflow, pitfall, or project context discovered during the task. Do not put OpenKB memories only in chat; propose them through the MCP tool.
```

要将指令应用于项目中每一次 Grok 会话，请将以下内容添加到该项目的 `AGENTS.md` 中（或在项目根目录下创建该文件）。Grok 会自动加载 `AGENTS.md` 作为项目规则：

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when this agent has `write` permission and a direct active save is intentional.
```

更改 `AGENTS.md` 后启动一个新的 Grok 会话。当 Grok 的 Transcript 显示在工作前调用了 `openkb_get_context` 并在学到持久知识时调用了 `openkb_remember` 时，你可以确认 Grok 正在使用 OpenKB。

Grok 通过 `search_tool` 发现 MCP 工具，并通过 `use_tool` 使用全限定名称（例如 `openkb__openkb_get_context`）调用它们。Agent 身份和项目作用域可以通过 [MCP 集成指南](mcp) 中描述的可选请求头和知识作用域进行精细化调整。
