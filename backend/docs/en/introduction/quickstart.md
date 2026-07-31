# Quick Start

OpenKB is a brain for AI agents. The agent-facing service is MCP; the web dashboard is where people add knowledge and review changes.

### MCP in plain language

MCP is the connection standard that lets an agent call OpenKB. You do not need to install a separate MCP server or learn a new command line tool: start OpenKB, give your agent the `/mcp` URL and bearer token, and the agent can use OpenKB's knowledge tools.

Docker Compose is the preferred installation method. This guide starts the complete OpenKB container and gets a local agent connected quickly. For the full Docker Compose and source-install tutorial, persistent storage, backups, and environment variables, see the [Installation guide](../installation.md).

## 1. Start the OpenKB container

From the `server` directory, start the Docker Compose service:

```bash
docker compose up -d
curl http://localhost:6800/health
```

The health response should be `{"ok":true}`. Open `http://localhost:6800` in a browser.

This starts the web dashboard and MCP endpoint in one container. Keep the `data/openkb.db` (or `./data/openkb.db` in source) so the SQLite database survives container restarts. For alternate deployment options, see the [full Installation guide](../installation.md).

## 2. Create the owner account

Choose **Create account** in the web dashboard. Provide a display **name**, email, and password. The first account becomes the owner. Registration and later sign-ins create a browser session only; they do not create or rotate MCP tokens.

After sign-in, the dashboard **Getting started** checklist walks through the remaining setup: create a token, add knowledge, connect an agent, and review memories. Fresh installs also seed global active knowledge `openkb-mcp-instructions` (agent workflow rules).

Open **Settings**, copy the MCP endpoint if needed, then under **MCP tokens** enter a name such as `codex` and choose **Create token**. Copy the full value for your MCP client. OpenKB stores the full token in the database so you can copy it again from Settings later.

For a terminal-only setup, create a browser session and then explicitly create an API token:

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"mcp-client"}'
```

The second response contains `.token.value`. Treat it like a password. The `openkb.cookies` file contains only the temporary browser session used for this setup; protect it and remove it when finished. The API tokens themselves are saved server-side only and use the `Authorization: Bearer` header (no client-side cookie involved).

Export it for the MCP client session (replace the placeholder with the copied value):

```bash
export OPENKB_TOKEN="paste-the-token.value-here"
```

Do not commit this value or paste it into an agent prompt.

## 3. Add initial knowledge

Sign in to the dashboard and open **Knowledge**. Browse the seeded MCP instructions, then add your own global rule, skill, specification, workflow, or reference. Leave **Project slug** empty for knowledge that applies everywhere. Set it for project-specific knowledge.

Optional scope fields narrow retrieval further:

- **Path patterns**: for example `backend/**`.

You can **import/export** Markdown (with YAML front matter including `created_by`), mark items **active** or **inactive**, and open an item for version history with Rendered/Raw Markdown.

## 4. Connect an MCP client

The endpoint is:

```text
http://localhost:6800/mcp
```

In ChatGPT, add a remote server from **Settings → Plugins → MCP**. Select **Streamable HTTP**, then use the HTTPS `/mcp` URL and the bearer token copied from OpenKB **Settings**. Do not select stdio; stdio is only for locally launched MCP processes.

Use the client-specific guides:

- [Codex CLI](../integrations/codex-cli)
- [Grok CLI](../integrations/grok-cli)
- [ChatGPT](../integrations/chatgpt)
- [Antigravity IDE](../integrations/antigravity)

For a remote agent, publish OpenKB behind HTTPS. `localhost` is reachable only from the same machine.

After connecting a client, explicitly tell the agent to use OpenKB MCP. For Codex CLI, put the instruction in the project's `AGENTS.md` so it is loaded for every session. The [Codex CLI guide](../integrations/codex-cli) includes copy-paste instructions for both a one-time prompt and a persistent project rule.

## 5. Register the agent identity

Every MCP client needs:

- A **bearer token** owned by a team member (knowledge attribution uses that user).
- An **agent name** (client-asserted) for permissions, such as `codex`, `grok`, or `codex-ci`.

`AGENTS.md` tells an agent to use OpenKB, but it does not register the agent identity. Configure the agent name in the MCP client's connection settings:

```text
X-OpenKB-Agent: codex
```

For Codex CLI, add that header to `~/.codex/config.toml` under `[mcp_servers.openkb]`; see the [Codex CLI guide](../integrations/codex-cli) for the complete example. If a client cannot set headers, include `agentName: "codex"` in each OpenKB MCP tool call. If it supports custom `tools/list` parameters, include them there too so the client sees its permission-specific tools. The OpenKB tools advertise these optional identity arguments.

### Codex CLI example

After exporting the token as `OPENKB_TOKEN`, register OpenKB with Codex:

```bash
codex mcp add openkb \
  --url http://localhost:6800/mcp \
  --bearer-token-env-var OPENKB_TOKEN
```

Then add the identity headers to `~/.codex/config.toml`:

```toml
[mcp_servers.openkb]
url = "http://localhost:6800/mcp"
bearer_token_env_var = "OPENKB_TOKEN"
http_headers = { "X-OpenKB-Agent" = "codex" }
```

Start a new Codex session and call `openkb_list_types`. The first authenticated request automatically creates the `codex` identity with `propose` permission. Check **Agents** in the dashboard and change it to `write` only when it is trusted to update active knowledge. Use `admin` only for an agent that must manage other agents.

Use the same identity on every session. Changing the name creates a second agent record with separate permission and activity history.

## 6. Use the agent memory loop

Ask the agent to call `openkb_get_context` before a non-trivial task. When it discovers a durable decision, rule, workflow, pitfall, or progress note, it should call `openkb_remember`. The proposal appears in **Proposals** for review and approval.

The normal flow is:

1. The agent retrieves relevant **active** knowledge before work.
2. The agent does the work using that context.
3. The agent records a durable discovery with `openkb_remember`.
4. The proposal stays separate from canonical knowledge while it is open.
5. You approve it to create the next knowledge version, or reject it to leave canonical knowledge unchanged. Rejected proposals can be reinstated for another review.

Agents do not need to know a fixed list of memories in advance. They can propose any durable Markdown knowledge that future sessions should retain. A trusted agent with `write` permission can update active knowledge directly, but use that permission only when you want to skip human review.

Manage dashboard accounts under **Users** (owners create members, set display names, and delete accounts).
