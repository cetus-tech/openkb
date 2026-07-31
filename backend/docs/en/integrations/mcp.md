# MCP Integration

OpenKB exposes one agent service: a Streamable HTTP MCP endpoint at `/mcp`. It runs in the same container as the web dashboard and reads/writes the same SQLite database.

## MCP in plain language

MCP is the protocol between an agent client and OpenKB. OpenKB is the MCP server; Codex, Grok, ChatGPT, Cursor, and similar tools are MCP clients. A client sends requests to `/mcp`, OpenKB runs a knowledge tool, and the result is returned to the agent. You configure a URL and token in the client; you do not run a second MCP process.

## Connection details

| Setting | Value |
|---|---|
| Endpoint | `http://localhost:6800/mcp` for a local install |
| Transport | Streamable HTTP; do not use stdio for a remote OpenKB server |
| MCP authentication | `Authorization: Bearer <OpenKB API token>` |
| Web authentication | HttpOnly browser session cookie |
| Identity header | `X-OpenKB-Agent: codex` (identity label only; permissions come from the token) |

Browser login and MCP authentication are separate. Login creates a browser session; it does not create or rotate an API token. Create a token from **Settings → MCP tokens** or the authenticated `POST /auth/tokens` endpoint. The full token is stored in the database and can be copied again from Settings. Never share it in a prompt or commit it to a project file.

For a terminal client, authenticate the token-management request with the browser session cookie, then use the returned value as the MCP bearer token:

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-mcp-client"}'
rm openkb.cookies
```

The second response contains `.token.value` (also stored server-side so Settings can copy it again). Export that value as `OPENKB_TOKEN` or enter it in the MCP client’s bearer-token setting. The API tokens themselves are saved server-side only and use the `Authorization: Bearer` header (no client-side cookie involved).

The authentication endpoints have separate responsibilities:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Verify a user password and set the browser session cookie |
| `POST` | `/auth/register` | Create an account (`name`, `email`, `password`); first user is owner |
| `POST` | `/auth/tokens` | Create one named bearer token with a permission level for an MCP/API client |
| `GET` | `/auth/tokens` | List tokens owned by the signed-in user (includes full `value`) |
| `PATCH` | `/auth/tokens/:id` | Rename a token or change its permission (members: read/propose only) |
| `DELETE` | `/auth/tokens/:id` | Explicitly revoke one bearer token |
| `POST` | `/auth/logout` | End the browser session without revoking bearer tokens |
| `GET` | `/v1/users` | List dashboard users |
| `POST` | `/v1/users` | Create a user (owner only) |
| `PATCH` | `/v1/users/:id` | Update name, role, or password |
| `DELETE` | `/v1/users/:id` | Delete a user (owner only) |

For a remote installation, use an HTTPS endpoint such as `https://kb.example.com/mcp`. A client running on another machine cannot reach `localhost` on the OpenKB host.

For ChatGPT, add the server from **Settings → Plugins → MCP**. Enter the remote `/mcp` URL and the OpenKB bearer token.

## Agent identity and permissions

OpenKB identity has two layers:

- **Bearer token**: authenticates the request, identifies the **human owner**, and **carries the MCP permission** (`read`, `propose`, or `write`). Knowledge and proposals are attributed to that user (`createdBy`).
- **Agent name**: client-asserted (`agentName` / `X-OpenKB-Agent`) identity label. It is registered for the Agents dashboard and used for display, but it **never changes permissions**.

Configure the agent name as an HTTP header when the MCP client supports custom headers:

```text
X-OpenKB-Agent: codex
```

For clients that cannot send custom headers, pass `agentName` in the `arguments` object of each OpenKB tool call. If the client also lets you customize the initial `tools/list` request, include the same fields in its `params` so permission-specific tools are advertised immediately. These optional fields are included in the tool schemas. `AGENTS.md` is only the instruction that tells an agent to call OpenKB; it is not the identity registration mechanism.

The first authenticated request with a new agent name registers it automatically in **Agents** as an identity label. OpenKB also records the last MCP token used by that agent (shown on the Agents page). Tool permissions are a property of the **bearer token**, not the name: the owner sets a token's level in **Settings → Tokens** (`read`, `propose`, or `write`), and members can only create `read`/`propose` tokens. Admin permissions are managed via the web dashboard. Claiming any agent name, even an existing one, never changes the tools your token grants.

