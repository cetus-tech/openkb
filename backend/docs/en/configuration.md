# Configuration

OpenKB is configured with environment variables. The current MVP uses SQLite.

| Variable                 | Default     | Description                      |
| ------------------------ | ----------- | -------------------------------- |
| `OPENKB_HOST`            | `127.0.0.1` | Address the HTTP server binds to |
| `OPENKB_PORT`            | `6800`      | HTTP port                        |
| `OPENKB_DB_CLIENT`       | `sqlite`    | Database adapter                 |
| `OPENKB_SQLITE_FILENAME` | `openkb.db` | SQLite file path                 |
| `OPENKB_DATA_DIR`        | `./data`    | Persistent runtime directory     |

For Docker, the compose file sets `OPENKB_HOST=0.0.0.0` and stores the database at `/data/openkb.db`, which is mounted to `./data/openkb.db` on the host.

## Authentication storage

OpenKB keeps browser authentication and MCP tokens separate:

- Users have `email`, display `name`, and `role` (`owner` or `member`). Manage accounts in **Users** (owners create/delete accounts and change roles).
- User sign-in and registration create a 30-day browser session in an HttpOnly cookie. The session hash is stored in `user_sessions`.
- MCP/API tokens are created explicitly from **Settings → MCP tokens** or `POST /auth/tokens` (not on login).
- Full secrets live in `api_tokens.token_value`. Auth matches the bearer string to that column. Tokens can be listed, renamed, copied, and revoked in Settings.
- Signing out removes the browser session but does not revoke MCP/API tokens. Revoke those explicitly from Settings or `DELETE /auth/tokens/:id`.
- `OPENKB_TOKEN` is an environment variable used by the MCP client. It is not a server-side database setting.

## Public deployments

MCP requests require a bearer token. Put OpenKB behind HTTPS before allowing access outside a private network. Do not place a token in a URL query string or commit it to a repository.
