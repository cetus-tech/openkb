# ChatGPT 集成指南

ChatGPT 连接需要一个远程可访问的 MCP 端点。ChatGPT 会话无法调用你电脑上的 `localhost`。

## 1. 安全地发布 OpenKB

在具有 HTTPS URL 的主机上运行 OpenKB，例如：

```text
https://kb.example.com/mcp
```

将 Web 控制台和 MCP 端点置于 HTTPS 之后，并使用 OpenKB API 令牌。登录到控制台，打开 **设置 → MCP 令牌 (Settings → MCP tokens)**，创建一个令牌并复制其值（设置中后续仍可再次复制）。浏览器登录 Session 与 MCP Bearer 令牌是分开的。

## 2. 在 ChatGPT 中添加 MCP 服务器

1. 打开 ChatGPT 的 **Settings (设置)**。
2. 打开 **Plugins (插件)**。
3. 打开 **MCP**。
4. 选择 **Add server (添加服务器)**。
5. 输入一个名称，例如 `OpenKB`。
6. 选择 **Streamable HTTP** 作为传输协议。
7. 将 MCP 服务器 URL 设置为 `https://kb.example.com/mcp`。
8. 将 Bearer 令牌设置为从 OpenKB 复制的完整 `okb_...` 令牌。
9. 保存服务器并启动一个新的对话，以便 ChatGPT 发现这些工具。

URL 必须以 `/mcp` 结尾；请勿单独使用 OpenKB Web 首页 URL。请勿将令牌粘贴到 URL 中或聊天消息中。

请勿选择 **stdio**。Stdio 适用于作为本地命令启动的 MCP 服务器；OpenKB 是一个远程 HTTP 服务。

## 3. 验证

要求 ChatGPT 列出 OpenKB 的知识类型，然后要求它检索项目的上下文。要让 ChatGPT 记录记忆，要求它使用 `openkb_remember`；产生的提案必须在 OpenKB 控制台中批准。
