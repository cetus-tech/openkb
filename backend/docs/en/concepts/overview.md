# OpenKB Overview

OpenKB is a shared, versioned knowledge base for AI agents and the people working with them. Keep coding rules, project decisions, reusable skills, and runbooks in one place so they remain available across sessions.

## How it works

1. **Write knowledge.** Create Markdown items in the dashboard. Each item has a stable slug, a summary, and version history.
2. **Review changes.** Agents use `openkb_remember` to propose new knowledge or corrections. Approval publishes a new version; pending and rejected proposals do not change active knowledge.
3. **Retrieve it.** Before work, an agent calls `openkb_get_context` with the project, file path, and declared technology stack. OpenKB returns applicable active knowledge.

## What agents receive

Set `stacks` only when an item requires specific technologies:

| Setting | Included when |
| --- | --- |
| **Global** | Omit `stacks` or leave it empty. The item applies to any technology stack, including an unknown stack. |
| **Technology-specific** | Set `stacks` to the required technologies. The request must include every selected technology. |

Optional project and path restrictions apply to either setting. Task keywords do not determine inclusion. Inactive knowledge is hidden from agents.

Manage technology names and aliases on the **Technologies** page. Use **Context preview** on the Knowledge page to check what a request receives.

## Working together

The dashboard provides knowledge editing, version history, and proposal review. Agents connect through MCP to retrieve knowledge and propose updates. Token permissions control which tools an agent can use; the human who owns the token receives authorship attribution.

Start with [Quick Start](/docs/introduction/quickstart), read the selection rules in [Knowledge Retrieval](/docs/concepts/knowledge-retrieval), or connect a client using [MCP Integration](/docs/integrations/mcp).
