# AI Agent Context File Conventions

This guide tracks popular AI coding agents and the repository files they read for project instructions. OpenKB should use this as implementation guidance when building agent connections, exports, and sync targets.

Status: working notes. Verify each integration against current upstream docs before shipping.

## Goals for OpenKB integrations

OpenKB should be able to:

1. Store canonical project knowledge once.
2. Export agent-specific instruction files with the correct names and locations.
3. Keep generated files clearly marked as generated.
4. Avoid overwriting human-authored files without an explicit merge/proposal flow.
5. Support both repository-level files and nested path-scoped rule files where agents support them.

Recommended export strategy:

- Universal baseline: `AGENTS.md`
- Agent-specific aliases: `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, etc.
- Generated marker at top of every exported file.
- A short bootstrap file per agent that points back to OpenKB as the source of truth.

## Summary table

| Agent / tool | Primary accepted project docs | Naming / location convention | Notes for OpenKB |
|---|---|---|---|
| Hermes Agent | `AGENTS.md`; skills as `SKILL.md`; general repo context files | `AGENTS.md` at repo/project root; project-specific skills under a skill directory as `SKILL.md` | Hermes loads project context from working directories and has first-class skills. Export `AGENTS.md`; consider exporting OpenKB workflows as Hermes skills later. |
| OpenAI Codex CLI | `AGENTS.md` | `AGENTS.md` at repo root and often nested in subdirectories for scoped instructions | Treat `AGENTS.md` as the canonical universal coding-agent export. Nested exports are useful for monorepos. |
| Claude Code | `CLAUDE.md` | `CLAUDE.md` at repo root; can also use user/global memory outside repo | Export concise repository instructions to `CLAUDE.md`. Keep it bootstrap-style and point to OpenKB-generated context where possible. |
| Google Gemini CLI / Gemini Code Assist | `GEMINI.md` | `GEMINI.md` at repo root; may support hierarchical discovery depending on tool version | Export `GEMINI.md` as Gemini-specific alias. Keep content compatible with markdown. |
| Cursor | Cursor Rules | `.cursor/rules/*.mdc` | Cursor rules can include metadata and path globs. Export one or more `.mdc` files, not just a single markdown file. |
| Windsurf / Cascade | Rules and memories; supports `AGENTS.md` in some flows | `.windsurf/rules/*.md`; `AGENTS.md` is also recognized in documented contexts | Export `.windsurf/rules/openkb.md` plus optional `AGENTS.md`. Treat memories as user/tool-managed, not OpenKB-generated unless explicitly requested. |
| OpenCode | `AGENTS.md` | `AGENTS.md` at repo root; provider/model config is separate | Export `AGENTS.md`. OpenCode is provider-agnostic and should work with the universal file. |
| OpenClaw | likely `AGENTS.md` / OpenClaw-specific config | Verify exact current convention before implementing | Treat as a Hermes/OpenCode/Codex-style coding agent. Add adapter after checking live docs. |
| GitHub Copilot Coding Agent / Copilot Chat | Repository custom instructions | `.github/copilot-instructions.md` | Export a concise Copilot-specific instruction file. GitHub also recognizes general repo docs for context, but this is the explicit custom-instructions path. |
| Continue | Assistant/rules config and custom context providers | `.continue/config.json` or `.continue/config.yaml`; rules may be configured in Continue config | Do not assume a single markdown filename. Integration should generate/patch Continue config or provide OpenKB as a context provider. |
| Cline | Cline rules | `.clinerules` and/or `.clinerules/` | Export `.clinerules/openkb.md` if directory mode is supported; otherwise a single `.clinerules` file. Verify current Cline version behavior. |
| Roo Code | Roo rules | `.roo/rules/`; mode-specific rule folders may exist | Export `.roo/rules/openkb.md`; consider mode-specific exports later. |
| Aider | Convention/instruction files and repo map | Commonly `CONVENTIONS.md` or files passed with `--read`; `.aider.conf.yml` can configure defaults | Export `CONVENTIONS.md` or an OpenKB markdown file and add it to Aider config if safe. |
| Devin | Devin knowledge / repo instructions | Usually configured in Devin UI/knowledge base; repo files may be read as normal context | Prefer API/UI integration or generated repo docs. Verify before adding a file adapter. |
| Sourcegraph Cody | Cody context and custom commands | `.sourcegraph/` config and repository context | Likely needs config/integration rather than only a markdown file. Verify current Cody docs. |
| Amazon Q Developer | Project context and customization | IDE/service-specific; no stable universal repo filename known | Use `AGENTS.md` fallback until a stable adapter is verified. |
| JetBrains AI Assistant / Junie | Project guidelines | JetBrains-specific project files may apply; verify exact filenames | Add adapter only after verification. Use `AGENTS.md` as portable fallback. |
| Zed Agent | Agent rules / context | Check current Zed docs; may recognize `AGENTS.md` or editor-specific rules | Verify before implementing. |
| Tabnine | Team/admin policy and context | Service/team configuration, not primarily repo files | Likely not a markdown export target. Consider API/admin integration later. |
| Qodo / PR-Agent | PR review config | `.pr_agent.toml` or `.github/pr_agent.toml` | This is review-bot config, not general coding-agent memory. Export only if OpenKB manages review policy. |
| Sweep / Sweep AI | Sweep config | `.github/sweep.yaml` or equivalent | Legacy/varies. Only support if user asks or project needs it. |

## Agent-specific notes

### Universal: `AGENTS.md`

`AGENTS.md` is becoming the closest thing to a cross-agent convention for repository-level AI coding instructions.

Recommended OpenKB behavior:

- Generate `AGENTS.md` at repo root by default.
- For monorepos, optionally generate nested `AGENTS.md` files for package-specific instructions.
- Put stable, high-signal rules only: architecture overview, commands, testing expectations, safety rules, and links to more detailed docs.
- Avoid huge dumps; many agents load this automatically into limited context.

Suggested header:

```markdown
<!-- Generated by OpenKB. Do not edit directly. Source: <openkb-project-url> -->
```

### Hermes Agent

Hermes can consume project-local instructions and reusable skills.

Relevant knowledge types:

- `AGENTS.md` for project/repository context.
- `SKILL.md` for reusable procedural skills.
- Additional project docs can be searched/read by tools, but `AGENTS.md` is the main portable export target.

OpenKB adapter ideas:

- Export `AGENTS.md` for every connected repo.
- Export selected workflows/runbooks as Hermes skills only when the user explicitly wants Hermes-specific procedure reuse.
- Keep project-specific knowledge in the repo, not global Hermes memory.

### OpenAI Codex CLI

Codex uses `AGENTS.md` for repository instructions.

OpenKB adapter ideas:

- Export root `AGENTS.md`.
- Support nested `AGENTS.md` for scoped package rules.
- Keep commands explicit and shell-ready.

### Claude Code

Claude Code commonly uses `CLAUDE.md` for project memory/instructions.

OpenKB adapter ideas:

- Export `CLAUDE.md` as a Claude-specific bootstrap.
- Keep it short enough for automatic loading.
- Include links or references to generated detailed files if needed.

Suggested bootstrap shape:

```markdown
# Claude Code Instructions

This file is generated by OpenKB. Use it as the project operating guide.

<project summary>
<commands>
<coding rules>
<testing rules>
```

### Gemini CLI / Gemini Code Assist

Gemini tooling commonly uses `GEMINI.md` for project instructions.

OpenKB adapter ideas:

- Export `GEMINI.md` as Gemini-specific alias.
- Prefer markdown and avoid tool-specific syntax unless verified.

### Cursor

Cursor uses rules under `.cursor/rules/`, commonly as `.mdc` files. Rules can include metadata such as description and path globs.

OpenKB adapter ideas:

- Export `.cursor/rules/openkb.mdc` for general rules.
- Export additional scoped rules such as `.cursor/rules/backend.mdc`, `.cursor/rules/frontend.mdc` when OpenKB has scoped knowledge.
- Preserve any human-authored `.cursor/rules/*` files unless explicitly managed by OpenKB.

Example `.mdc` frontmatter pattern:

```markdown
---
description: OpenKB-generated project rules
globs: ["**/*"]
alwaysApply: true
---

