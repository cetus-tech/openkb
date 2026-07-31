# Permissions

User roles: `owner`, `admin`, `member`. Owner implies admin.

| Capability | Owner | Admin | Member |
|---|---:|---:|---:|
| Read knowledge, search, get context | ✓ | ✓ | ✓ |
| Create proposals, edit open proposals | ✓ | ✓ | ✓ |
| Write/delete knowledge and versions | ✓ | ✓ | – |
| Approve/reject/reinstate/delete proposals | ✓ | ✓ | – |
| Register/delete agents | ✓ | ✓ | – |
| Read/write app settings | ✓ | ✓ | – |
| Create `write`-permission tokens | ✓ | ✓ | – |
| Create users | ✓ | ✓ (admin/member) | – |
| Change user roles | ✓ (any) | ✓ (member ↔ admin) | – |
| Edit/delete non-owner users | ✓ | ✓ | – |
| Manage owner accounts (create owner, change to/from owner, delete owner) | ✓ | – | – |

Rules:

- Only the owner manages owner accounts; the last owner cannot be demoted or deleted.
- `member` is read + propose only.
- MCP tool permissions live on the bearer token (`read`/`propose`/`write`), not the user role. Owners and admins can set any token level; members are capped at `read`/`propose`.
