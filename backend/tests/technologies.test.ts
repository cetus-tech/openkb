import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createKnex } from '../src/db/index.js'
import { createKnowledgeService } from '../src/core/service.js'
import { buildApp } from '../src/api/app.js'
import { registerAuthRoutes, v1AuthHook } from '../src/api/auth.js'

describe('managed technology catalog', () => {
  it('uses new aliases immediately for writes and retrieval, protects stable references, and rejects collisions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openkb-technologies-'))
    const db = createKnex({ host: '127.0.0.1', port: 6800, dataDir: dir, sqliteFilename: join(dir, 'db.sqlite') })
    try {
      await db.migrate.latest()
      const service = createKnowledgeService(db)
      await service.saveTechnology('framework:example:7', { label: 'Example 7', aliases: ['ex7'] })
      const doc = await service.upsertKnowledge({ slug: 'example-rule', title: 'Rule', summary: 'Rule', content: 'Rule', scope: {
      stacks: ['EX7'], contextPolicy: 'required',
      } })
      expect(doc.scope.stacks).toEqual(['framework:example:7'])
      expect((await service.getContextResult({ stack: ['ex7'] })).knowledge.map(item => item.slug)).toContain('example-rule')
      expect((await service.getContextResult({ stack: ['framework:example:8'] })).knowledge.map(item => item.slug)).not.toContain('example-rule')

      const proposal = await service.proposeKnowledge({ slug: 'example-proposal', title: 'Proposal', summary: 'Rule', content: 'Rule', scope: { stacks: ['ex7'] } })
      expect(proposal.scope.stacks).toEqual(['framework:example:7'])
      await service.updateProposal(proposal.id, { scope: { stacks: ['Example 7'] }, status: 'approved' })
      expect((await service.getKnowledge('example-proposal'))?.scope.stacks).toEqual(['framework:example:7'])

      await service.saveTechnology('framework:example:7', { label: 'Renamed 7', aliases: ['new7'] })
      expect((await service.getContextResult({ stack: ['new7'] })).knowledge.map(item => item.slug)).toContain('example-rule')
      expect((await service.getContextResult({ stack: ['ex7'] })).knowledge.map(item => item.slug)).not.toContain('example-rule')
      expect((await service.getKnowledge('example-rule'))?.scope.stacks).toEqual(['framework:example:7'])
      await expect(service.saveTechnology('language:other', { label: 'Other', aliases: ['NEW7'] })).rejects.toThrow('already belongs')
      await expect(service.saveTechnology('language:other', { label: 'Other', aliases: ['language:php'] })).rejects.toThrow('reserved')
      await expect(service.saveTechnology('other', { label: 'Other', aliases: [] })).rejects.toThrow('canonical')
      expect((await service.listTechnologies()).some(item => item.facet === 'language:other')).toBe(false)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('allows authenticated catalog reads and admin writes, with REST retrieval using the same aliases', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openkb-technology-api-'))
    const db = createKnex({ host: '127.0.0.1', port: 6800, dataDir: dir, sqliteFilename: join(dir, 'db.sqlite') })
    await db.migrate.latest()
    const service = createKnowledgeService(db)
    const app = buildApp(service)
    app.addHook('preHandler', v1AuthHook(db))
    registerAuthRoutes(app, db)
    try {
      const register = async (email: string) => {
        const response = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'secret123' } })
        expect(response.statusCode).toBe(201)
        return { cookie: String(response.headers['set-cookie']).split(';')[0]! }
      }
      const owner = await register('owner@technology.test')
      const member = await register('member@technology.test')
      expect((await app.inject({ method: 'GET', url: '/v1/technologies' })).statusCode).toBe(401)
      const url = '/v1/technologies/framework%3Acustom%3A2'
      const payload = { label: 'Custom 2', aliases: ['custom2'] }
      expect((await app.inject({ method: 'PUT', url, headers: member, payload })).statusCode).toBe(403)
      expect((await app.inject({ method: 'PUT', url, headers: owner, payload })).statusCode).toBe(200)
      const list = await app.inject({ method: 'GET', url: '/v1/technologies', headers: member })
      expect(list.json().technologies).toContainEqual({ facet: 'framework:custom:2', label: 'Custom 2', aliases: ['custom 2', 'custom2'] })
      await service.upsertKnowledge({ slug: 'custom-guide', title: 'Custom', summary: 'Guide', content: 'Guide', scope: { stacks: ['framework:custom:2'], contextPolicy: 'required' } })
      const context = await app.inject({ method: 'GET', url: '/v1/context?stack=custom2', headers: member })
      expect(context.json().knowledge.map((item: { slug: string }) => item.slug)).toContain('custom-guide')
      expect((await app.inject({ method: 'PUT', url, headers: owner, payload: { label: 'Invalid', aliases: ['php'] } })).statusCode).toBe(400)
    } finally {
      await app.close()
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