<rules>
```

### Windsurf / Cascade

Windsurf supports project rules and memories. Public docs mention `.windsurf/rules` and also reference `AGENTS.md` in some contexts.

OpenKB adapter ideas:

- Export `.windsurf/rules/openkb.md`.
- Also export `AGENTS.md` as the universal fallback.
- Do not manage Cascade memories by default; memories are runtime/user-specific, while OpenKB should manage reviewed project knowledge.

### OpenCode

OpenCode is a provider-agnostic coding agent. `AGENTS.md` is the safest repo instruction target.

OpenKB adapter ideas:

- Export `AGENTS.md`.
- Optional: generate an OpenCode-specific bootstrap only if OpenCode adds a stable file convention.

### OpenClaw

OpenClaw is in the same broad autonomous coding-agent category, but its current repo instruction file convention should be verified before implementation.

OpenKB adapter ideas:

- Start with `AGENTS.md` support.
- Add a dedicated adapter only after checking current OpenClaw docs/source.

### GitHub Copilot

GitHub Copilot supports repository custom instructions through `.github/copilot-instructions.md`.

OpenKB adapter ideas:

- Export `.github/copilot-instructions.md`.
- Keep the file concise and review-oriented.
- Include coding standards, testing expectations, and project-specific constraints.

### Continue

Continue is usually configured through `.continue/config.json` or `.continue/config.yaml`, with context providers and model settings.

OpenKB adapter ideas:

- Prefer an OpenKB context provider or MCP integration over a plain markdown export.
- If file export is needed, generate `.continue/openkb.md` and patch config only after user approval.

### Cline

Cline supports rule files such as `.clinerules` and, in newer setups, rule directories.

OpenKB adapter ideas:

- Export `.clinerules/openkb.md` if directory rules are available.
- Otherwise export a single `.clinerules` file, but avoid overwriting human-authored content without a merge flow.

### Roo Code

Roo Code supports project rules, commonly under `.roo/rules/`, with possible mode-specific rule directories.

OpenKB adapter ideas:

- Export `.roo/rules/openkb.md`.
- Later: map OpenKB knowledge scopes to Roo modes if needed.

### Aider

Aider can read convention/instruction files and can be configured with files to read automatically.

OpenKB adapter ideas:

- Export `CONVENTIONS.md` or `.aider/openkb.md`.
- Optionally update `.aider.conf.yml` to read that file, with approval.
- Avoid making `AGENTS.md` the only Aider integration unless verified for the installed version.

## Implementation guidelines for OpenKB

### 1. Model export targets explicitly

Suggested internal model:

```ts
type AgentExportTarget = {
  agent: string
  files: Array<{
    path: string
    format: 'markdown' | 'mdc' | 'toml' | 'yaml' | 'json'
    scope?: 'repo' | 'path' | 'mode' | 'user'
    overwritePolicy: 'managed-block' | 'whole-file-generated' | 'merge-required'
  }>
}
```

### 2. Prefer managed files or managed blocks

Whole-file generated targets are safe for files like:

- `AGENTS.md` when OpenKB owns it
- `CLAUDE.md` when OpenKB owns it
- `.cursor/rules/openkb.mdc`
- `.windsurf/rules/openkb.md`
- `.github/copilot-instructions.md`

Merge-required targets include:

- Existing human-authored `CLAUDE.md`
- Existing `.clinerules`
- `.continue/config.*`
- `.aider.conf.yml`
- `.pr_agent.toml`

### 3. Keep generated docs short

Agent instruction files should be compact. Put long docs in OpenKB and export summaries or pointers.

Recommended sections:

1. Project summary
2. Repository layout
3. Build/test/run commands
4. Coding conventions
5. Safety constraints
6. How to update knowledge

### 4. Support path-scoped exports

Some agents support nested or glob-scoped rules. OpenKB should preserve knowledge scope and export it as:

- nested `AGENTS.md`
- Cursor `globs` in `.mdc`
- multiple `.windsurf/rules/*.md`
- Roo mode/path rules where supported

### 5. Verify adapters continuously

Agent conventions change quickly. Each adapter should include:

- upstream docs/source URL
- date last verified
- supported file paths
- tests that generate expected paths
- migration behavior for renamed conventions

## Open questions to verify before implementation

- Exact current OpenClaw instruction file convention.
- Whether Zed Agent currently recognizes `AGENTS.md`, editor rules, or another filename.
- Current Cline support matrix for `.clinerules` file vs `.clinerules/` directory.
- Current Roo Code mode-specific rule directory names.
- Best Continue integration: config patch, MCP, context provider, or markdown export.
- Whether Antigravity has a stable native project-rules file, or whether `GEMINI.md` / `.gemini/` / MCP is the right adapter.
