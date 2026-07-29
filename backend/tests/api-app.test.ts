import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/api/app.js'
import { createKnex } from '../src/db/index.js'
import { createKnowledgeService } from '../src/core/service.js'

async function testApp() {
  const dir = await mkdtemp(join(tmpdir(), 'openkb-api-'))
  const db = createKnex({ host: '127.0.0.1', port: 6800, dbClient: 'sqlite', sqliteFilename: join(dir, 'openkb.db'), dataDir: dir })
  await db.migrate.latest()
  const app = buildApp(createKnowledgeService(db))
  return { app, db, dir }
}

describe('api app', () => {
  it('returns health', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('lists documentation in the user journey order', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/docs' })

    expect(res.statusCode).toBe(200)
    expect(res.json().docs.map((doc: { path: string }) => doc.path)).toEqual([
      'introduction/quickstart',
      'installation',
      'configuration',
      'integrations/mcp',
      'integrations/codex-cli',
      'integrations/grok-cli',
      'integrations/chatgpt',
      'integrations/antigravity',
      'concepts/overview',
      'concepts/knowledge-lifecycle',
      'introduction/project-structure',
      'development/contributing',
      'development/database',
    ])
  })

  it('serves the built web UI at root with SPA fallback', async () => {
    const publicDir = join(process.cwd(), 'dist/public')
    await mkdir(publicDir, { recursive: true })
    await writeFile(join(publicDir, 'index.html'), '<!doctype html><div id="app">OpenKB UI</div>')

    const app = buildApp()
    const root = await app.inject({ method: 'GET', url: '/' })
    expect(root.statusCode).toBe(200)
    expect(root.headers['content-type']).toContain('text/html')
    expect(root.body).toContain('OpenKB UI')

    const fallback = await app.inject({ method: 'GET', url: '/docs/getting-started' })
    expect(fallback.statusCode).toBe(200)
    expect(fallback.body).toContain('OpenKB UI')
  })

  it('creates knowledge, searches, and returns scoped context', async () => {
    const { app, db, dir } = await testApp()
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        payload: {
          slug: 'api-plan',
          title: 'API Plan',
          summary: 'Fastify API',
          type: 'spec',
          content: 'Use Fastify routes.',
          scope: { pathPatterns: ['src/api/**/*.ts'] },
        },
      })
      expect(create.statusCode).toBe(201)
      expect(create.json().knowledge.version).toBe(1)

      const search = await app.inject({ method: 'GET', url: '/v1/search?q=Fastify' })
      expect(search.json().knowledge[0].slug).toBe('api-plan')

      const page = await app.inject({ method: 'GET', url: '/v1/knowledge?page=1&pageSize=1&status=active' })
      expect(page.statusCode).toBe(200)
      // seeded openkb-mcp-instructions + api-plan
      expect(page.json().total).toBe(2)
      expect(page.json().pageSize).toBe(1)
      expect(page.json().knowledge).toHaveLength(1)

      await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        payload: {
          slug: 'inactive-api-plan',
          title: 'Inactive API Plan',
          summary: 'Inactive knowledge',
          type: 'spec',
          status: 'inactive',
          content: 'hidden-lifecycle-keyword',
        },
      })
      const inactiveSearch = await app.inject({ method: 'GET', url: '/v1/search?q=hidden-lifecycle-keyword' })
      expect(inactiveSearch.json().knowledge).toEqual([])

      const allDocuments = await app.inject({ method: 'GET', url: '/v1/knowledge' })
      expect(allDocuments.json().knowledge).toHaveLength(3)

      const context = await app.inject({ method: 'GET', url: '/v1/context?path=src/api/server.ts' })
      expect(context.json().knowledge[0].slug).toBe('api-plan')

      await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        payload: {
          slug: 'api-plan',
          title: 'API Plan',
          summary: 'Fastify API v2',
          type: 'spec',
          content: 'Use Fastify routes with auth.',
          scope: { pathPatterns: ['src/api/**/*.ts'] },
        },
      })
      const history = await app.inject({ method: 'GET', url: '/v1/knowledge/api-plan/versions' })
      expect(history.json().total).toBe(2)
      const olderId = history.json().versions.find((version: { version: number }) => version.version === 1)?.id
      expect(olderId).toBeTruthy()
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/v1/knowledge/api-plan/versions/${olderId}`,
      })
      expect(deleted.statusCode).toBe(200)
      expect(deleted.json().knowledge.version).toBe(2)
      const after = await app.inject({ method: 'GET', url: '/v1/knowledge/api-plan/versions' })
      expect(after.json().total).toBe(1)
      const onlyId = after.json().versions[0].id
      const refuseLast = await app.inject({
        method: 'DELETE',
        url: `/v1/knowledge/api-plan/versions/${onlyId}`,
      })
      expect(refuseLast.statusCode).toBe(400)

    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('creates proposals', async () => {
    const { app, db, dir } = await testApp()
    try {
      const res = await app.inject({ method: 'POST', url: '/v1/proposals', payload: { title: 'Rule', summary: 'Add rule', content: 'Use OpenKB.' } })
      expect(res.statusCode).toBe(201)
      const createdId = res.json().proposal.id
      const list = await app.inject({ method: 'GET', url: '/v1/proposals?status=open' })
      expect(list.json().proposals.length).toBeGreaterThanOrEqual(1)
      expect(list.json().counts.open).toBeGreaterThanOrEqual(1)
      const one = await app.inject({ method: 'GET', url: `/v1/proposals/${createdId}` })
      expect(one.statusCode).toBe(200)
      expect(one.json().proposal.id).toBe(createdId)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('approves a proposal as the next knowledge version', async () => {
    const { app, db, dir } = await testApp()
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        payload: {
          slug: 'reviewed-rule',
          title: 'Reviewed Rule',
          summary: 'Original rule',
          type: 'rule',
          content: 'Original content',
          scope: { pathPatterns: ['src/**'] },
        },
      })
      expect(create.statusCode).toBe(201)

      const proposal = await app.inject({
        method: 'POST',
        url: '/v1/proposals',
        payload: {
          slug: 'reviewed-rule',
          title: 'Reviewed Rule',
          summary: 'Updated rule',
          type: 'rule',
          content: 'Updated content',
        },
      })
      const proposalId = proposal.json().proposal.id
      const approved = await app.inject({ method: 'PATCH', url: `/v1/proposals/${proposalId}`, payload: { status: 'approved', reviewedBy: 'owner' } })
      expect(approved.statusCode).toBe(200)
      expect(approved.json().proposal.status).toBe('approved')
      expect(approved.json().proposal.knowledgeId).toBeTruthy()

      const knowledge = await app.inject({ method: 'GET', url: '/v1/knowledge/reviewed-rule' })
      expect(knowledge.json().knowledge.version).toBe(2)
      expect(knowledge.json().knowledge.content).toBe('Updated content')
      expect(knowledge.json().knowledge.scope).toEqual({ pathPatterns: ['src/**'] })

      const history = await app.inject({ method: 'GET', url: '/v1/knowledge/reviewed-rule/versions?pageSize=1' })
      expect(history.statusCode).toBe(200)
      expect(history.json().total).toBe(2)
      expect(history.json().versions[0].version).toBe(2)
      expect(history.json().versions[0].current).toBe(true)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns a clear conflict for duplicate open proposals', async () => {
    const { app, db, dir } = await testApp()
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/v1/proposals',
        payload: { slug: 'duplicate-rule', title: 'Duplicate Rule', summary: 'First', content: 'First' },
      })
      expect(first.statusCode).toBe(201)

      const second = await app.inject({
        method: 'POST',
        url: '/v1/proposals',
        payload: { slug: 'duplicate-rule', title: 'Duplicate Rule', summary: 'Second', content: 'Second' },
      })
      expect(second.statusCode).toBe(409)
      expect(second.json().message).toContain('open proposal already exists')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('gets and updates app settings', async () => {
    const { app, db, dir } = await testApp()
    try {
      // 1. Unset key returns 404
      const initial = await app.inject({ method: 'GET', url: '/v1/settings/setup_guide_dismissed' })
      expect(initial.statusCode).toBe(404)

      // 2. Reject missing value payload
      const invalid = await app.inject({
        method: 'PUT',
        url: '/v1/settings/setup_guide_dismissed',
        payload: {},
      })
      expect(invalid.statusCode).toBe(400)

      // 3. Create setting record
      const create = await app.inject({
        method: 'PUT',
        url: '/v1/settings/setup_guide_dismissed',
        payload: { value: 'true' },
      })
      expect(create.statusCode).toBe(200)
      expect(create.json()).toEqual({ key: 'setup_guide_dismissed', value: 'true' })

      // 4. Retrieve saved setting
      const fetched = await app.inject({ method: 'GET', url: '/v1/settings/setup_guide_dismissed' })
      expect(fetched.statusCode).toBe(200)
      expect(fetched.json()).toEqual({ key: 'setup_guide_dismissed', value: 'true' })

      // 5. Update existing setting record
      const update = await app.inject({
        method: 'PUT',
        url: '/v1/settings/setup_guide_dismissed',
        payload: { value: 'false' },
      })
      expect(update.statusCode).toBe(200)
      expect(update.json()).toEqual({ key: 'setup_guide_dismissed', value: 'false' })

      // 6. Retrieve updated setting
      const reFetched = await app.inject({ method: 'GET', url: '/v1/settings/setup_guide_dismissed' })
      expect(reFetched.statusCode).toBe(200)
      expect(reFetched.json()).toEqual({ key: 'setup_guide_dismissed', value: 'false' })
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('edits open proposal title, summary, and content before approving', async () => {
    const { app, db, dir } = await testApp()
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/v1/proposals',
        payload: { slug: 'tweak-rule', title: 'Original Title', summary: 'Original Summary', content: 'Original Content' },
      })
      expect(create.statusCode).toBe(201)
      const proposalId = create.json().proposal.id

      const edit = await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        payload: { title: 'Tweaked Title', summary: 'Tweaked Summary', proposedContentMarkdown: 'Tweaked Content' },
      })
      expect(edit.statusCode).toBe(200)
      expect(edit.json().proposal.title).toBe('Tweaked Title')
      expect(edit.json().proposal.proposedContentMarkdown).toBe('Tweaked Content')

      const approve = await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        payload: { status: 'approved' },
      })
      expect(approve.statusCode).toBe(200)

      const active = await app.inject({ method: 'GET', url: '/v1/knowledge/tweak-rule' })
      expect(active.statusCode).toBe(200)
      expect(active.json().knowledge.title).toBe('Tweaked Title')
      expect(active.json().knowledge.content).toBe('Tweaked Content')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
