# DeepSeek Harness (DSH)

This guide connects DeepSeek Harness (DSH) to an OpenKB server over Streamable HTTP.

## Overview

DeepSeek Harness connects to external Model Context Protocol (MCP) servers using its `@deepseek-ai/dsh-mcp-client` bridge plugin. Once configured, OpenKB tools register directly on the DSH tool registry under the `mcp__openkb__` namespace.

OpenKB provides a Streamable HTTP endpoint at `/mcp`. Do not use `stdio` transport for OpenKB; use `streamable-http`.

## 1. Create an OpenKB MCP token

Start OpenKB and sign in to the web dashboard. Open **Settings → MCP tokens** and create a bearer token:

- Use **propose** permission (default) for normal coding sessions. Knowledge created by the agent enters the review queue as a proposal.
- Use **write** permission only if you want the agent to directly create or update active knowledge.

Alternatively, generate a token using curl:

```bash
curl -c openkb.cookies -s http://localhost:6800/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

export OPENKB_TOKEN="$(curl -b openkb.cookies -s http://localhost:6800/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"dsh"}' \
  | jq -r '.token.value')"
rm openkb.cookies
```

Store `OPENKB_TOKEN` in your environment or keep the raw token ready for configuration.

## 2. Install the MCP client plugin in DSH

In DeepSeek Harness, plugins are managed per profile. Install the `@deepseek-ai/dsh-mcp-client` package into your active profile (such as `web` or `headless`):

```bash
# For Web GUI profile
dsh plugin --profile web add @deepseek-ai/dsh-mcp-client

# For headless profile
dsh plugin --profile headless add @deepseek-ai/dsh-mcp-client
```

This registers the MCP client bridge in the profile dependencies.

## 3. Configure `cordis.patch.yml`

Configure the OpenKB MCP connection in your profile patch file:

```text
$DSH_HOME/profiles/<profile>/cordis.patch.yml
```

For the default `web` profile, the path is typically `~/.dsh/profiles/web/cordis.patch.yml`.

> **Important file name note:** Ensure the file name is spelled exactly `cordis.patch.yml` (avoid typos such as `cordis.pathc.yml`).

### Entry placement: Must go under `- insert:`

DSH evaluates `cordis.patch.yml` as a patch layer over Cordis compositions. Top-level entries that do not match an existing ID cannot mount a new service. **You must place the MCP client plugin row inside an `- insert:` block.**

Add the following configuration to `cordis.patch.yml`:

```yaml
- insert:
    - id: mcp-openkb
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: openkb
        transport: streamable-http
        url: http://localhost:6800/mcp
        headers:
          Authorization: !!js '`Bearer ${process.env.OPENKB_TOKEN}`'
          X-OpenKB-Agent: dsh
        failOnStartupError: false
```

For a remote OpenKB instance, replace `http://localhost:6800/mcp` with your HTTPS endpoint (for example `https://kb.example.com/mcp`).

If you prefer a static bearer token instead of an environment variable, supply the string directly:

```yaml
- insert:
    - id: mcp-openkb
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: openkb
        transport: streamable-http
        url: http://localhost:6800/mcp
        headers:
          Authorization: Bearer <your-openkb-token>
          X-OpenKB-Agent: dsh
```

### Configuration fields

| Field | Description |
|---|---|
| `id` | Unique row identifier within your patch file (e.g. `mcp-openkb`). |
| `name` | Must be `@deepseek-ai/dsh-mcp-client`. |
| `config.serverName` | Local namespace identifier (`openkb`). Tools are prefixed with `mcp__<serverName>__`. |
| `config.transport` | Must be `streamable-http`. |
| `config.url` | Streamable HTTP endpoint URL (`/mcp`). |
| `config.headers.Authorization` | Bearer token header (`Bearer <token>`). |
| `config.headers.X-OpenKB-Agent` | Stable agent identifier label recorded in OpenKB Agents dashboard. |
| `config.failOnStartupError` | When `false` (default), connection failures log an error without crashing DSH. Set `true` to halt launch on failure. |

## 4. Restart DeepSeek Harness

Restart your DSH process to load the new plugin and patch configuration:

```bash
dsh web
```

## 5. Verify tool availability

Once connected, DSH discovers OpenKB tools and maps them into the harness tool registry with the prefix `mcp__openkb__`:

- `mcp__openkb__openkb_get_context`: Fetch relevant knowledge rules and specs.
- `mcp__openkb__openkb_search`: Search active knowledge.
- `mcp__openkb__openkb_get_knowledge`: Retrieve a complete knowledge item by slug.
- `mcp__openkb__openkb_remember`: Propose durable project context or guidelines.
- `mcp__openkb__openkb_whoami`: Inspect current agent identity and token permissions.

Test the connection in a DSH session by asking the model to run `mcp__openkb__openkb_whoami`. The output confirms your token permission and connected user.

## 6. Instruct DSH agents to use OpenKB

DSH agents discover tools automatically, but need guidance on when to invoke them. Add instructions to your project root `AGENTS.md`:

```markdown
# OpenKB MCP instructions

OpenKB is the durable source of project knowledge. Do not duplicate project knowledge in this file.

Before any non-trivial task:

1. Call `openkb_get_context` with `projectSlug` and the current file path.
2. Include the declared technology stack in `stack` (e.g. `["language:typescript", "framework:vue:3"]`).
3. Apply returned context to your plan and implementation.

When discovering durable rules, patterns, or architecture decisions:

1. Call `openkb_remember` to propose durable knowledge for human review.
2. Keep proposals scoped with appropriate technology facets, project slug, or path patterns.
```

The DSH agent will now consult OpenKB context before work and propose new memories when finding durable insights.
