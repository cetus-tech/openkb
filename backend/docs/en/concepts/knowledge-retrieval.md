# Knowledge Retrieval

OpenKB selects context from active knowledge using the request's technology stack, project, and file path. Every matching item is eligible for delivery. There is no task-keyword scoring or per-item delivery policy.

## 1. Choose where knowledge applies

The knowledge editor has two choices:

| Applicability           | Rule                                                                   | Example                                                    |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Global**              | No technology requirement. Works even when the request has no stack.   | Anti-slop writing rules shared across projects.            |
| **Technology-specific** | Every selected technology must appear in the request's declared stack. | CodeIgniter 4 and PHP guidance requires both technologies. |

Choose the framework when guidance depends on one. PHP alone also matches Laravel projects; TypeScript alone also matches projects without Vue. Framework major versions are distinct: Vue 2 does not match Vue 3.

Project and path fields add restrictions to either choice:

- **Project slug:** the request must name that project. Without a project in the request, project-specific knowledge is excluded.
- **Path patterns:** at least one requested file must match at least one pattern. For example, `frontend/**` limits a Vue guide to frontend files. Missing paths and directory requests do not activate file-specific rules.

Leave both fields empty for knowledge that applies across projects and files. A global item with project or path restrictions must still match those restrictions.

For API/MCP authors, omit `stacks` for global knowledge. Technology-specific knowledge uses, for example, `"stacks": ["framework:codeigniter:4", "language:php"]` in the knowledge scope. MCP write tools accept `stacks` directly.

## 2. Send the declared stack

Agents should send the complete stack declared by the project, along with the current project-relative file path:

```json
{
    "projectSlug": "my-app",
    "path": "frontend/src/App.vue",
    "stack": ["language:typescript", "framework:vue:3"]
}
```

Pass these arguments to `openkb_get_context`. Use forward slashes in paths. An absolute path requires an explicit `root` so OpenKB can normalize it safely.

For this request, assuming no additional scope restrictions:

| Knowledge                 | Result   |
| ------------------------- | -------- |
| Global anti-slop rule     | Included |
| Vue 3 guide               | Included |
| TypeScript guide          | Included |
| CodeIgniter 4 + PHP guide | Excluded |
| Vue 2 guide               | Excluded |

A request without a stack can still receive global knowledge. Technology-specific knowledge needs a matching declaration. Mentioning a technology in task text does not activate its knowledge; task text is not used for selection or ordering. Knowledge titles, summaries, and content are not compared against a task description.

## 3. Use managed technology names

The **Technologies** page in the main menu provides a data table and add/edit modals. Administrators manage display names and aliases there. The knowledge editor and Context preview use the same catalog.

Canonical IDs use `language:<name>` or `framework:<name>:<major-version>`. They stay stable when display names change. Agents can call `openkb_list_technologies` to discover names, IDs, and accepted aliases.

Aliases are case-insensitive and unique across technologies. Updates apply to subsequent requests without a restart. Explicit canonical IDs also work before catalog registration; unknown free-text aliases appear in `diagnostics.unknownStack` instead of being guessed.

## 4. Read the complete result

All applicable knowledge follows the same delivery rules. The default budget is 4,000 estimated tokens, with a 12,000-token ceiling. A budget or item limit may prevent all full content from fitting in one response.

- Read full entries directly. For summaries or budget omissions, fetch each slug in `requiredFetch` with `openkb_get_knowledge` before relying on the knowledge.
- Follow `nextCursor` with the same request to retrieve remaining pages. `incompleteRequiredContext` means the current response does not contain all applicable full content. A stale cursor requires a fresh request.

Budget limits do not make matching knowledge optional. Responses expose omitted counts and fetch/continuation instructions rather than silently dropping it.

## 5. Preview and troubleshoot

On the **Knowledge** page, enter the project, file path, stack, and budget in **Context preview**. It uses the same retrieval logic as agent requests and shows returned items, match reasons, delivery form, and omission diagnostics.

If expected knowledge is missing, check its active status, selected technologies, project/path restrictions, and response budget. An empty scope, or a scope without `stacks`, is global. Older `required`, `auto`, and `manual` delivery policies no longer affect selection.

For an intentional cross-stack comparison, use explicit `discovery: true` or fetch a known active item by slug. Keyword search remains available through `openkb_search`; it is separate from automatic context selection.

See [MCP Integration](/docs/integrations/mcp) for connection details and tool examples.
