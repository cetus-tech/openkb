# 贡献指南

OpenKB 使用 TypeScript、测试，以及为每次数据库 Schema 变更提供的独立 SQLite/MySQL 迁移脚本。

## 产品边界

OpenKB 以 MCP 为中心、Docker 托管且基于 Web。

请勿添加：

- 本地 Agent 集成包
- `vscode/` 下的 VS Code 扩展
- 桌面应用架构
- 作为主要集成路径的静态导出流程

请将变更集中在：

- MCP 工具和协议行为
- 基于数据库的知识条目和提案
- Web UI 管理/审核流程（在可用时优先使用 **Naive UI** 组件）
- Docker/自托管交付
- 由应用对外提供的面向用户的文档

在更改 Schema 时：请添加 SQLite **和** MySQL 迁移（或仅在故意压平压缩时压入基线）。保持 `backend/docs/` 下的产品文档与实际行为同步。

## 开发工作流

后端：

```bash
cd backend
pnpm install
pnpm test
pnpm build
```

前端：

```bash
cd frontend
pnpm install
pnpm test
pnpm build
```

## 代码规范

- 仅使用 TypeScript。
- 优先使用 async/await。
- 仅使用具名导出（Named exports），除非工具有特殊要求。
- 测试代码存放在与 `src/` 平级的 `tests/` 目录中，而不是嵌套在源码目录下。
- 添加/修改 MCP 工具时，请更新 MCP 文档。
- 添加/修改 HTTP 端点时，请更新 API 文档。
