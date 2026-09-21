# DeepSeek Harness (DSH) 集成指南

本指南介绍如何通过 Streamable HTTP 将 DeepSeek Harness (DSH) 连接到 OpenKB 服务器。

## 概述

DeepSeek Harness 通过 `@deepseek-ai/dsh-mcp-client` 桥接插件连接外部 Model Context Protocol (MCP) 服务。配置完成后，OpenKB 的工具会自动挂载到 DSH 的原生工具注册表中，并带有 `mcp__openkb__` 前缀。

OpenKB 对外提供位于 `/mcp` 的 Streamable HTTP 端点。请勿使用 `stdio` 传输模式；请使用 `streamable-http`。

## 1. 创建 OpenKB MCP 令牌

启动 OpenKB 并登录 Web 控制台。进入 **设置 → MCP 令牌 (Settings → MCP tokens)** 并创建一个 Bearer 令牌：

- 日常编码使用 **propose**（默认权限）：Agent 记录的记忆以提案形式进入待审核列表。
- 仅在完全信任 Agent 直接更改有效知识时，才使用 **write** 权限。

也可以在终端使用 curl 创建令牌：

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

export OPENKB_TOKEN="$(curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"dsh"}' \
  | jq -r '.token.value')"
rm openkb.cookies
```

将 `OPENKB_TOKEN` 保存在环境变量中，或记下令牌字符串用于后续配置。

## 2. 在 DSH Profile 中安装 MCP 客户端插件

在 DeepSeek Harness 中，插件按 Profile 进行管理。将 `@deepseek-ai/dsh-mcp-client` 插件安装到当前使用的 Profile（例如 `web` 或 `headless`）：

```bash
# 适用于 Web 界面 Profile
dsh plugin --profile web add @deepseek-ai/dsh-mcp-client

# 适用于 Headless 模式 Profile
dsh plugin --profile headless add @deepseek-ai/dsh-mcp-client
```

此命令将 MCP 客户端桥接依赖添加到该 Profile 的配置中。

## 3. 配置 `cordis.patch.yml`

在 Profile 的 Patch 配置文件中添加 OpenKB MCP 连接信息：

```text
$DSH_HOME/profiles/<profile>/cordis.patch.yml
```

对于默认的 `web` Profile，该文件通常位于 `~/.dsh/profiles/web/cordis.patch.yml`。

> **文件名特别注意：** 确保文件名严格为 `cordis.patch.yml`（注意不要拼写错误，如 `cordis.pathc.yml`）。

### 核心重点：配置必须置于 `- insert:` 下

DSH 基于 Cordis 组合机制运行，`cordis.patch.yml` 是覆盖与补丁层。如果将未匹配已有 ID 的配置写在顶层，系统会将其视为无效的修改操作。**新增 MCP 插件必须放在 `- insert:` 列表内**。

在 `cordis.patch.yml` 中添加以下内容：

```yaml
- insert:
    - id: mcp-openkb
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: openkb
        transport: streamable-http
        url: http://localhost:6800/mcp
        headers:
          Authorization: !!js '`Bearer ${process.env.OPENKB_TOKEN}`'
          X-OpenKB-Agent: dsh
        failOnStartupError: false
```

如果是远程 OpenKB 实例，请将 `http://localhost:6800/mcp` 替换为实际的 HTTPS 地址（例如 `https://kb.example.com/mcp`）。

如果不想从环境变量读取，也可以直接填入字符串形式的 Bearer 令牌：

```yaml
- insert:
    - id: mcp-openkb
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: openkb
        transport: streamable-http
        url: http://localhost:6800/mcp
        headers:
          Authorization: Bearer <你的 OpenKB 令牌>
          X-OpenKB-Agent: dsh
```

### 配置字段说明

| 字段 | 说明 |
|---|---|
| `id` | Patch 文件内该条目的唯一标识（如 `mcp-openkb`）。 |
| `name` | 插件包名，必须为 `@deepseek-ai/dsh-mcp-client`。 |
| `config.serverName` | 工具本地命名前缀命名空间（`openkb`），生成的工具将以 `mcp__<serverName>__` 命名。 |
| `config.transport` | 传输协议，必须设置为 `streamable-http`。 |
| `config.url` | OpenKB MCP 端点地址（`/mcp`）。 |
| `config.headers.Authorization` | 鉴权请求头（`Bearer <令牌>`）。 |
| `config.headers.X-OpenKB-Agent` | 客户端身份标识，将在 OpenKB 控制台的 Agent 列表中显示。 |
| `config.failOnStartupError` | 连接失败策略。默认 `false`（记录错误但不阻止 DSH 启动）；若设为 `true` 则连接失败直接中断启动。 |

## 4. 重启 DeepSeek Harness

重新启动 DSH 进程以加载新插件和配置：

```bash
dsh web
```

## 5. 验证工具可用性

连接成功后，DSH 会自动发现 OpenKB 工具并在工具列表中以 `mcp__openkb__` 前缀呈现：

- `mcp__openkb__openkb_get_context`：按技术栈与路径检索关键项目规范与规则。
- `mcp__openkb__openkb_search`：搜索知识库。
- `mcp__openkb__openkb_get_knowledge`：按 slug 获取单条完整知识。
- `mcp__openkb__openkb_remember`：提出持久知识提案以供审核。
- `mcp__openkb__openkb_whoami`：查看当前 Agent 身份与令牌权限。

可在 DSH 会话中让模型调用 `mcp__openkb__openkb_whoami` 进行测试，验证返回的权限与所有者信息。

## 6. 指示 DSH Agent 使用 OpenKB

DSH 会自动加载工具，但需要指示 Agent 在合适时机调用。在项目根目录的 `AGENTS.md` 中添加如下指示：

```markdown
# OpenKB MCP instructions

OpenKB is the durable source of project knowledge. Do not duplicate project knowledge in this file.

Before any non-trivial task:

1. Call `openkb_get_context` with `projectSlug` and the current file path.
2. Include the declared technology stack in `stack` (e.g. `["language:typescript", "framework:vue:3"]`).
3. Apply returned context to your plan and implementation.

When discovering durable rules, patterns, or architecture decisions:

1. Call `openkb_remember` to propose durable knowledge for human review.
2. Keep proposals scoped with appropriate technology facets, project slug, or path patterns.
```

配置后，DSH Agent 将在任务开始前主动获取 OpenKB 上下文，并在发现持久经验时通过提案沉淀知识。
