# 快速开始

OpenKB 是 AI Agent 的大脑。面向 Agent 的服务接口是 MCP；Web 控制台则是人们添加知识和审核变更的地方。

### 简单了解 MCP

MCP 是允许 Agent 调用 OpenKB 的连接标准。你不需要安装单独的 MCP 服务器或学习新的命令行工具：启动 OpenKB，将 `/mcp` URL 和 Bearer 令牌提供给 Agent，Agent 即可使用 OpenKB 的知识工具。

推荐使用 Docker Compose 进行安装。本指南将启动完整的 OpenKB 容器并快速连接本地 Agent。有关完整的 Docker Compose 和源码安装教程、持久化存储、备份和环境变量，请参阅[安装指南](../installation.md)。

## 1. 启动 OpenKB 容器

在服务目录中，启动 Docker Compose 服务：

```bash
docker compose up -d
curl http://localhost:6800/health
```

健康检查响应应当为 `{"ok":true}`。在浏览器中打开 `http://localhost:6800`。

这将在一个容器中同时启动 Web 控制台和 MCP 端点。请保留 `data/openkb.db`（或源码模式下的 `./data/openkb.db`），以便 SQLite 数据库在容器重启后依然保留。有关其他部署选项，请参阅[完整安装指南](../installation.md)。

## 2. 创建所有者账号

在 Web 控制台中选择 **创建账号 (Create account)**。提供显示 **姓名 (name)**、邮箱和密码。第一个创建的账号将成为所有者 owner。注册和后续登录仅创建浏览器 Session，不会创建或轮换 MCP 令牌。

登录后，控制台的 **新手引导 (Getting started)** 清单将指引你完成剩余的设置：创建令牌、添加知识、连接 Agent 并审核记忆。全新安装还会预置全局有效知识 `openkb-mcp-instructions`（Agent 工作流规则）。

打开 **设置 (Settings)**，如有需要可复制 MCP 端点，然后在 **MCP 令牌 (MCP tokens)** 下输入名称（如 `codex`）并选择 **创建令牌 (Create token)**。复制完整的令牌值并提供给你的 MCP 客户端。OpenKB 会将完整令牌保存在数据库中，方便日后在设置中再次复制。

