# Codex CLI 集成指南

本指南介绍如何将 Codex CLI 连接到 OpenKB MCP 服务器。

## 1. 创建 MCP 令牌

启动 OpenKB 并在 Web 控制台中创建账号。然后前往**设置 → MCP 令牌**创建一个新的令牌（如 `codex`）。

将令牌导出为环境变量：

```bash
export OPENKB_TOKEN="在此粘贴你的令牌"
```

## 2. 注册 MCP 服务器

运行以下命令：

```bash
codex mcp add openkb \
  --url http://localhost:6800/mcp \
  --bearer-token-env-var OPENKB_TOKEN
```

在 `~/.codex/config.toml` 中配置 Codex 身份：

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
bearer_token_env_var = "OPENKB_TOKEN"
http_headers = { "X-OpenKB-Agent" = "codex" }
```

## 3. 验证连接

```bash
codex mcp list
```
