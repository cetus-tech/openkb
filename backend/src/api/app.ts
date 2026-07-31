import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve, extname, relative } from 'path';
import { fileURLToPath } from 'url';
import { OPENKB_VERSION, knowledgeTypes } from '../core/index.js';
import { serveStatic } from './static.js';
import type { KnowledgeService } from '../core/service.js';
import type { AgentPermission } from '../db/db-access.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DOCS_DIR = resolve(__dirname, '../../docs');
const PUBLIC_DIR = resolve(process.cwd(), 'dist/public');

interface DocEntry {
    path: string;
    title: string;
    order: number;
}

const DOC_ORDER: Record<string, number> = {
    'introduction/quickstart': 1,
    'installation': 2,
    'configuration': 3,
    'integrations/mcp': 4,
    'integrations/codex-cli': 5,
    'integrations/grok-cli': 6,
    'integrations/chatgpt': 7,
    'integrations/antigravity': 8,
    'concepts/overview': 9,
    'concepts/knowledge-lifecycle': 10,
    'introduction/project-structure': 11,
    'development/contributing': 12,
    'development/database': 13,
};

function compareDocs(a: DocEntry, b: DocEntry): number {
    return a.order - b.order || a.path.localeCompare(b.path);
}

function getDocTitle(filePath: string): string {
    try {
        const content = readFileSync(filePath, 'utf-8');
        // Try to extract H1 title
        const match = content.match(/^#\s+(.+)/m);
        if (match) return match[1].trim();
        // Fall back to filename
        return extname(filePath) === '.md'
            ? (filePath.replace(/\.md$/, '').split('/').pop() ?? 'Untitled')
            : 'Untitled';
    } catch {
        return 'Untitled';
    }
}

function getDocsDirForLang(lang: string): string {
    const langDir = resolve(DOCS_DIR, lang);
    if (existsSync(langDir)) return langDir;
    return resolve(DOCS_DIR, 'en');
}

function walkDocs(lang: string = 'en'): DocEntry[] {
    const baseDir = getDocsDirForLang(lang);
    const entries: DocEntry[] = [];

    function scan(dir: string) {
        if (!existsSync(dir)) return;
        const items = readdirSync(dir).sort();
        for (const item of items) {
            const full = resolve(dir, item);
            const st = statSync(full);
            if (st.isDirectory()) {
                scan(full);
            } else if (item.endsWith('.md')) {
                const rel = relative(baseDir, full).replace(/\.md$/, '');
                entries.push({
                    path: rel,
                    title: getDocTitle(full),
                    order: DOC_ORDER[rel] ?? Number.MAX_SAFE_INTEGER,
                });
            }
        }
    }

    scan(baseDir);
    return entries.sort(compareDocs);
}

function readDoc(docPath: string, preferredLang: string = 'en'): string | null {
    let cleanPath = docPath.replace(/\.\.\//g, '').replace(/^\/+/, '');

    // Check if cleanPath explicitly starts with 'en/' or 'zh/'
    let lang = preferredLang;
    if (cleanPath.startsWith('en/')) {
        lang = 'en';
        cleanPath = cleanPath.slice(3);
    } else if (cleanPath.startsWith('zh/')) {
        lang = 'zh';
        cleanPath = cleanPath.slice(3);
    }

    // Try specified language first
    const langPath = resolve(DOCS_DIR, lang, `${cleanPath}.md`);
    if (langPath.startsWith(DOCS_DIR) && existsSync(langPath)) {
        return readFileSync(langPath, 'utf-8');
    }

    // Fall back to English
    const fallbackPath = resolve(DOCS_DIR, 'en', `${cleanPath}.md`);
    if (fallbackPath.startsWith(DOCS_DIR) && existsSync(fallbackPath)) {
        return readFileSync(fallbackPath, 'utf-8');
    }

    // Fall back to root DOCS_DIR
    const directPath = resolve(DOCS_DIR, `${cleanPath}.md`);
    if (directPath.startsWith(DOCS_DIR) && existsSync(directPath)) {
        return readFileSync(directPath, 'utf-8');
    }

    return null;
}

export function buildApp(service?: KnowledgeService) {
    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL || 'debug',
            formatters: {
                level: (label) => {
                    return { level: label };
                },
            },
        },
    });
    app.register(sensible);
    app.register(cors, { origin: false });

    app.get('/health', async () => ({ ok: true }));
    app.get('/version', async () => ({ version: OPENKB_VERSION }));

    // Serve documentation markdown files
    // Single wildcard route; /v1/docs with no path returns the listing.
    app.get('/v1/docs*', async (request, reply) => {
        const query = request.query as { lang?: string };
        const preferredLang = query.lang || 'en';
        const url = request.url.split('?')[0];
        const docPath = url.slice('/v1/docs'.length).replace(/^\/+/, '');
        if (!docPath) {
            return { docs: walkDocs(preferredLang) };
        }
        const content = readDoc(docPath, preferredLang);
        if (!content)
            return reply.notFound(`Documentation page not found: ${docPath}`);
        return reply.type('text/markdown').send(content);
    });

    app.get('/v1/knowledge', async (request) => {
        if (!service)
            return {
                knowledge: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 1,
            };
        const query = request.query as {
            page?: string;
            pageSize?: string;
            q?: string;
            type?: string;
            status?: string;
        };
        if (!Object.values(query).some((value) => value !== undefined)) {
            const knowledge = await service.listKnowledge();
            return {
                knowledge,
                total: knowledge.length,
                page: 1,
                pageSize: knowledge.length || 20,
                totalPages: 1,
            };
        }
        return service.listKnowledgePage({
            page: Number(query.page ?? 1),
            pageSize: Number(query.pageSize ?? 20),
            query: query.q,
            type: query.type,
            status: query.status,
        });
    });

    app.post('/v1/knowledge', async (request, reply) => {
        if (!service)
            return reply.serviceUnavailable('OpenKB service is not configured');
        const body = request.body as {
            slug?: string;
            title?: string;
            summary?: string;
            type?: string;
            status?: 'active' | 'inactive';
            content?: string;
            scope?: Record<string, unknown>;
            changeSummary?: string;
            createdBy?: string;
        };
        if (!body.slug || !body.title || !body.summary || !body.content)
            return reply.badRequest(
                'slug, title, summary, and content are required',
            );
        const type = body.type ?? 'context';
        if (!knowledgeTypes.includes(type as never))
            return reply.badRequest(`Unsupported knowledge type: ${type}`);
        const knowledge = await service.upsertKnowledge({
            slug: body.slug,
            title: body.title,
            summary: body.summary,
            type: type as never,
            status: body.status,
            content: body.content,
            scope: body.scope,
            changeSummary: body.changeSummary,
            createdBy: body.createdBy,
        });
        return reply.code(201).send({ knowledge });
    });

    app.get('/v1/knowledge/:slug/versions', async (request, reply) => {
        if (!service) return reply.notFound('OpenKB service is not configured');
        const params = request.params as { slug: string };
        const query = request.query as { page?: string; pageSize?: string };
        const history = await service.listDocumentVersions(params.slug, {
            page: Number(query.page ?? 1),
            pageSize: Number(query.pageSize ?? 20),
        });
        if (!history)
            return reply.notFound(`OpenKB knowledge not found: ${params.slug}`);
        return history;
    });

    app.delete(
        '/v1/knowledge/:slug/versions/:versionId',
        async (request, reply) => {
            if (!service)
                return reply.notFound('OpenKB service is not configured');
            const params = request.params as {
                slug: string;
                versionId: string;
            };
            const result = await service.deleteKnowledgeVersion(
                params.slug,
                params.versionId,
            );
            if (!result.ok) {
                if (result.reason === 'last_version') {
                    return reply.badRequest(
                        'Cannot delete the only remaining version. Delete the knowledge item instead.',
                    );
                }
                return reply.notFound(
                    `Version not found for knowledge: ${params.slug}`,
                );
            }
            return { knowledge: result.knowledge };
        },
    );

    app.get('/v1/knowledge/:slug', async (request, reply) => {
        if (!service) return reply.notFound('OpenKB service is not configured');
        const params = request.params as { slug: string };
        const knowledge = await service.getKnowledge(params.slug);
        if (!knowledge)
            return reply.notFound(`OpenKB knowledge not found: ${params.slug}`);
        return { knowledge };
    });

    app.get('/v1/search', async (request) => {
        if (!service) return { knowledge: [] };
        const query = request.query as { q?: string; limit?: string };
        return {
            knowledge: await service.searchKnowledge(
                query.q ?? '',
                Number(query.limit ?? 10),
            ),
        };
    });

    app.get('/v1/context', async (request) => {
        if (!service) return { knowledge: [] };
        const query = request.query as {
            path?: string;
            project?: string;
            limit?: string;
        };
        const knowledge = await service.getContext({
            path: query.path,
            projectSlug: query.project,
            limit: Number(query.limit ?? 10),
        });
        return { knowledge };
    });

    app.post('/v1/proposals', async (request, reply) => {
        if (!service)
            return reply.serviceUnavailable('OpenKB service is not configured');
        const body = request.body as {
            slug?: string;
            title?: string;
            summary?: string;
            type?: string;
            content?: string;
            scope?: Record<string, unknown>;
            createdBy?: string;
        };
        if (!body.title || !body.summary || !body.content)
            return reply.badRequest('title, summary, and content are required');
        const type = body.type ?? 'context';
        if (!knowledgeTypes.includes(type as never))
            return reply.badRequest(`Unsupported knowledge type: ${type}`);
        try {
            const proposal = await service.proposeKnowledge({
                slug: body.slug,
                title: body.title,
                summary: body.summary,
                type: type as never,
                content: body.content,
                scope: body.scope,
                createdBy: body.createdBy,
            });
            return reply.code(201).send({ proposal });
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('open proposal already exists')
            )
                return reply.conflict(error.message);
            throw error;
        }
    });

    app.get('/v1/proposals', async (request) => {
        if (!service) {
            return {
                proposals: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 1,
                counts: { all: 0, open: 0, approved: 0, rejected: 0 },
            };
        }
        const query = request.query as {
            page?: string;
            pageSize?: string;
            status?: string;
        };
        // Paginated by default. Legacy clients that pass nothing still get a page, not the full table.
        return service.listProposalsPage({
            page: Number(query.page ?? 1),
            pageSize: Number(query.pageSize ?? 20),
            status: query.status ?? 'all',
        });
    });

    app.get('/v1/proposals/:id', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { id: string };
        const proposal = await service.getProposal(params.id);
        if (!proposal)
            return reply.notFound(`Proposal not found: ${params.id}`);
        return { proposal };
    });

    app.patch('/v1/proposals/:id', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { id: string };
        const body = (request.body as Record<string, unknown>) || {};
        if (
            body.status &&
            !['open', 'approved', 'rejected'].includes(body.status as string)
        ) {
            return reply.badRequest(
                'status must be "open", "approved", or "rejected"',
            );
        }
        try {
            const proposal = await service.updateProposal(
                params.id,
                body as any,
            );
            if (!proposal)
                return reply.notFound(`Proposal not found: ${params.id}`);
            return { proposal };
        } catch (error) {
            if (error instanceof Error) {
                if (
                    error.message.startsWith('Proposal is already') ||
                    error.message.includes('Only rejected proposals') ||
                    error.message.includes('Only open proposals') ||
                    error.message.includes('open proposal already exists')
                ) {
                    return reply.conflict(error.message);
                }
            }
            throw error;
        }
    });

    app.delete('/v1/proposals/:id', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { id: string };
        try {
            const deleted = await service.deleteProposal(params.id);
            if (!deleted)
                return reply.notFound(`Proposal not found: ${params.id}`);
            return reply.code(204).send();
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('Only rejected proposals can be deleted')
            ) {
                return reply.badRequest(error.message);
            }
            throw error;
        }
    });

    /* ---- Knowledge Delete ---- */

    app.delete('/v1/knowledge/:slug', async (request, reply) => {
        if (!service) return reply.notFound();
        const params = request.params as { slug: string };
        const deleted = await service.deleteKnowledge(params.slug);
        if (!deleted)
            return reply.notFound(`Knowledge not found: ${params.slug}`);
        return reply.code(204).send();
    });

    /* ---- Agents ---- */

    app.post('/v1/agents', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const body = request.body as {
            name?: string;
            permissionLevel?: AgentPermission;
            label?: string;
        };
        if (!body.name) return reply.badRequest('name is required');
        const { agent, created } = await service.registerOrUpdateAgent({
            name: body.name,
            permissionLevel: body.permissionLevel ?? 'propose',
            label: body.label,
        });
        return reply.code(created ? 201 : 200).send({ agent, created });
    });

    app.get('/v1/agents', async (request) => {
        if (!service) return { agents: [] };
        return { agents: await service.listAgents() };
    });

    app.patch('/v1/agents/:agentId/permission', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { agentId: string };
        const body = request.body as { permissionLevel?: AgentPermission };
        if (
            !body.permissionLevel ||
            !['read', 'propose', 'write', 'admin'].includes(
                body.permissionLevel,
            )
        ) {
            return reply.badRequest(
                'permissionLevel must be one of: read, propose, write, admin',
            );
        }
        const agent = await service.updateAgentPermission(
            params.agentId,
            body.permissionLevel,
        );
        if (!agent) return reply.notFound(`Agent not found: ${params.agentId}`);
        return { agent };
    });

    app.delete('/v1/agents/:agentId', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { agentId: string };
        const deleted = await service.deleteAgent(params.agentId);
        if (!deleted)
            return reply.notFound(`Agent not found: ${params.agentId}`);
        return reply.code(204).send();
    });

    /* ---- App Settings ---- */

    app.get('/v1/settings/:key', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { key: string };
        const value = await service.getAppSetting(params.key);
        if (value === null)
            return reply.notFound(`Setting not found: ${params.key}`);
        return { key: params.key, value };
    });

    app.put('/v1/settings/:key', async (request, reply) => {
        if (!service) return reply.serviceUnavailable();
        const params = request.params as { key: string };
        const body = (request.body as { value?: string }) || {};
        if (typeof body.value !== 'string')
            return reply.badRequest('value is required and must be a string');
        await service.setAppSetting(params.key, body.value);
        return { key: params.key, value: body.value };
    });

    serveStatic(app, PUBLIC_DIR);

    return app;
}
