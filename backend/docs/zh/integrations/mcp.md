# MCP 集成指南

OpenKB 提供了一个核心 Agent 服务：位于 `/mcp` 的 Streamable HTTP MCP 端点。它与 Web 控制台运行在同一个容器中，读取并写入相同的 SQLite 数据库。

## 简单了解 MCP

MCP 是 Agent 客户端与 OpenKB 之间的连接协议。OpenKB 是 MCP 服务器；Codex、Grok、ChatGPT、Cursor 等则是 MCP 客户端。客户端向 `/mcp` 发送请求，OpenKB 执行知识工具，并将结果返回给 Agent。

## 连接详情

| 配置项 | 描述 |
|---|---|
| 端点 (Endpoint) | 本地安装为 `http://localhost:6800/mcp` |
| 传输类型 (Transport) | Streamable HTTP |
| MCP 认证 | `Authorization: Bearer <OpenKB API 令牌>` |
| 身份标头 (Header) | `X-OpenKB-Agent: codex` (用于权限判断) |

## 可用工具列表

| 权限级别 | 包含的工具 |
|---|---|
| `read` | `openkb_whoami`, `openkb_get_context`, `openkb_search`, `openkb_get_knowledge`, `openkb_list_types`, `openkb_list_versions` |
| `propose` (默认) | 包含 read 工具 + `openkb_remember`, `openkb_list_proposals`, `openkb_get_proposal` |
| `write` | 包含 propose 工具 + `openkb_upsert_knowledge`, `openkb_delete_knowledge` |
| `admin` | 包含 write 工具 + `openkb_list_agents` |
