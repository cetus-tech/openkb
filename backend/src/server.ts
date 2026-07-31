import { buildApp } from './api/app.js'
import { loadConfig } from './config/index.js'
import { createKnex } from './db/index.js'
import { createKnowledgeService } from './core/service.js'
import { lookupAuthToken, registerAuthRoutes, v1AuthHook } from './api/auth.js'
import { handleMcpHttpRequest, normalizeMcpAcceptHeader } from './mcp/server.js'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
const config = loadConfig()
const db = createKnex(config)

// Ensure data directory exists before using SQLite
if (config.dbClient === 'sqlite') {
  const dir = dirname(config.sqliteFilename)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

await db.migrate.latest()
const service = createKnowledgeService(db)
const app = buildApp(service)

// Global preHandler: checks auth for /v1/* routes, skips /health /version /auth/*
app.addHook('preHandler', v1AuthHook(db))

// MCP is the agent-facing surface. Require a user-owned bearer token so a
// public deployment cannot be used to read or write the knowledge base.
app.addHook('preHandler', async (request, reply) => {
  if (!request.url.startsWith('/mcp')) return
  const authToken = await lookupAuthToken(db, request.headers.authorization)
  if (!authToken) return reply.unauthorized('MCP requires a valid user-owned bearer token')
  ;(request as typeof request & { authToken: typeof authToken }).authToken = authToken
})

// Auth routes — no auth needed since they don't start with /v1/
registerAuthRoutes(app, db)

// MCP endpoint — Streamable HTTP transport for agent tools
app.post('/mcp', async (request, reply) => {
  const authToken = (request as typeof request & { authToken?: Awaited<ReturnType<typeof lookupAuthToken>> }).authToken
  if (!authToken) return reply.unauthorized('MCP requires a valid user-owned bearer token')

  // Normalize Accept header for MCP clients that send generic Accept headers (e.g. */* or application/json)
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

// Stateless JSON responses do not keep an SSE stream open.
app.get('/mcp', async (_request, reply) => reply.code(405).type('application/json').send({
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
}))

// Static UI routes are registered by buildApp().

await app.listen({ host: config.host, port: config.port })
