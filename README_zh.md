# OpenKB 服务端

[English](README.md) | [简体中文](README_zh.md)

OpenKB Server 是一款专为 AI Agent 设计的自托管 SQLite 知识库服务。Agent 可通过内置的 MCP 端点连接；用户可以通过 Web 门户添加知识及审核提案记忆。

## 快速开始

创建一个 `docker-compose.yaml` 文件：

```yaml
services:
    openkb:
        image: ghcr.io/cetus-tech/openkb:latest
        container_name: openkb
        restart: unless-stopped
        environment:
            - OPENKB_DB_CLIENT=sqlite
            - OPENKB_SQLITE_FILENAME=/data/openkb.db
            - OPENKB_DATA_DIR=/data
            - OPENKB_HOST=0.0.0.0
            - OPENKB_PORT=6800
            - LOG_LEVEL=info
            - SIGNUP_ENABLED=true
        ports:
            - '6800:6800'
        volumes:
            - ./data:/data
        healthcheck:
            test:
                [
                    'CMD',
                    'node',
                    '-e',
                    "fetch('http://127.0.0.1:6800/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
                ]
            interval: 30s
            timeout: 5s
            retries: 3
```

启动服务：

```bash
docker compose up -d
curl http://localhost:6800/health
```

Web 门户和 API 服务运行在 `http://localhost:6800`。SQLite 数据库持久化存储在 `./data/openkb.db` 中。

## MCP 端点

```text
http://localhost:6800/mcp
```

该端点接收 Streamable HTTP JSON-RPC 请求。需要通过在 **设置 → 令牌 (Settings → Tokens)** 中显式创建 Bearer 令牌（或通过 `POST /auth/tokens` 接口）。仅登录不会自动创建 Agent 令牌。参考：

- [`backend/docs/zh/introduction/quickstart.md`](backend/docs/zh/introduction/quickstart.md)
- [`backend/docs/zh/integrations/mcp.md`](backend/docs/zh/integrations/mcp.md)
- [`backend/docs/zh/integrations/codex-cli.md`](backend/docs/zh/integrations/codex-cli.md)
- [`backend/docs/zh/integrations/grok-cli.md`](backend/docs/zh/integrations/grok-cli.md)
- [`backend/docs/zh/integrations/chatgpt.md`](backend/docs/zh/integrations/chatgpt.md)
- [`backend/docs/zh/integrations/antigravity.md`](backend/docs/zh/integrations/antigravity.md)

## Agent 工作流

1. 工作前调用 `openkb_get_context` 或 `openkb_search` 获取上下文。
2. 需要完整的知识条目时调用 `openkb_get_knowledge`。
3. 当需要在会话间持久化保存新发现时，调用 `openkb_remember`。
4. 在 Web 门户中审核并批准提案。

新创建的已认证 Agent 可以提交知识提案。管理员用户可在 Web 门户中将其提升为具有直接写入权限的信任 Agent。
