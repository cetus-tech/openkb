# 项目结构

OpenKB 是一个服务器/Web 应用，在代码库中包含两个包：

```
backend/
├── backend/             # Fastify 服务器 + MCP 端点
│   ├── src/
│   │   ├── api/         # 内部路由、认证、文档、静态 UI 服务
│   │   ├── config/      # 配置加载器（环境变量）
│   │   ├── core/        # 知识模型和检索逻辑
│   │   ├── db/          # Knex 设置、迁移、种子文件和数据库访问
│   │   │   ├── migrations/    # 编号的 SQLite 迁移
│   │   │   └── seeds/         # 安装预置种子知识（例如 MCP 指令）
│   │   └── mcp/         # Agent 集成的 MCP 工具服务器
│   ├── docs/            # 由 /v1/docs 对外提供的产品文档
│   ├── dist/            # 编译后的后端 + 构建后的前端
│   └── package.json
│
├── frontend/            # Vue 3 单页应用 (SPA)
│   └── src/
│       ├── views/       # 首页、文档、控制台页面
│       ├── components/  # 布局、知识 Markdown 面板、表单
│       ├── stores/      # Pinia 状态管理
│       └── router/      # Vue Router 配置
│
├── AGENTS.md            # 指向 OpenKB MCP 工作流的薄指针文件（预置种子知识是规范）
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
└── README.md
```

## backend/

后端拥有规范知识模型、持久化、内部路由、MCP 端点、认证（用户、Session、令牌）、文档服务以及生产环境静态前端服务。它使用 SQLite（`better-sqlite3`）。

## frontend/

Web UI 是面向人类的：配置、知识（搜索、导入/导出、版本、Markdown 渲染/源码）、审核提案、管理 Agent、用户、令牌以及阅读文档。在覆盖需求时优先使用 Naive UI 组件。

## 范围之外

Agent 通过兼容 MCP 的客户端进行连接，人类使用 Web UI。
