# Codex CLI 集成指南

本指南介绍如何通过 Streamable HTTP 将 Codex CLI 连接到 OpenKB 服务器。

## 1. 创建 MCP 令牌

启动 OpenKB 并在 Web 控制台中创建第一个账号。登录会生成控制台所使用的浏览器 Session。然后在 **设置 → MCP 令牌 (Settings → MCP tokens)** 中创建一个 MCP 令牌。或者使用下面的终端命令行流程，它使用临时 Cookie Session 来创建一个具名 Bearer 令牌：

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

export OPENKB_TOKEN="$(curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"codex"}' \
  | jq -r '.token.value')"
```

在命令完成后删除 `openkb.cookies`；API 令牌本身仅保存在服务端，并使用 `Authorization: Bearer` 请求头（不涉及客户端 Cookie）。在你的 Shell 环境变量中保留 `OPENKB_TOKEN`。请勿将字面令牌直接写入 `config.toml`；再次登录不会更改或撤销该令牌。

## 2. 注册服务器

运行：

```bash
codex mcp add openkb \
  --url http://localhost:6800/mcp \
  --bearer-token-env-var OPENKB_TOKEN
```

对于远程服务器，请将 URL 替换为其 HTTPS 端点。

在 `~/.codex/config.toml` 中设置 Codex 身份，以便 OpenKB 可以持续注册该客户端：

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
bearer_token_env_var = "OPENKB_TOKEN"
http_headers = { "X-OpenKB-Agent" = "codex" }
```

使用命令生成的配置或 TOML 形式，不要两者混用。请求头不是 Bearer 令牌；它们仅用于标识客户端。为每个独立的 Codex 实例选择一个稳定的 Agent 名称。如果已安装的 Codex CLI 报告了不同的字段名，请运行 `codex mcp add --help` 并保持等效的 HTTP 请求头配置。

## 3. 验证

```bash
codex mcp list
```

启动一个新的 Codex 会话并要求其调用 `openkb_list_types`。然后在处理实际任务之前要求其调用 `openkb_get_context`。使用 `openkb_remember` 创建的记忆会出现在 OpenKB **提案 (Proposals)** 中。

首次完成认证的请求会在 OpenKB **Agent (Agents)** 中自动注册 `codex` 作为身份标签。MCP 权限属于 Bearer 令牌：在 **设置 → 令牌 (Settings → Tokens)** 中，如果信任该 Codex 实例可直接保存有效知识，请将该令牌设为 `write`（默认 `propose` 会让记忆进入审核队列）。不要为每个会话创建新名称；同一个客户端实例请使用相同的名称。

## 4. 指示 Codex 使用 OpenKB

注册 MCP 服务器可以使其工具可用。还需要显式告诉 Codex 何时使用它们。对于一次性指令，启动 Codex 并使用如下 Prompt：

```text
Use the OpenKB MCP server for this task. Before starting any non-trivial work, call openkb_get_context with the current project and file path, then use the returned knowledge in your plan. Before finishing, call openkb_remember for any durable decision, rule, workflow, pitfall, or project context discovered during the task. Do not put OpenKB memories only in chat; propose them through the MCP tool.
```

要将指令应用于项目中每一次 Codex 会话，请将以下内容添加到该项目的 `AGENTS.md` 中（或在项目根目录下创建该文件）：

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when the token has `write` permission and a direct active save is intentional.
```

更改 `AGENTS.md` 后启动一个新的 Codex 会话。当 Codex 的 Transcript 显示在工作前调用了 `openkb_get_context` 并在学到持久知识时调用了 `openkb_remember` 时，你可以确认 Codex 正在使用 OpenKB。Agent 身份和项目作用域可以通过 [MCP 集成指南](mcp) 中描述的可选请求头和知识作用域进行精细化调整。
