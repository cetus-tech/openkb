# Grok CLI

This guide connects the Grok CLI (xAI Grok Build TUI) to an OpenKB server over Streamable HTTP.

## 1. Create an MCP token

Start OpenKB and create the first account in the web portal. Sign-in creates the browser session used by the portal. Then create an MCP token from **Settings → MCP tokens**. Or use the terminal flow below, which uses a temporary cookie session to create a named bearer token:

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

export OPENKB_TOKEN="$(curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"grok"}' \
  | jq -r '.token.value')"
```

Remove `openkb.cookies` after the command completes; the API tokens themselves are saved server-side only and use the `Authorization: Bearer` header (no client-side cookie involved). Keep `OPENKB_TOKEN` in your shell environment (for example in `~/.bashrc` or `~/.zshrc`). Grok expands `${OPENKB_TOKEN}` in MCP config at load time, so do not put the literal token in `config.toml` if you can avoid it.

## 2. Register the server

OpenKB is a remote Streamable HTTP MCP service. Register it with the Grok CLI:

```bash
grok mcp add --transport http openkb http://localhost:6800/mcp \
  --header 'Authorization: Bearer ${OPENKB_TOKEN}' \
  --header 'X-OpenKB-Agent: grok' \
```

For a remote server, replace the URL with its HTTPS endpoint. Single quotes around the header values keep the shell from expanding `${OPENKB_TOKEN}` before Grok reads the config.

The command writes to `~/.grok/config.toml`. The equivalent TOML is:

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
enabled = true

[mcp_servers.openkb.headers]
Authorization = "Bearer ${OPENKB_TOKEN}"
X-OpenKB-Agent = "grok"
```

Use the command-generated configuration or the TOML form, not both. The identity headers are not the bearer token; they only identify the client. Choose a stable agent name for each separate Grok instance.

To scope OpenKB to one repository instead of every project, add `--scope project` so the entry is written to `.grok/config.toml` in the current directory. Prefer `${OPENKB_TOKEN}` in project-scoped config so secrets are not committed.

Do not use stdio transport for a remote OpenKB server. OpenKB already exposes HTTP at `/mcp`; Grok talks to that URL directly.

## 3. Verify

```bash
grok mcp list
grok mcp doctor openkb
```

`doctor` should report a successful handshake and a non-zero tool count (for example nine tools at propose permission). Start a **new** Grok session after adding the server so tools are discovered for that session.

Ask Grok to call `openkb_list_types`. Then ask it to call `openkb_get_context` before a real task. A memory created with `openkb_remember` appears in OpenKB **Proposals**.

The first authenticated request creates `grok` in OpenKB **Agents** with `propose` permission. Open the portal's **Agents** page and change that identity to `write` if this Grok instance is trusted to save active knowledge directly. Do not create a second name for every session; use the same name for the same client instance.

In a running TUI session you can also open `/mcps`, confirm `openkb` is enabled, and press `r` after editing `config.toml` to refresh the server list.

## 4. Tell Grok to use OpenKB

Registering an MCP server makes its tools available, but you should also explicitly tell Grok when to use them. For a one-time instruction, start Grok with a prompt like this:

```text
Use the OpenKB MCP server for this task. Before starting any non-trivial work, call openkb_get_context with the current project and file path, then use the returned knowledge in your plan. Before finishing, call openkb_remember for any durable decision, rule, workflow, pitfall, or project context discovered during the task. Do not put OpenKB memories only in chat; propose them through the MCP tool.
```

To apply the instruction to every Grok session in a project, add the following to that project's `AGENTS.md` (or create the file at the project root). Grok loads `AGENTS.md` automatically as a project rule:

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when this agent has `write` permission and a direct active save is intentional.
```

Start a new Grok session after changing `AGENTS.md`. You can confirm that Grok is using OpenKB when its transcript shows calls to `openkb_get_context` before work and `openkb_remember` when it learns something durable.

Grok discovers MCP tools through `search_tool` and invokes them with `use_tool` using the fully qualified name (for example `openkb__openkb_get_context`). The agent identity and project scope can be refined with the optional headers and knowledge scope described in the [MCP integration guide](mcp).
