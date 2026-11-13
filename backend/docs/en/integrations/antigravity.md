# Antigravity IDE

This guide connects Antigravity IDE to a running OpenKB server.

## 1. Prepare the token

Create or log in to an OpenKB account, then create a token from **Settings → MCP tokens**. For a server on another machine, use its HTTPS endpoint. For a local IDE, use:

```text
http://localhost:6800/mcp
```

## 2. Add OpenKB

Open the Antigravity MCP configuration file directly in your editor:


- macOS / Linux: `~/.gemini/config/mcp_config.json`
- Windows: `%USERPROFILE%\.gemini\config\mcp_config.json`

Create the file if it does not exist, or add the `"openkb"` entry to the existing `"mcpServers"` object:

```json
{
    "mcpServers": {
        "openkb": {
            "serverUrl": "http://localhost:6800/mcp",
            "headers": {
                "Authorization": "Bearer <your OpenKB token>",
                "X-OpenKB-Agent": "antigravity"
            }
        }
    }
}
```

For a remote server, replace `http://localhost:6800/mcp` with the remote HTTPS endpoint.

Save the file, then restart your Antigravity agent session so the MCP server loads.

## 3. Tell Antigravity to use OpenKB

To apply the OpenKB instruction to every Antigravity session in a project, add the following to that project's `AGENTS.md` (or create the file at the project root):

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when the token has `write` permission and a direct active save is intentional.
```

Restart your Antigravity agent session after configuration so the tools and rules load.

## 4. Verify

Ask the agent to call `openkb_get_context` with the current project slug and file path. Ask it to call `openkb_remember` after a meaningful discovery. Review the proposal in the OpenKB dashboard before it becomes active knowledge.
