import { createHash } from "node:crypto";
import type { Knex } from "knex";

/** Stable slug for the default MCP agent instructions knowledge item. */
export const OPENKB_MCP_INSTRUCTIONS_SLUG = "openkb-mcp-instructions";

export const openkbMcpInstructionsSeed = {
    slug: OPENKB_MCP_INSTRUCTIONS_SLUG,
    title: "OpenKB MCP Instructions",
    type: "rule" as const,
    status: "active" as const,
    summary:
        "How coding agents should use OpenKB MCP: get context before work, remember durable facts for review, and attribute writes to the token owner.",
    scope_json: "{}",
    content: `# OpenKB MCP Instructions

OpenKB is the durable source of project knowledge for AI agents and the people who keep it current. Prefer OpenKB over copying durable facts into chat, local instruction files, or one-off notes.

## Before non-trivial work

1. Call \`openkb_get_context\` with the best available scope:
   - \`projectSlug\` when the work is project-specific (for this repository use \`"openkb"\`)
   - \`path\` for the current file or directory
2. Identity for permissions:
   - Prefer the MCP header \`X-OpenKB-Agent\` with a stable name (for example \`codex\` or \`grok\`)
   - If headers cannot be set, pass \`agentName\` on each OpenKB tool call
3. Use the returned **active** knowledge when planning and implementing the task

Call \`openkb_whoami\` when you need to confirm permission level or which tools you can use.

## When durable knowledge should change

1. **Default:** \`openkb_remember\` — creates a reviewable proposal. It does **not** change active knowledge until a human approves it in the portal.
2. **Direct save:** \`openkb_upsert_knowledge\` only when this agent has **write** permission and an intentional active update is required.
3. Do not leave durable decisions only in chat or in local instruction files.

Knowledge attribution is the **human who owns the MCP bearer token**, not the agent name.

## Retrieval

- Only **active** knowledge is returned by search, context, list, and get tools
- **Inactive** knowledge is hidden from agents; manage it in the portal
- \`openkb_search\` — keyword search; omit \`query\` to list active items
- \`openkb_get_knowledge\` — full item by stable slug
- \`openkb_list_versions\` — version history for one slug
- \`openkb_list_types\` — valid knowledge types

## Scope (optional)

When proposing or writing knowledge, set scope only when it should be limited:

- \`projectSlug\` — project-specific knowledge
- \`pathPatterns\` — path globs (for example \`backend/frontend/**\`)

Omit scope fields for global knowledge used across projects.
`,
};

export function contentHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}

/**
 * Insert or refresh the default MCP instructions knowledge as version 1.
 * Existing multi-version histories keep version_number 1 updated in place.
 */
export async function seedOpenkbMcpInstructions(knex: Knex): Promise<void> {
    const seed = openkbMcpInstructionsSeed;
    const hash = contentHash(seed.content);
    const timestamp = new Date().toISOString();
    const changeSummary = "Default MCP agent instructions (seed)";

    const existing = await knex("knowledge").where({ slug: seed.slug }).first();
    if (!existing) {
        const [knowledgeId] = await knex("knowledge").insert({
            slug: seed.slug,
            title: seed.title,
            type: seed.type,
            status: seed.status,
            summary: seed.summary,
            scope_json: seed.scope_json,
            current_version_id: null,
            created_at: timestamp,
            updated_at: timestamp,
        });
        const kid = Number(knowledgeId);
        const [versionId] = await knex("knowledge_versions").insert({
            knowledge_id: kid,
            version_number: 1,
            content_markdown: seed.content,
            content_hash: hash,
            change_summary: changeSummary,
            created_by: "openkb",
            created_at: timestamp,
        });
        await knex("knowledge")
            .where({ id: kid })
            .update({
                current_version_id: Number(versionId),
                updated_at: timestamp,
            });
        return;
    }

    await knex("knowledge").where({ id: existing.id }).update({
        title: seed.title,
        type: seed.type,
        status: seed.status,
        summary: seed.summary,
        scope_json: seed.scope_json,
        updated_at: timestamp,
    });

    const v1 = await knex("knowledge_versions")
        .where({ knowledge_id: existing.id, version_number: 1 })
        .first();

    if (v1) {
        await knex("knowledge_versions").where({ id: v1.id }).update({
            content_markdown: seed.content,
            content_hash: hash,
            change_summary: changeSummary,
            created_by: "openkb",
        });
        await knex("knowledge").where({ id: existing.id }).update({
            current_version_id: v1.id,
            updated_at: timestamp,
        });
        return;
    }

    const [versionId] = await knex("knowledge_versions").insert({
        knowledge_id: existing.id,
        version_number: 1,
        content_markdown: seed.content,
        content_hash: hash,
        change_summary: changeSummary,
        created_by: "openkb",
        created_at: timestamp,
    });
    await knex("knowledge")
        .where({ id: existing.id })
        .update({
            current_version_id: Number(versionId),
            updated_at: timestamp,
        });
}
