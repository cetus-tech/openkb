# Knowledge Lifecycle

This guide explains how knowledge moves through OpenKB.

```text
Capture → Version → Review → Retrieve → Remember → Improve
   ↑                                             │
   └──────────────── proposal loop ─────────────┘
```

## 1. Capture knowledge

OpenKB stores each knowledge item as Markdown.

Knowledge items can be created or updated through:

- **MCP**: agents search, retrieve context, and propose durable memories
- **Web UI**: human-facing management and review workflows

Each knowledge item has:

| Field       | Description                                                 |
| ----------- | ----------------------------------------------------------- |
| `slug`      | Globally unique identifier, such as `backend-architecture`. |
| `title`     | Human-readable title.                                       |
| `summary`   | Short description used in lists and retrieval results.      |
| `type`      | Knowledge category.                                         |
| `status`    | `active` or `inactive`.                                     |
| `content`   | Full Markdown content.                                      |
| `scope`     | Optional matching hints for projects and paths.             |
| `createdBy` | Author of the current version (version `created_by`).       |

Supported knowledge types:

- `context`
- `rule`
- `spec`
- `workflow`
- `runbook`
- `decision`
- `reference`
- `prompt`
- `skill`
- `template`

Supported statuses:

- `active`: retrieved by MCP search/context
- `inactive`: hidden from agents; kept for history/management

Only `active` knowledge items are used for normal search/context retrieval.

People usually create active knowledge in the web dashboard. Agents use `openkb_remember`, which creates a proposal instead of changing the active item immediately.

## 2. Version knowledge

Every knowledge upsert creates an immutable version.

OpenKB stores metadata in `knowledge` and Markdown snapshots in `knowledge_versions`.

When a knowledge item is updated:

1. OpenKB writes a new version row.
2. The knowledge item's current version pointer moves to the new version.
3. Older versions remain stored for history and recovery.

Canonical knowledge keeps full history. Copying loose Markdown between tools does not.

Each version can store a short **change note** (`changeSummary`) that explains what changed. In the dashboard Knowledge editor, that field is optional when you edit an existing item. If you omit it, OpenKB falls back to the knowledge summary. Approved proposals use the proposal summary as the version change note.

The dashboard **Knowledge** list defaults to active items, supports search, filters, pagination, Markdown import/export, and per-row active/inactive toggles. Opening an item shows a version timeline and a **Rendered / Raw** Markdown pane. Older versions are read-only snapshots; deleting a knowledge item also removes its stored version history. Individual historical versions can be deleted when more than one remains.

If an update does not provide new scope metadata, OpenKB keeps the existing scope. If an explicit scope is provided, it replaces the previous scope. A plain content edit does not widen or narrow who receives the knowledge by accident.

## 3. Review proposed changes

Agents often discover missing or stale knowledge while working. OpenKB supports a proposal-first loop so agents can suggest durable updates without silently changing the source of truth.

```text
agent notices missing knowledge
          ↓
agent creates proposal
          ↓
human reviews proposal
          ↓
approve → OpenKB writes a knowledge version
reject  → canonical knowledge stays unchanged
```

### Proposed Knowledge (Drafts & Memories)

When an agent without direct write permission calls `openkb_remember`, OpenKB creates a **proposal** (`status: open`). A human can review, edit, approve, or reject proposals in the dashboard.

Approval is one transaction: the proposal is marked approved only after the new knowledge version has been written. For a new proposal, approval creates the knowledge item; for an update, approval increments the existing version. Rejected proposals remain in the review history and never become retrievable knowledge. A rejected proposal can be **reinstated** (`status: open`) when no other open proposal exists for the same slug.

In the dashboard, **Proposals** can be filtered by status (including deep links from the dashboard). The detail page shows proposed content beside current active knowledge (when the slug already exists), with Rendered/Raw Markdown panes, scope, and approve / reject / reinstate actions.

## 4. Retrieve scoped context

OpenKB can return relevant context for the current project and file path.

Example scope:

```json
{
    "projectSlug": "openkb",
    "pathPatterns": ["backend/src/api/**", "frontend/src/views/**"]
}
```

Example context request via MCP:

The agent invokes the `openkb_get_context` tool with `path="backend/src/api/app.ts"`.

OpenKB filters inactive knowledge items, checks scope, then ranks more specific matches higher. A knowledge item scoped to `backend/src/api/**` beats a broad general note when the current path is `backend/src/api/app.ts`.

## 5. Inactive Knowledge

Knowledge can be deactivated at any time from the dashboard editor without losing its history.

- **`status: inactive`**: Retained in database history, visible in the web UI, but skipped during retrieval.
- **`status: active`**: Included in vector context lookup, keyword search, and listing tools.

MCP search and context skip inactive items. Use the web dashboard to inspect, restore, or manage inactive knowledge.

## 6. Remember what changed

After an agent finishes work, it should propose durable knowledge that future sessions should know. The MCP-first path is:

1. call `openkb_get_context` before work
2. do the task
3. call `openkb_remember` for durable findings
4. human approves useful proposals in the web UI

This path replaces the older static-export-first workflow. OpenKB acts as an AI memory layer. It does not generate editor-specific files as its main job.

## 7. Improve the knowledge base

The loop continues as agents and humans work:

- search OpenKB before non-trivial changes
- retrieve scoped context for the current path
- propose missing or corrected knowledge
- approve useful proposals so future agents can retrieve them

Project knowledge stays current, and agents only load the items they need.
