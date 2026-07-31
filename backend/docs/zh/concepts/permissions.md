# 权限

用户角色：`owner`、`admin`、`member`。owner 隐含 admin 权限。

| 能力 | Owner | Admin | Member |
|---|---:|---:|---:|
| 读取知识、搜索、获取上下文 | ✓ | ✓ | ✓ |
| 创建提案、编辑待处理提案 | ✓ | ✓ | ✓ |
| 写入/删除知识及版本 | ✓ | ✓ | – |
| 批准/拒绝/重新开启/删除提案 | ✓ | ✓ | – |
| 注册/删除 Agent | ✓ | ✓ | – |
| 读写应用设置 | ✓ | ✓ | – |
| 创建 `write` 权限令牌 | ✓ | ✓ | – |
| 创建用户 | ✓ | ✓（admin/member） | – |
| 更改用户角色 | ✓（任意） | ✓（member ↔ admin） | – |
| 编辑/删除非 owner 用户 | ✓ | ✓ | – |
| 管理 owner 账号（创建 owner、改设/撤销 owner、删除 owner） | ✓ | – | – |

规则：

- 仅 owner 可管理 owner 账号；最后一个 owner 不可被降级或删除。
- `member` 仅只读 + 提案。
- MCP 工具权限属于 Bearer 令牌（`read`/`propose`/`write`），与用户角色无关。owner 和 admin 可设置任意令牌等级；member 仅限 `read`/`propose`。