对于仅终端设置，可以先创建浏览器 Session，然后显式创建 API 令牌：

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"mcp-client"}'
```

第二个响应包含 `.token.value`。请妥善保管它，如同密码一般。`openkb.cookies` 文件仅包含本次设置所使用的临时浏览器 Session；请保护好它并在完成后予以删除。API 令牌本身仅保存在服务端，并使用 `Authorization: Bearer` 请求头（不涉及客户端 Cookie）。

为 MCP 客户端会话导出环境变量（将占位符替换为复制的 token.value）：

```bash
export OPENKB_TOKEN="在此粘贴-token.value"
```

请勿提交该值或将其粘贴到 Agent 的 Prompt 中。

## 3. 添加初始知识

登录控制台并打开 **知识 (Knowledge)**。浏览预置的 MCP 指令，然后添加你自己的全局规则、Skill、规范、工作流或参考资料。全局生效的知识请将 **Project slug** 留空。设置项目特定的 slug 则仅对该项目生效。

可选的作用域字段可进一步缩小检索范围：

- **路径模式 (Path patterns)**：例如 `backend/**`。

你可以 **导入/导出 (import/export)** Markdown（包含 YAML front matter，包括 `created_by`），将条目标记为 **有效 (active)** 或 **未激活 (inactive)**，并打开条目查看带有渲染/源码 Markdown 的版本历史。

## 4. 连接 MCP 客户端

MCP 端点地址为：

```text
http://localhost:6800/mcp
```

在 ChatGPT 中，从 **Settings → Plugins → MCP** 添加远程服务器。选择 **Streamable HTTP**，然后使用从 OpenKB **设置 (Settings)** 中复制的 HTTPS `/mcp` URL 和 Bearer 令牌。请勿选择 stdio；stdio 仅用于本地启动的 MCP 进程。

使用特定客户端的集成指南：

- [Codex CLI Guide](../integrations/codex-cli)
- [Grok CLI Guide](../integrations/grok-cli)
- [ChatGPT Guide](../integrations/chatgpt)
- [Antigravity IDE Guide](../integrations/antigravity)

对于远程 Agent，请将 OpenKB 发布在 HTTPS 反向代理之后。`localhost` 仅可从同一台机器访问。

连接客户端后，显式告知 Agent 使用 OpenKB MCP。对于 Codex CLI，将指令放入项目的 `AGENTS.md` 中，以便为每次会话自动加载。[Codex CLI 指南](../integrations/codex-cli) 包含了复制粘贴所需的一次性 Prompt 和持久项目规则。

## 5. 注册 Agent 身份

每个 MCP 客户端需要：

- 由团队成员拥有的 **Bearer 令牌**（知识归属使用该用户）。
- 用于权限控制的 **Agent 名称**（客户端声明），如 `codex`、`grok` 或 `codex-ci`。

`AGENTS.md` 告知 Agent 使用 OpenKB，但它不会注册 Agent 身份。在 MCP 客户端的连接设置中配置 Agent 名称：

```text
X-OpenKB-Agent: codex
```

对于 Codex CLI，将该请求头添加到 `~/.codex/config.toml` 中的 `[mcp_servers.openkb]` 下；详见 [Codex CLI 指南](../integrations/codex-cli) 中的完整示例。如果客户端无法设置请求头，请在每个 OpenKB MCP 工具调用中包含 `agentName: "codex"`。如果它支持自定义 `tools/list` 参数，请在其中也包含该参数，以便客户端能看到特定权限的工具。OpenKB 工具暴露了这些可选的身份参数。

### Codex CLI 示例

将令牌导出为 `OPENKB_TOKEN` 后，向 Codex 注册 OpenKB：

```bash
codex mcp add openkb \
  --url http://localhost:6800/mcp \
  --bearer-token-env-var OPENKB_TOKEN
```

然后将身份请求头添加到 `~/.codex/config.toml`：

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
bearer_token_env_var = "OPENKB_TOKEN"
http_headers = { "X-OpenKB-Agent" = "codex" }
```

启动一个新的 Codex 会话并调用 `openkb_list_types`。首次认证的请求会自动创建拥有 `propose` 权限的 `codex` 身份。检查控制台中的 **Agent (Agents)** 页面，仅当信任该实例可直接更新有效知识时才将其更改为 `write`。管理员权限 `admin` 仅用于必须管理其他 Agent 的身份。

在每次会话中使用相同的身份。更改名称会创建一个新的 Agent 记录，并具有独立的权限和活动历史。

## 6. 使用 Agent 记忆循环

要求 Agent 在执行非平凡任务之前调用 `openkb_get_context`。当它发现持久性的决策、规则、工作流、踩坑记录或进展笔记时，应当调用 `openkb_remember`。提案会出现在 **提案 (Proposals)** 中供审核和批准。

标准流程为：

1. Agent 在工作前检索相关的 **有效 (active)** 知识。
2. Agent 使用该上下文执行工作。
3. Agent 使用 `openkb_remember` 记录持久发现。
4. 提案在打开状态下与规范知识保持隔离。
5. 你批准提案以创建下一个知识版本，或拒绝它以保持规范知识不变。被拒绝的提案可以重新恢复以便再次审核。

Agent 不需要预先知道固定记忆列表。它们可以提出未来会话应当保留的任何 Markdown 格式持久知识。拥有 `write` 权限的受信任 Agent 可以直接更新有效知识，但请仅在希望跳过人工审核时才使用该权限。

在 **用户 (Users)** 下管理控制台账号（所有者 owner 可创建成员、设置显示名称和删除账号）。
