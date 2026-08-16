# Configuration

OpenKB is configured with environment variables.

| Variable                 | Default     | Description                      |
| ------------------------ | ----------- | -------------------------------- |
| `OPENKB_HOST`            | `127.0.0.1` | Address the HTTP server binds to |
| `OPENKB_PORT`            | `6800`      | HTTP port                        |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite file path                 |
| `OPENKB_DATA_DIR`        | `./data`    | Persistent runtime directory     |

OpenKB uses SQLite (`better-sqlite3`), persistent data stores in `/data/openkb.db`, which is mounted to `./data/openkb.db` on the host by default.

## Authentication storage

OpenKB keeps browser authentication and MCP tokens separate:

- Users have `email`, display `name`, and `role` (`owner`, `admin`, or `member`). Owners and admins share the admin surface; owner additionally manages owner roles. Manage accounts in **Users**.
- User sign-in and registration create a 30-day browser session in an HttpOnly cookie. The session hash is stored in `user_sessions`.
- MCP/API tokens are created explicitly from **Settings → MCP tokens** or `POST /auth/tokens` (not on login).
- Each token carries an MCP permission level (`read`, `propose`, or `write`; default `propose`). Owners and admins may set any level; members are limited to `read`/`propose`. Admin permissions are managed via the web dashboard. The token's level gates the MCP tool surface; agent names are identity labels only and never change permissions.
- Full secrets live in `api_tokens.token_value`. Auth matches the bearer string to that column. Tokens can be listed, renamed, copied, and revoked in Settings.
- Signing out removes the browser session but does not revoke MCP/API tokens. Revoke those explicitly from Settings or `DELETE /auth/tokens/:id`.
- `OPENKB_TOKEN` is an environment variable used by the MCP client. It is not a server-side database setting.

## Role-based API authorization

Every `/v1/*` endpoint requires an authenticated session or bearer token. Beyond that, routes are split by the user's role:

- **Any authenticated user** can read knowledge, search, fetch context, create proposals, and edit open proposal content.
- **Owner or admin** can create/delete knowledge, delete knowledge versions, decide proposal status (approve/reject/reinstate), delete proposals, manage agents (create, delete), and read/write app settings.
- **Owner only** manages user accounts and owner roles (create/delete users, change roles, create owners).

Members are read + propose users; direct knowledge writes and review decisions require owner/admin. The same rules apply whether the request uses a browser session or a bearer token. (REST authorization uses the user role; MCP tool authorization uses the token permission level. See the MCP integration docs.)

## Public deployments

MCP requests require a bearer token. Put OpenKB behind HTTPS before allowing access outside a private network. Do not place a token in a URL query string or commit it to a repository.
