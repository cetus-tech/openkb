# OpenKB Overview

OpenKB is a versioned knowledge base for AI agents and developers. You write knowledge once, review changes, keep version history, and serve scoped context over MCP.

Agents store decisions, failed approaches, coding rules, and next steps in one place, then retrieve them in later sessions.

## Why OpenKB exists

Software projects accumulate knowledge that agents need:

- architecture notes
- coding rules
- implementation specs
- review workflows
- operational runbooks
- reusable prompts and skills
- decisions and references

Without a central source of truth, this knowledge scatters across chats, generated files, editor rules, team docs, and local notes. Agents forget the previous session, and people re-explain the same context.

OpenKB keeps canonical knowledge in the server database and serves it through MCP. Static generated files are not the product focus.

## The short version

```text
Humans and agents write knowledge
              ↓
OpenKB stores it as versioned Markdown knowledge items
              ↓
Humans review proposed changes
              ↓
Agents retrieve scoped context through MCP
              ↓
Agents propose new memories when they learn something durable
```

## Key concepts

| Concept       | Description                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| **Knowledge** | A single Markdown knowledge item, such as a rule, spec, workflow, runbook, skill, or reference.                 |
| **Version**   | An immutable snapshot created whenever a knowledge item is updated.                                             |
| **Scope**     | Metadata that says when a knowledge item is relevant: optional project and path patterns.                       |
| **Proposal**  | A suggested knowledge change awaiting review before it becomes canonical (`open` / `approved` / `rejected`).    |
| **Agent**     | A registered client identity (name + permission). Knowledge attribution uses the human who owns the MCP token.  |
| **User**      | A dashboard account (`name`, `email`, `role`) that can own MCP tokens and review proposals.                     |

## Knowledge is the canonical unit

Every OpenKB knowledge item has:

| Field       | Purpose                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| `slug`      | Globally unique identifier, such as `backend-architecture`.                                |
| `title`     | Human-readable title.                                                                      |
| `summary`   | Short explanation shown in lists and retrieval results.                                    |
| `type`      | Category of knowledge.                                                                     |
| `status`    | `active` (retrieved by agents) or `inactive` (hidden from agents; still in the dashboard). |
| `content`   | Full Markdown content.                                                                     |
| `scope`     | Optional project and path matching hints.                                                  |
| `version`   | Current version number (integer).                                                          |
| `createdBy` | Author of the current version (`created_by` on the version row).                           |

Supported knowledge types:

- `context`, `rule`, `spec`, `workflow`, `runbook`, `decision`, `reference`, `prompt`, `skill`, `template`

## Knowledge is global by slug

OpenKB uses globally unique knowledge slugs. It does not store project-owned knowledge items in a projects table.

Consequences:

- knowledge items are standalone canonical content
- slugs are unique across the OpenKB server
- primary keys are integer autoincrement IDs
- agents are registered globally by name (permissions only; attribution is the token owner)
- agents connect through MCP-compatible clients
- the web UI is the human review and administration surface (knowledge, proposals, agents, users, settings)

OpenKB is a canonical knowledge server and AI memory layer, not a per-project wiki. A client decides which context to request over MCP.

## Scope controls relevance

Scope returns compact, relevant context instead of every knowledge item on every request.

A knowledge item can be scoped by:

```json
{
    "projectSlug": "openkb",
    "pathPatterns": ["backend/src/api/**", "frontend/src/views/**"]
}
```

When a client asks for context, it can pass `path`, `projectSlug`, and `limit`. OpenKB filters out inactive knowledge items, checks scope, then ranks more specific matches higher. A path-specific API rule beats a broad generic note when you edit API code. Agent name does not filter retrieval.

## The normal workflow

### 1. Capture knowledge

Knowledge enters OpenKB through MCP tools or the web UI.

### 2. Store it as versioned knowledge

Creating or updating knowledge writes to the `knowledge` table (metadata and pointer) and the `knowledge_versions` table (immutable Markdown snapshots). Every update creates a new version.

### 3. Review agent-proposed changes

Agents without write permission do not rewrite team knowledge on their own.

1. agent discovers missing or outdated knowledge
2. agent creates a proposal
3. human reviews the proposal in the web UI
4. approval applies the change as a knowledge version

### 4. Retrieve context when working

Humans and agents retrieve knowledge by searching keywords, fetching by slug, or asking for scoped context.

### 5. Remember durable discoveries

When an agent learns something that should survive the current session, it calls `openkb_remember`.

## Architecture & Integration surfaces

```text
                    ┌──────────────┐
                    │    Web UI    │
                    │  (Vue SPA)   │
                    └──────┬───────┘
                           │
┌─────────┐    ┌───────────┴───────────┐    ┌──────────┐
│ Web UI  │◄──►│   OpenKB Server       │◄──►│  Agents  │
│(Human)  │    │      (MCP)            │    │  (MCP)   │
└─────────┘    └───────────┬───────────┘    └──────────┘
                           │
                    ┌──────┴──────┐
                    │  Database   │
                    │   SQLite   │
                    └─────────────┘
```

1. **MCP server**: primary agent-native interface for context, search, knowledge retrieval, proposals, and trusted writes.
2. **Web UI**: human browsing, knowledge import/export, proposals (including reinstate), agents, users, tokens, and documentation.

## A practical example

A team has three docs in OpenKB:

1. `api-auth-rules`: a rule scoped to `backend/src/api/**`
2. `vue-style-guide`: a rule scoped to `frontend/src/**`

If an agent is editing `backend/src/api/app.ts`, it asks for context via the `openkb_get_context` tool. OpenKB returns the active knowledge items that match the project and the API path. It does not return unrelated frontend styling notes.

If the agent learns that token revocation has a special rule, it proposes new knowledge or an update via `openkb_remember`. A human reviews it. If approved, OpenKB creates a new canonical knowledge version.

## Design principles

- **Canonical database**: OpenKB knowledge is the source of truth.
- **Versioned knowledge**: every knowledge update creates an immutable version.
- **Proposal-first workflow**: agents suggest durable knowledge without silently rewriting team docs.
- **Scope-aware retrieval**: agents receive matching context, not every knowledge item.
- **MCP-first access**: agents query knowledge dynamically instead of relying on static local files.
- **Self-hosted first**: Docker Compose and SQLite are the primary deployment path.

## Learn more

- [Knowledge Lifecycle](/docs/concepts/knowledge-lifecycle)
- [Quick Start](/docs/introduction/quickstart)
- [MCP Integration](/docs/integrations/mcp)
