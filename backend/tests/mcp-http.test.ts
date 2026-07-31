import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/api/app.js'
import { createKnex } from '../src/db/index.js'
import { createKnowledgeService } from '../src/core/service.js'
import { lookupAuthToken, registerAuthRoutes, v1AuthHook } from '../src/api/auth.js'
import { handleMcpHttpRequest, normalizeMcpAcceptHeader } from '../src/mcp/server.js'

/**
 * Mirrors server.ts wiring so the full /mcp HTTP path (transport + auth +
 * token-permission resolution) is exercised in tests.
 */
async function testApp() {
  const dir = await mkdtemp(join(tmpdir(), 'openkb-mcp-http-'))
  const db = createKnex({
    host: '127.0.0.1',
    port: 6800,
    dbClient: 'sqlite',
    sqliteFilename: join(dir, 'openkb.db'),
    dataDir: dir,
  })
  await db.migrate.latest()
  const service = createKnowledgeService(db)
  const app = buildApp(service)
  app.addHook('preHandler', v1AuthHook(db))
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/mcp')) return
    const authToken = await lookupAuthToken(db, request.headers.authorization)
    if (!authToken) return reply.unauthorized('MCP requires a valid user-owned bearer token')
    ;(request as typeof request & { authToken: typeof authToken }).authToken = authToken
  })
  registerAuthRoutes(app, db)
  app.post('/mcp', async (request, reply) => {
    const authToken = (request as typeof request & { authToken?: Awaited<ReturnType<typeof lookupAuthToken>> }).authToken
    if (!authToken) return reply.unauthorized('MCP requires a valid user-owned bearer token')
    normalizeMcpAcceptHeader(request.raw)
    reply.hijack()
    await handleMcpHttpRequest(service, request.raw, reply.raw, request.body, {
      authenticated: true,
      agentName: String(request.headers['x-openkb-agent'] ?? '').trim() || undefined,
      userId: authToken.userId,
      userEmail: authToken.userEmail,
      tokenId: authToken.id,
      tokenPermission: authToken.permissionLevel,
      logger: request.log,
    })
  })

  async function register(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'secret123' },
    })
    expect(res.statusCode).toBe(201)
    const setCookie = res.headers['set-cookie']
    const cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';', 1)[0]
    return { cookie, headers: { cookie }, user: res.json().user as { role: string } }
  }

  async function createToken(cookie: string, permissionLevel: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/tokens',
      headers: { cookie },
      payload: { name: `token-${permissionLevel}`, permissionLevel },
    })
    expect(res.statusCode).toBe(201)
    return String((res.json().token as { value: string }).value)
  }

  const owner = await register('owner@test.com')
  const member = await register('member@test.com')
  const ownerWriteToken = await createToken(owner.cookie, 'write')
  const memberProposeToken = await createToken(member.cookie, 'propose')

  return { app, db, dir, ownerWriteToken, memberProposeToken }
}

async function mcpToolsList(app: Awaited<ReturnType<typeof testApp>>['app'], bearer: string, agentName: string): Promise<string[]> {
  const res = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      'x-openkb-agent': agentName,
    },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    },
  })
  expect(res.statusCode).toBe(200)
  const body = res.json()
  return body.result?.tools?.map((tool: { name: string }) => tool.name) ?? []
}

describe('MCP over HTTP — token permission gating', () => {
  it('gates tools by the bearer token, not the claimed agent name', async () => {
    const { app, db, dir, ownerWriteToken, memberProposeToken } = await testApp()
    try {
      // Owner registers a trusted agent name (identity only now).
      const agentReg = await app.inject({
        method: 'POST',
        url: '/v1/agents',
        headers: { authorization: `Bearer ${ownerWriteToken}` },
        payload: { name: 'trusted-deploy' },
      })
      expect(agentReg.statusCode).toBe(201)

      // A member claiming the trusted name is still capped at their token's tools.
      const memberTools = await mcpToolsList(app, memberProposeToken, 'trusted-deploy')
      expect(memberTools).toContain('openkb_remember')
      expect(memberTools).not.toContain('openkb_upsert_knowledge')
      expect(memberTools).not.toContain('openkb_list_agents')

      // The same name with a write token gets write tools.
      const ownerTools = await mcpToolsList(app, ownerWriteToken, 'trusted-deploy')
      expect(ownerTools).toContain('openkb_upsert_knowledge')
      expect(ownerTools).toContain('openkb_delete_knowledge')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects unauthenticated MCP requests', async () => {
    const { app, db, dir } = await testApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/mcp',
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
