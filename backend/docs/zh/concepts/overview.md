# OpenKB 概览

OpenKB 是供 AI Agent 和开发者共同使用的版本化知识库。将编码规则、项目决策、可复用技能和操作手册保存在同一处，让后续会话可以继续使用。

## 如何使用

1. **编写知识。** 在控制台创建 Markdown 条目。每个条目有稳定的 slug、摘要和版本历史。
2. **审核变更。** Agent 通过 `openkb_remember` 提出新知识或修正。批准后发布新版本；待审核或被拒绝的提案不会改变有效知识。
3. **检索知识。** 工作前，Agent 调用 `openkb_get_context`，提供项目、文件路径和声明的技术栈。OpenKB 返回适用的有效知识。

## Agent 会收到什么

为每个条目选择一种适用范围：

| 设置 | 返回条件 |
| --- | --- |
| **Global（全局）** | 适用于任何技术栈，包括未知技术栈。适合 anti-slop 等通用规则。 |
| **Technology-specific（技术栈专用）** | 请求包含所有选中的技术。CI4 指南需要匹配 CodeIgniter 4，仅 PHP 不够。 |

两种设置都可以附加项目和路径限制。任务关键词不决定是否返回知识。未激活的知识对 Agent 隐藏。

在 **Technologies（技术栈）** 页面管理技术名称和别名。在知识页面使用 **Context preview（上下文预览）** 检查请求会收到哪些内容。

## 协作方式

控制台用于编辑知识、查看版本历史和审核提案。Agent 通过 MCP 检索知识并提出更新。令牌权限决定可用工具，知识作者归属为令牌所属的人类用户。

从[快速开始](/docs/introduction/quickstart)入门，在[知识检索](/docs/concepts/knowledge-retrieval)了解筛选规则，或按 [MCP 集成](/docs/integrations/mcp)连接客户端。
