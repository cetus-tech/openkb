# Antigravity IDE 集成指南

本指南介绍如何将 Antigravity IDE 连接到正在运行的 OpenKB 服务器。

## 1. 准备令牌

创建或登录 OpenKB 账号，然后在 **设置 → MCP 令牌 (Settings → MCP tokens)** 中创建一个令牌。对于位于其他机器上的服务器，请使用其 HTTPS 端点。对于本地 IDE，使用：

```text
http://localhost:6800/mcp
```

## 2. 添加 OpenKB

你可以直接通过 Antigravity IDE 的界面配置 OpenKB MCP 服务器：

1. 打开右侧面板上的 **MCP Servers** 选项卡。
2. 点击 **Manage MCP Servers**。
3. 在中央面板中，点击 **View Raw Config**。
4. 将以下配置内容添加到文件中：

```json
{
  "mcpServers": {
    "openkb": {
      "serverUrl": "http://localhost:6800/mcp",
      "headers": {
        "Authorization": "Bearer <你的 OpenKB 令牌>",
        "X-OpenKB-Agent": "antigravity"
      }
    }
  }
}
```

对于远程服务器，请将 `http://localhost:6800/mcp` 替换为远程 HTTPS 端点。

保存后，验证服务器已在 MCP Servers 面板中列出并显示为 **Connected（已连接）**。

## 3. 指示 Antigravity 使用 OpenKB

要将 OpenKB 指示应用于项目中每一次 Antigravity 会话，请将以下内容添加到该项目的 `AGENTS.md` 文件中（或在项目根目录下创建该文件）：

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when the token has `write` permission and a direct active save is intentional.
```

配置完成后重新启动 Antigravity Agent 会话，以便加载工具和规则。

## 4. 验证

要求 Agent 使用当前项目 slug 和文件路径调用 `openkb_get_context`。在有重要发现后，要求其调用 `openkb_remember`。在 OpenKB Web 控制台中审核提案，使其成为有效知识。
