# Antigravity IDE

This guide connects Antigravity IDE to a running OpenKB server.

## 1. Prepare the token

Create or log in to an OpenKB account, then create a token from **Settings → MCP tokens**. For a server on another machine, use its HTTPS endpoint. For a local IDE, use:

```text
http://localhost:6800/mcp
```

## 2. Add OpenKB

You can configure the OpenKB MCP server directly through the Antigravity IDE UI:

1. Open the **MCP Servers** tab on the right panel.
2. Click **Manage MCP Servers**.
3. In the center panel, click **View Raw Config**.
4. Add the following configuration content into the file:

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

After saving, verify that the server is listed and shows as **Connected** in the MCP Servers panel.

## 3. Tell Antigravity to use OpenKB

To apply the OpenKB instruction to every Antigravity session in a project, add the following to that project's `AGENTS.md` (or create the file at the project root):

```markdown
## OpenKB memory

Use the configured OpenKB MCP server as the project's durable knowledge source.

- Before any non-trivial task, call `openkb_get_context` with the current project and path.
- Use relevant OpenKB results when planning and implementing the task.
- Before finishing, call `openkb_remember` to propose new knowledge or update an existing slug for review.
- Use `openkb_upsert_knowledge` only when this agent has `write` permission and a direct active save is intentional.
```

Restart your Antigravity agent session after configuration to ensure the tools and rules are loaded.

## 4. Verify

Ask the agent to call `openkb_get_context` with the current project slug and file path. Ask it to call `openkb_remember` after a meaningful discovery. Review the proposal in the OpenKB dashboard before it becomes active knowledge.
