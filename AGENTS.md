# OpenKB MCP instructions

OpenKB is the durable source of project knowledge. Do not duplicate project knowledge in this file.

Before any non-trivial task:

1. Call the OpenKB MCP tool `openkb_get_context` with `projectSlug: "openkb"` and the current file path.
2. When the `X-OpenKB-Agent` header is not configured, include `agentName: "grok"` (or this client's stable name) in each OpenKB tool call.
3. Use the returned context when planning and implementing the task.

When a task changes durable project knowledge:

1. Use `openkb_remember` to propose durable knowledge for review (default). Attribution is the human who owns the MCP token, not a client author field.
2. Use `openkb_upsert_knowledge` only when this agent has write permission and a direct active save is intentional.
3. Do not leave durable project knowledge only in chat or in local instruction files.

Canonical agent instructions are stored in OpenKB as active knowledge `openkb-mcp-instructions` (seeded on install). Keep this file thin; update OpenKB when the rules change.
