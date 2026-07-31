# Codex CLI

This guide connects Codex CLI to an OpenKB server over Streamable HTTP.

## 1. Create an MCP token

Start OpenKB and create the first account in the web dashboard. Sign-in creates the browser session used by the dashboard. Then create an MCP token from **Settings → MCP tokens**. Or use the terminal flow below, which uses a temporary cookie session to create a named bearer token:

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

export OPENKB_TOKEN="$(curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"codex"}' \
  | jq -r '.token.value')"
```

Remove `openkb.cookies` after the command completes; the API tokens themselves are saved server-side only and use the `Authorization: Bearer` header (no client-side cookie involved). Keep `OPENKB_TOKEN` in your shell environment. Do not put the literal token in `config.toml`; logging in again does not change or revoke it.

## 2. Register the server

Run:

```bash
codex mcp add openkb \
  --url http://localhost:6800/mcp \
  --bearer-token-env-var OPENKB_TOKEN
```

For a remote server, replace the URL with its HTTPS endpoint.

Set the Codex identity in `~/.codex/config.toml` so OpenKB can register the client consistently:

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
bearer_token_env_var = "OPENKB_TOKEN"
http_headers = { "X-OpenKB-Agent" = "codex" }
```

Use the command-generated configuration or the TOML form, not both. The headers are not the bearer token; they only identify the client. Choose a stable agent name for each separate Codex instance. If your installed Codex CLI reports a different field name, run `codex mcp add --help` and keep the equivalent HTTP header configuration.

## 3. Verify

```bash
codex mcp list
```

Start a new Codex session and ask it to call `openkb_list_types`. Then ask it to call `openkb_get_context` before a real task. A memory created with `openkb_remember` appears in OpenKB **Proposals**.

The first authenticated request creates `codex` in OpenKB **Agents** with `propose` permission. Open the dashboard's **Agents** page and change that identity to `write` if this Codex instance is trusted to save active knowledge directly. Do not create a second name for every session; use the same name for the same client instance.

## 4. Tell Codex to use OpenKB

Registering an MCP server makes its tools available, but you should also explicitly tell Codex when to use them. For a one-time instruction, start Codex with a prompt like this:

```text
Use the OpenKB MCP server for this task. Before starting any non-trivial work, call openkb_get_context with the current project and file path, then use the returned knowledge in your plan. Before finishing, call openkb_remember for any durable decision, rule, workflow, pitfall, or project context discovered during the task. Do not put OpenKB memories only in chat; propose them through the MCP tool.
```

To apply the instruction to every Codex session in a project, add the following to that project's `AGENTS.md` (or create the file at the project root):

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when this agent has `write` permission and a direct active save is intentional.
```

Start a new Codex session after changing `AGENTS.md`. You can confirm that Codex is using OpenKB when its transcript shows calls to `openkb_get_context` before work and `openkb_remember` when it learns something durable. The agent identity and project scope can be refined with the optional headers and knowledge scope described in the [MCP integration guide](mcp).
