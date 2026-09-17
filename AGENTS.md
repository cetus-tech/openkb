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

## Project stack

- Backend: Node.js, TypeScript, Fastify, and SQLite
- Frontend: Vue 3 and TypeScript

## OpenKB context request

Before non-trivial work, call `openkb_get_context` with `projectSlug: "openkb"`,
the project-relative path and the complete declared stack:
`language:typescript`, `framework:vue:3` (plus any component-specific facets).
Use the returned match reasons,
required-fetch notices, summaries, and cursors; fetch required or summarized
knowledge by slug before relying on its full guidance. Use `discovery: true` only
for an intentional comparison or migration search. If dependencies contradict
this declaration, report the mismatch rather than silently rewriting this file.

## Stack facet format

Send `stack` as an array of lower-case canonical facets:

- `language:<name>`, such as `language:typescript`
- `framework:<name>:<major-version>`, such as `framework:vue:3`

For this repository, the normal declaration is:
`["language:typescript", "framework:vue:3"]`.
OpenKB accepts common aliases such as `Vue 3`, `Vue:3`, `vue3`, and `vue@3`,
then normalizes them to `framework:vue:3`. Prefer the canonical form so the
request is unambiguous. The `language:` or `framework:` prefix is authoritative;
OpenKB uses an explicit alias registry rather than guessing the category of an
unknown name. Bare or unversioned names such as `Vue` are reported in
`diagnostics.unknownStack` and do not activate version-specific knowledge.
