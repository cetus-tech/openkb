# 快速开始

OpenKB 是 AI Agent 的知识大脑。对 Agent 的服务接口是 MCP；Web 控制台则是用户添加知识和审核变更的地方。

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

这将在一个容器中同时启动 Web 控制台和 MCP 端点。请保留 `data/openkb.db`，以便 SQLite 数据库在容器重启后依然保存。有关其他部署选项，请参阅[完整安装指南](../installation.md)。

## 2. 创建所有者账号

在 Web 控制台中选择**创建账号**。提供显示**姓名**、邮箱和密码。第一个创建的账号将自动成为所有者。注册和后续登录仅创建浏览器会话，不会创建或重置 MCP 令牌。

登录后，控制台的**新手引导**清单将指引你完成剩余的设置：创建令牌、添加知识、连接 Agent 并审核记忆。新安装还会预置全局有效知识 `openkb-mcp-instructions`（Agent 工作流规则）。

打开**设置**，如有需要复制 MCP 端点，然后在 **MCP 令牌**下输入名称（如 `codex`）并选择**创建令牌**。复制完整的令牌值并提供给你的 MCP 客户端。OpenKB 会将完整令牌保存在数据库中，方便日后在设置中再次复制。

对于仅命令行设置，可以先创建浏览器会话，然后显式创建 API 令牌：

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"mcp-client"}'
```

第二个响应包含 `.token.value`。请妥善保存该值。`openkb.cookies` 文件仅包含本次设置所使用的临时浏览器会话，完成后请将其删除。

为 MCP 客户端会话导出环境变量（将占位符替换为复制的令牌值）：

```bash
export OPENKB_TOKEN="在此粘贴-token.value"
```

## 3. 添加初始知识

登录控制台并打开**知识库**。浏览预置的 MCP 指令，然后添加你自己的全局规则、Skill、规范、工作流或参考资料。全局生效的知识请将 **Project slug** 留空；项目特定知识请输入项目标识。

## 4. 连接 MCP 客户端

MCP 端点地址为：

```text
http://localhost:6800/mcp
```

请参阅具体客户端的使用指南：

- [Codex CLI](../integrations/codex-cli)
- [Grok CLI](../integrations/grok-cli)
- [ChatGPT](../integrations/chatgpt)
- [Antigravity IDE](../integrations/antigravity)

## 5. 注册 Agent 身份

每个 MCP 客户端需要：

- 由团队成员持有的 **Bearer 令牌**。
- 用于权限控制的 **Agent 名称**（如 `codex`、`grok` 等）。

在 MCP 客户端的连接设置中配置 Agent 名称：

```text
X-OpenKB-Agent: codex
```
