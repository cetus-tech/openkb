import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createKnex } from '../src/db/index.js';
import {
    createProposal,
    createKnowledgeGroup,
    deleteKnowledgeGroup,
    deleteKnowledgeVersion,
    getKnowledge,
    listKnowledge,
    listKnowledgeGroups,
    listKnowledgePage,
    listDocumentVersions,
    listProposals,
    reorderKnowledgeGroups,
    setKnowledgeGroup,
    updateProposalStatus,
    upsertKnowledge,
} from '../src/db/db-access.js';

async function sqliteDb() {
    const dir = await mkdtemp(join(tmpdir(), 'openkb-db-'));
    const db = createKnex({
        host: '127.0.0.1',
        port: 6800,
        dbClient: 'sqlite',
        sqliteFilename: join(dir, 'openkb.db'),
        dataDir: dir,
    });
    await db.migrate.latest();
    return { dir, db };
}

describe('db repository', () => {
    it('creates projects and versions knowledge', async () => {
        const { dir, db } = await sqliteDb();
        try {
            const created = await upsertKnowledge(db, {
                slug: 'testing',
                title: 'Testing',
                summary: 'Run tests',
                type: 'workflow',
                content: 'pnpm test',
                scope: { pathPatterns: ['tests/**'] },
            });
            expect(created.version).toBe(1);

            const updated = await upsertKnowledge(db, {
                slug: 'testing',
                title: 'Testing',
                summary: 'Run tests again',
                type: 'workflow',
                content: 'pnpm test && pnpm build',
                changeSummary: 'Add build step to the test workflow',
            });
            expect(updated.version).toBe(2);
            expect(
                (await getKnowledge(db, 'testing'))?.content,
            ).toContain('pnpm build');
            expect((await getKnowledge(db, 'testing'))?.scope).toEqual({ pathPatterns: ['tests/**'] });

            const cleared = await upsertKnowledge(db, {
                slug: 'testing',
                title: 'Testing',
                summary: 'Run tests without a target',
                type: 'workflow',
                content: 'pnpm test everywhere',
                scope: {},
            });
            expect(cleared.scope).toEqual({});
            // migrate.latest also seeds openkb-mcp-instructions
            expect(await listKnowledge(db)).toHaveLength(2);

            const history = await listDocumentVersions(db, 'testing', { pageSize: 2 });
            expect(history?.total).toBe(3);
            expect(history?.totalPages).toBe(2);
            expect(history?.versions.map((version) => version.version)).toEqual([3, 2]);
            expect(history?.versions[0].current).toBe(true);
            expect(history?.versions[0].content).toBe('pnpm test everywhere');
            const fullHistory = await listDocumentVersions(db, 'testing', { pageSize: 10 });
            const versionTwo = fullHistory?.versions.find((version) => version.version === 2);
            expect(versionTwo?.changeSummary).toBe('Add build step to the test workflow');

            const deletedCurrent = await deleteKnowledgeVersion(db, 'testing', String(fullHistory!.versions[0].id));
            expect(deletedCurrent.ok).toBe(true);
            if (deletedCurrent.ok) {
                expect(deletedCurrent.knowledge.version).toBe(2);
                expect(deletedCurrent.knowledge.content).toContain('pnpm build');
            }
            const afterDelete = await listDocumentVersions(db, 'testing', { pageSize: 10 });
            expect(afterDelete?.total).toBe(2);
            expect(afterDelete?.versions.find((version) => version.version === 3)).toBeUndefined();
            expect(afterDelete?.versions.find((version) => version.version === 2)?.current).toBe(true);
            // List knowledge must report remaining version number (not v0 from orphaned pointer).
            const listed = await getKnowledge(db, 'testing');
            expect(listed?.version).toBe(2);
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('paginates and filters the knowledge list', async () => {
        const { dir, db } = await sqliteDb();
        try {
            for (const [slug, title] of [['first-rule', 'First Rule'], ['second-rule', 'Second Rule'], ['third-runbook', 'Third Runbook']]) {
                await upsertKnowledge(db, {
                    slug,
                    title,
                    summary: `${title} summary`,
                    type: slug.endsWith('runbook') ? 'runbook' : 'rule',
                    content: `${title} content`,
                });
            }

            const page = await listKnowledgePage(db, { page: 2, pageSize: 2 });
            const filtered = await listKnowledgePage(db, { query: 'third', type: 'runbook' });

            // 3 fixtures + seeded openkb-mcp-instructions
            expect(page.total).toBe(4);
            expect(page.page).toBe(2);
            expect(page.knowledge).toHaveLength(2);
            expect(filtered.total).toBe(1);
            expect(filtered.knowledge[0].slug).toBe('third-runbook');
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('stores knowledge with active status by default', async () => {
        const { dir, db } = await sqliteDb();
        try {
            const proposal = await createProposal(db, {
                title: 'New Agent Rule',
                summary: 'Add rule',
                content: 'Use OpenKB first.',
            });
            expect(proposal.status).toBe('open');
            expect(await listProposals(db)).toHaveLength(1);
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('approves proposals atomically and preserves omitted scope', async () => {
        const { dir, db } = await sqliteDb();
        try {
            await upsertKnowledge(db, {
                slug: 'scoped-rule',
                title: 'Scoped Rule',
                summary: 'Original rule',
                type: 'rule',
                content: 'Original content',
                scope: { pathPatterns: ['src/**'] },
            });
            const proposal = await createProposal(db, {
                slug: 'scoped-rule',
                title: 'Scoped Rule',
                summary: 'Updated rule',
                type: 'rule',
                content: 'Updated content',
            });

            const approved = await updateProposalStatus(db, proposal.id, 'approved', 'owner');
            const knowledge = await getKnowledge(db, 'scoped-rule');

            expect(approved?.status).toBe('approved');
            expect(approved?.knowledgeId).toBe(knowledge?.id);
            expect(knowledge?.version).toBe(2);
            expect(knowledge?.scope).toEqual({ pathPatterns: ['src/**'] });
            expect(knowledge?.content).toBe('Updated content');
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('activates an inactive knowledge item when its proposal is approved', async () => {
        const { dir, db } = await sqliteDb();
        try {
            await upsertKnowledge(db, {
                slug: 'inactive-rule',
                title: 'Inactive Rule',
                summary: 'Inactive rule',
                type: 'rule',
                status: 'inactive',
                content: 'Old content',
            });
            const proposal = await createProposal(db, {
                slug: 'inactive-rule',
                title: 'Inactive Rule',
                summary: 'Restored rule',
                type: 'rule',
                content: 'Restored content',
            });

            await updateProposalStatus(db, proposal.id, 'approved', 'owner');
            const knowledge = await getKnowledge(db, 'inactive-rule');

            expect(knowledge?.status).toBe('active');
            expect(knowledge?.version).toBe(2);
            expect(knowledge?.content).toBe('Restored content');
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('rejects duplicate open proposals for one knowledge slug', async () => {
        const { dir, db } = await sqliteDb();
        try {
            await createProposal(db, {
                slug: 'new-rule',
                title: 'New Rule',
                summary: 'First proposal',
                content: 'First content',
            });

            await expect(createProposal(db, {
                slug: 'new-rule',
                title: 'New Rule',
                summary: 'Second proposal',
                content: 'Second content',
            })).rejects.toThrow('open proposal already exists');
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('reinstates a rejected proposal back to open', async () => {
        const { dir, db } = await sqliteDb();
        try {
            const proposal = await createProposal(db, {
                slug: 'reopen-rule',
                title: 'Reopen Rule',
                summary: 'Will reject then reopen',
                content: 'Content',
            });
            const rejected = await updateProposalStatus(db, proposal.id, 'rejected', 'owner');
            expect(rejected?.status).toBe('rejected');
            expect(rejected?.reviewedBy).toBe('owner');

            const reopened = await updateProposalStatus(db, proposal.id, 'open');
            expect(reopened?.status).toBe('open');
            expect(reopened?.reviewedBy).toBeUndefined();
            expect(reopened?.reviewedAt).toBeUndefined();

            await expect(updateProposalStatus(db, proposal.id, 'open')).rejects.toThrow('already open');
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('organizes knowledge into dashboard groups without changing list retrieval content', async () => {
        const { dir, db } = await sqliteDb();
        try {
            const parent = await createKnowledgeGroup(db, { name: 'Backend' });
            const child = await createKnowledgeGroup(db, { name: 'API', parentId: parent.id });
            await upsertKnowledge(db, {
                slug: 'api-rule',
                title: 'API Rule',
                summary: 'Rule for API',
                type: 'rule',
                content: 'Use Fastify',
            });
            await upsertKnowledge(db, {
                slug: 'loose-rule',
                title: 'Loose Rule',
                summary: 'Ungrouped',
                type: 'rule',
                content: 'Stay loose',
            });

            const moved = await setKnowledgeGroup(db, 'api-rule', child.id);
            expect(moved?.groupId).toBe(child.id);
            // Group assignment must not create a new version.
            expect(moved?.version).toBe(1);
            expect(moved?.content).toBe('Use Fastify');

            const inGroup = await listKnowledgePage(db, { groupId: child.id });
            expect(inGroup.total).toBe(1);
            expect(inGroup.knowledge[0]?.slug).toBe('api-rule');

            const ungrouped = await listKnowledgePage(db, { groupId: 'ungrouped' });
            // seeded openkb-mcp-instructions + loose-rule
            expect(ungrouped.knowledge.some((k) => k.slug === 'loose-rule')).toBe(true);
            expect(ungrouped.knowledge.every((k) => k.groupId == null)).toBe(true);

            // Full list (MCP-style) still returns everything regardless of groups.
            const all = await listKnowledge(db);
            expect(all.some((k) => k.slug === 'api-rule')).toBe(true);
            expect(all.some((k) => k.slug === 'loose-rule')).toBe(true);

            const payload = await listKnowledgeGroups(db);
            expect(payload.tree).toHaveLength(1);
            expect(payload.tree[0]?.name).toBe('Backend');
            expect(payload.tree[0]?.children[0]?.name).toBe('API');
            expect(payload.tree[0]?.children[0]?.knowledgeCount).toBe(1);

            await reorderKnowledgeGroups(db, [
                { id: parent.id, parentId: null, sortOrder: 0 },
                { id: child.id, parentId: null, sortOrder: 1 },
            ]);
            const reordered = await listKnowledgeGroups(db);
            expect(reordered.tree.map((g) => g.name)).toEqual(['Backend', 'API']);

            await deleteKnowledgeGroup(db, child.id);
            const afterDelete = await getKnowledge(db, 'api-rule');
            expect(afterDelete?.groupId).toBeNull();
        } finally {
            await db.destroy();
            await rm(dir, { recursive: true, force: true });
        }
    });
});