Use a stable agent name so the Agents page shows one identity per client, and create a separate token when a client needs a different permission. For example, use one `propose` token for everyday work and a separate `write` token for a trusted CI identity.

## Available tools

Tools are **permission-gated by the bearer token**. Clients only see tools the request token allows. The schema keeps a short list of goal-oriented tools and exposes higher-privilege tools only to trusted credentials.

| Permission | Typical tool count | Tools |
|---|---:|---|
| `read` | 6 | `openkb_whoami`, `openkb_get_context`, `openkb_search`, `openkb_get_knowledge`, `openkb_list_types`, `openkb_list_versions` |
| `propose` (default for new tokens) | 9 | read tools + `openkb_remember`, `openkb_list_proposals`, `openkb_get_proposal` |
| `write` | 11 | propose tools + `openkb_upsert_knowledge`, `openkb_delete_knowledge` |

### Read tools

| Tool | Purpose |
|---|---|
| `openkb_whoami` | Resolved agent name, token owner, token permission, server version, and tools available at that level |
| `openkb_get_context` | **Primary entry:** most relevant active knowledge for project and path |
| `openkb_search` | Search active knowledge; omit `query` to list active items (optional path/type filters) |
| `openkb_get_knowledge` | Fetch one complete active item by slug |
| `openkb_list_types` | List valid knowledge types |
| `openkb_list_versions` | Version history for one knowledge item |

### Propose tools (reviewable writes)

| Tool | Purpose |
|---|---|
| `openkb_remember` | Propose new knowledge or a full replacement of an existing slug; does not change active knowledge until approved |
| `openkb_list_proposals` | List proposals (default: open) |
| `openkb_get_proposal` | Fetch one proposal by id, including full proposed Markdown |

### Write tools (write tokens only)

| Tool | Purpose |
|---|---|
| `openkb_upsert_knowledge` | Create or update **active** knowledge directly (skips review) |
| `openkb_delete_knowledge` | Delete a knowledge item by slug |

Approving or rejecting proposals remains a **dashboard** action for humans (or the REST API). Agents have no MCP approve tool.

### Compact tool surface

MCP clients load every advertised tool schema into the model context. OpenKB keeps that surface small:

- Merges list + search into `openkb_search` (omit `query` to list).
- Uses a single propose path: `openkb_remember` (new or update by slug).
- Exposes write tools only when the token has write permission.
- Leaves human workflow (approve proposal, manage tokens) in the web dashboard.

## What happens to a change

There are two safe ways to change knowledge:

- A human saves knowledge from the web dashboard. It becomes active immediately and starts a new version.
- A client using a `propose` token calls `openkb_remember`. OpenKB creates an open proposal and leaves the current active knowledge unchanged. A human can approve it to create the next version or reject it without changing canonical knowledge.

Only active knowledge is returned by normal MCP search, context, list, and single-item retrieval. Inactive items remain available to humans in the dashboard for management and history, but they do not silently influence an agent.

A client using a `write` token can call `openkb_upsert_knowledge` to save active knowledge directly. Grant `write` only to explicitly trusted tokens; proposal mode is the safer default.

## Scope

Knowledge is global when `projectSlug` is omitted. Set `projectSlug` for project-related knowledge. Any knowledge item can also include `pathPatterns`. Knowledge attribution comes from the token owner; agent name does not filter retrieval.

## Example requests

Initialize and list tools:

```bash
curl -s https://kb.example.com/mcp \
  -H "Authorization: Bearer $OPENKB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"example","version":"1.0"}},"id":1}'
```

Retrieve project context:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "openkb_get_context",
    "arguments": {
      "agentName": "codex",
      "projectSlug": "openkb",
      "path": "backend/src/api/app.ts",
      "limit": 8
    }
  },
  "id": 2
}
```

Remember a new discovery:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "openkb_remember",
    "arguments": {
      "title": "Authentication review rule",
      "summary": "Protected routes must validate bearer tokens before querying the database.",
      "type": "rule",
      "projectSlug": "openkb",
      "pathPatterns": ["backend/src/api/**"],
      "content": "# Authentication review rule\n\nValidate bearer tokens before protected routes access the database."
    }
  },
  "id": 3
}
```

The proposal is visible in the web dashboard. Approval creates or updates the canonical knowledge item and increments its version.
