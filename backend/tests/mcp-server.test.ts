import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createKnex } from '../src/db/index.js'
import { createKnowledgeService } from '../src/core/service.js'
import { createMcpServer, type McpRequestContext } from '../src/mcp/server.js'

async function testService() {
  const dir = await mkdtemp(join(tmpdir(), 'openkb-mcp-server-'))
  const db = createKnex({
    host: '127.0.0.1',
    port: 6800,
    dbClient: 'sqlite',
    sqliteFilename: join(dir, 'openkb.db'),
    dataDir: dir})
  await db.migrate.latest()
  const service = createKnowledgeService(db)

  // Seed a project + knowledge
  const { upsertKnowledge } = await import('../src/db/db-access.js')
  
  await upsertKnowledge(db, {
    slug: 'hermes-mcp',
    title: 'Hermes MCP Integration',
    summary: 'MCP server spec for Hermes Agent',
    type: 'spec',
    content: 'OpenKB exposes an MCP server for Hermes Agent to query project knowledge.',
    scope: { projectSlug: 'openkb' }})
  await upsertKnowledge(db, {
    slug: 'cli-workflow',
    title: 'CLI Workflow',
    summary: 'How to use the OpenKB CLI',
    type: 'workflow',
    content: 'Run `openkb pull` to sync docs.',
    scope: {}})
  await upsertKnowledge(db, {
    slug: 'team-conventions',
    title: 'Team Conventions',
    summary: 'Coding conventions for all agents',
    type: 'context',
    content: 'Use TypeScript. Write tests.',
    scope: { projectSlug: 'openkb' }})

  return { dir, db, service }
}

function nextMessage(transport: InMemoryTransport): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP response')), 5000)
    transport.onmessage = (message) => {
      clearTimeout(timer)
      resolve(message)
    }
  })
}

async function exchange(transport: InMemoryTransport, message: any): Promise<any> {
  const response = nextMessage(transport)
  await transport.send(message)
  return response
}

async function call(
  service: ReturnType<typeof createKnowledgeService>,
  method: string,
  params?: Record<string, unknown>,
  id = 1,
  context: McpRequestContext = {},
) {
  const callArguments = params?.arguments as Record<string, unknown> | undefined
  const callContext: McpRequestContext = {
    ...context,
    ...(callArguments?.agentName ? { agentName: String(callArguments.agentName) } : {})}
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = await createMcpServer(service, callContext)
  await server.connect(serverTransport)
  await clientTransport.start()

  try {
    await exchange(clientTransport, {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'openkb-test', version: '1.0.0' }}})
    await clientTransport.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    return await exchange(clientTransport, { jsonrpc: '2.0', method, params, id })
  } finally {
    await server.close()
    await clientTransport.close()
  }
}

function expectToolError(response: any): void {
  expect(response.result?.isError).toBe(true)
  expect(response.result?.content?.[0]?.text).toBeTruthy()
}

/* ------------------------------------------------------------------ */
/*  Tool list helpers                                                  */
/* ------------------------------------------------------------------ */

type ToolName = string

async function listToolNames(
  service: ReturnType<typeof createKnowledgeService>,
  agentName?: string,
  extra: McpRequestContext = {},
): Promise<ToolName[]> {
  const context: McpRequestContext = {
    ...(agentName !== undefined ? { agentName } : {}),
    ...extra}
  const res = await call(service, 'tools/list', undefined, 1, context)
  const result = res as any
  return result.result.tools.map((t: any) => t.name)
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('MCP server — agent identity & permission scoping', () => {
  it('advertises optional identity arguments on MCP tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/list', undefined, 1, { agentName: 'codex', userId: 'user_1', userEmail: 'owner@test.com' })
      const contextTool = (res as any).result.tools.find((tool: any) => tool.name === 'openkb_get_context')
      expect(contextTool.inputSchema.properties.agentName).toBeDefined()
      expect(contextTool.inputSchema.properties.author).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('anonymous tools/list returns only base (read-level) tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const names = await listToolNames(service)
      expect(names).toContain('openkb_whoami')
      expect(names).toContain('openkb_search')
      expect(names).toContain('openkb_get_context')
      expect(names).toContain('openkb_get_knowledge')
      expect(names).toContain('openkb_list_types')
      expect(names).toContain('openkb_list_versions')
      expect(names).not.toContain('openkb_remember')
      expect(names).not.toContain('openkb_list_proposals')
      expect(names).not.toContain('openkb_get_proposal')
      expect(names).not.toContain('openkb_upsert_knowledge')
      expect(names).not.toContain('openkb_delete_knowledge')
      expect(names).not.toContain('openkb_list_agents')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('agent name is identity only; permission comes from the token', async () => {
    const { dir, db, service } = await testService()
    try {
      const names = await listToolNames(service, 'cursor-workspace', {
        userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      expect(names).toContain('openkb_search')
      expect(names).toContain('openkb_upsert_knowledge')

      // Verify the name was persisted as an identity label (no permission field)
      const agent = await service.lookupAgent('cursor-workspace')
      expect(agent).toBeDefined()
      expect(agent!.lastTokenId).toBeUndefined()
      expect(agent!.lastTokenPermission).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('claiming a registered agent name cannot grant permissions it never had', async () => {
    const { dir, db, service } = await testService()
    try {
      await service.registerOrUpdateAgent({ name: 'admin-bot' })
      const names = await listToolNames(service, 'admin-bot', {
        userId: 'user_1', userEmail: 'member@test.com', authenticated: true, tokenPermission: 'read' })
      expect(names).not.toContain('openkb_remember')
      expect(names).not.toContain('openkb_upsert_knowledge')
      expect(names).not.toContain('openkb_delete_knowledge')
      expect(names).not.toContain('openkb_list_agents')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('write permission on the token works for any claimed name', async () => {
    const { dir, db, service } = await testService()
    try {
      const names = await listToolNames(service, 'brand-new-name', {
        userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      expect(names).toContain('openkb_upsert_knowledge')
      expect(names).toContain('openkb_delete_knowledge')
      expect(names).not.toContain('openkb_list_agents')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('token with propose permission sees propose tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const names = await listToolNames(service, 'codex-agent', { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'propose' })
      expect(names).toContain('openkb_whoami')
      expect(names).toContain('openkb_remember')
      expect(names).toContain('openkb_list_proposals')
      expect(names).toContain('openkb_get_proposal')
      expect(names).not.toContain('openkb_upsert_knowledge')
      expect(names).not.toContain('openkb_delete_knowledge')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('token with write permission sees write tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const names = await listToolNames(service, 'hermes-ken', { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      expect(names).toContain('openkb_remember')
      expect(names).toContain('openkb_upsert_knowledge')
      expect(names).toContain('openkb_delete_knowledge')
      expect(names).not.toContain('openkb_list_agents')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('tokens max out at write; no admin tier on the MCP surface', async () => {
    const { dir, db, service } = await testService()
    try {
      const names = await listToolNames(service, 'write-agent', { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      expect(names).toContain('openkb_upsert_knowledge')
      expect(names).not.toContain('openkb_list_agents')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('tools/call enforces permission — write tool rejected for read token', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_upsert_knowledge',
        arguments: {
          slug: 'test', title: 'Test',
          summary: 'Test', content: 'Test', agentName: 'read-only'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'read' })
      expectToolError(res)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('MCP server — base read tools', () => {
  it('does not retrieve inactive knowledge', async () => {
    const { dir, db, service } = await testService()
    try {
      await service.upsertKnowledge({
        slug: 'inactive-workflow',
        title: 'Inactive Workflow',
        summary: 'An inactive workflow',
        type: 'workflow',
        status: 'inactive',
        content: 'Inactive workflow content'})

      const search = await call(service, 'tools/call', { name: 'openkb_search', arguments: { query: 'Inactive Workflow' } })
      expect((search as any).result.content[0].text).not.toContain('inactive-workflow')
      expect((search as any).result.content[0].text).not.toContain('Inactive workflow content')

      const listed = await call(service, 'tools/call', { name: 'openkb_search', arguments: {} })
      expect((listed as any).result.content[0].text).not.toContain('inactive-workflow')

      const fetched = await call(service, 'tools/call', { name: 'openkb_get_knowledge', arguments: { slug: 'inactive-workflow' } })
      expectToolError(fetched)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_search does not filter by author (author is attribution only)', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_search',
        arguments: { query: 'TypeScript', agentName: 'hermes-searcher' }})
      const result = (res as any).result
      // Author is not used for retrieval; Team Conventions matches the query terms.
      expect(result.content[0].text).toContain('Team Conventions')
      // CLI Workflow does not mention TypeScript, so it stays out via search terms only.
      expect(result.content[0].text).not.toContain('CLI Workflow')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_get_context ignores author for retrieval filtering', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_get_context',
        arguments: { agentName: 'hermes-context-only' }})
      const result = (res as any).result
      // Without project/path filters, all active docs are eligible regardless of author.
      expect(result.content[0].text).toContain('Hermes MCP Integration')
      expect(result.content[0].text).toContain('CLI Workflow')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_search without query lists with path filter', async () => {
    const { dir, db, service } = await testService()
    try {
      const { upsertKnowledge } = await import('../src/db/db-access.js')
      await upsertKnowledge(db, {
        slug: 'api-deploy-runbook',
        title: 'API Deploy Runbook',
        summary: 'Deploy the API service safely',
        type: 'runbook',
        content: 'Deploy backend API to staging first.',
        scope: { pathPatterns: ['src/api/**/*.ts'] }})
      // Path-scoped doc that should be excluded when path does not match.
      await upsertKnowledge(db, {
        slug: 'frontend-only',
        title: 'Frontend Only Guide',
        summary: 'Frontend scoped',
        type: 'context',
        content: 'Frontend notes.',
        scope: { pathPatterns: ['src/frontend/**'] }})

      const res = await call(service, 'tools/call', {
        name: 'openkb_search',
        arguments: {
          path: 'src/api/server.ts'}})
      const result = (res as any).result
      expect(result.content[0].text).toContain('API Deploy Runbook')
      expect(result.content[0].text).not.toContain('Frontend Only Guide')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_search with query supports path-aware filtering', async () => {
    const { dir, db, service } = await testService()
    try {
      const { upsertKnowledge } = await import('../src/db/db-access.js')
      await upsertKnowledge(db, {
        slug: 'api-deploy-spec',
        title: 'API Deploy Spec',
        summary: 'Spec for backend deploy flow',
        type: 'spec',
        content: 'Deploy API via staged rollout.',
        scope: { pathPatterns: ['src/api/**/*.ts'] }})

      const res = await call(service, 'tools/call', {
        name: 'openkb_search',
        arguments: {
          query: 'Deploy',
          path: 'src/api/server.ts'}})
      const result = (res as any).result
      expect(result.content[0].text).toContain('API Deploy Spec')
      expect(result.content[0].text).not.toContain('CLI Workflow')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_get_context returns active knowledge without author filtering', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_get_context',
        arguments: { }})
      const result = (res as any).result
      expect(result.content[0].text).toContain('Hermes MCP Integration')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_get_knowledge returns a specific doc by slug', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_get_knowledge',
        arguments: { slug: 'cli-workflow' }})
      const result = (res as any).result
      expect(result.content[0].text).toContain('openkb pull')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_get_knowledge returns error for missing doc', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_get_knowledge',
        arguments: { slug: 'nonexistent' }})
      expectToolError(res)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_search returns count', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_search',
        arguments: {}})
      // 3 fixtures + seeded openkb-mcp-instructions
      expect((res as any).result.content[0].text).toContain('4 knowledge item(s)')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_list_types returns available types', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_list_types',
        arguments: {}})
      expect((res as any).result.content[0].text).toContain('context')
      expect((res as any).result.content[0].text).toContain('spec')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_whoami reports identity, token owner, permission, and available tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(
        service,
        'tools/call',
        { name: 'openkb_whoami', arguments: { agentName: 'whoami-agent' } },
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'propose' },
      )
      const text = (res as any).result.content[0].text
      expect(text).toContain('agent: whoami-agent')
      expect(text).toContain('tokenOwner: owner@test.com')
      expect(text).toContain('permission: propose')
      expect(text).toContain('openkb_remember')
      expect(text).toContain('openkb_get_proposal')
      expect(text).toMatch(/tools \(\d+\):[^\n]*openkb_remember/)
      expect(text).not.toMatch(/tools \(\d+\):[^\n]*openkb_upsert_knowledge/)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_remember attributes createdBy to token owner email', async () => {
    const { dir, db, service } = await testService()
    try {
      await call(
        service,
        'tools/call',
        {
          name: 'openkb_remember',
          arguments: {
            title: 'Attributed memory',
            summary: 'Owned by token user',
            content: 'Body',
            agentName: 'attr-agent',
          },
        },
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'propose' },
      )
      const proposals = await service.listProposals()
      expect(proposals[0]?.createdBy).toBe('owner@test.com')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_list_versions returns version history', async () => {
    const { dir, db, service } = await testService()
    try {
      await service.upsertKnowledge({
        slug: 'hermes-mcp',
        title: 'Hermes MCP Integration',
        summary: 'Updated',
        type: 'spec',
        content: 'Version two content.'})
      const res = await call(service, 'tools/call', {
        name: 'openkb_list_versions',
        arguments: { slug: 'hermes-mcp' }})
      const text = (res as any).result.content[0].text
      expect(text).toContain('hermes-mcp')
      expect(text).toContain('v2')
      expect(text).toContain('v1')
      expect(text).toContain('(current)')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('MCP server — propose-level tools', () => {
  it('openkb_remember creates a proposal (write agent)', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_remember',
        arguments: {
          title: 'New Rule',
          summary: 'Always query OpenKB',
          content: 'Before making changes, call openkb_search.',
          agentName: 'hermes-proposer'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      const result = (res as any).result
      expect(result.content[0].text).toContain('Memory proposal created')
      expect(result.content[0].text).toContain('open')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })


  it('openkb_remember creates a scoped memory proposal', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_remember',
        arguments: {
          title: 'API auth test setup',
          summary: 'Auth integration tests need an owner token before protected calls.',
          content: '# API auth test setup\n\nCreate the owner user before protected API calls.',
          type: 'rule',
          pathPatterns: ['backend/tests/**'],
          agentName: 'hermes-memory'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'propose' })

      const result = (res as any).result
      expect(result.content[0].text).toContain('Memory proposal created')
      const proposals = await service.listProposals()
      expect(proposals).toHaveLength(1)
      expect(proposals[0].title).toBe('API auth test setup')
      expect(proposals[0].proposedContentMarkdown).toContain('Create the owner user')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_list_proposals lists open proposals', async () => {
    const { dir, db, service } = await testService()
    try {
      await service.proposeKnowledge({
        title: 'Open proposal',
        summary: 'Waiting for review',
        type: 'context',
        content: 'Content',
        createdBy: 'hermes'})

      const res = await call(service, 'tools/call', {
        name: 'openkb_list_proposals',
        arguments: { agentName: 'hermes-memory' }},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'propose' })
      const text = (res as any).result.content[0].text
      expect(text).toContain('Open proposal')
      expect(text).toContain('open')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_get_proposal returns full proposal content', async () => {
    const { dir, db, service } = await testService()
    try {
      const proposal = await service.proposeKnowledge({
        title: 'Detailed proposal',
        summary: 'Has full body',
        type: 'rule',
        content: '# Detailed body\n\nFull markdown content here.',
        createdBy: 'hermes'})

      const res = await call(service, 'tools/call', {
        name: 'openkb_get_proposal',
        arguments: { id: proposal.id, agentName: 'hermes-memory' }},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'propose' })
      const text = (res as any).result.content[0].text
      expect(text).toContain(proposal.id)
      expect(text).toContain('Detailed proposal')
      expect(text).toContain('Full markdown content here')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_remember with slug proposes update to existing doc', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_remember',
        arguments: {
          slug: 'hermes-mcp',
          title: 'Hermes MCP Integration',
          summary: 'Updated MCP spec',
          content: 'Updated content.',
          agentName: 'updater'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      const result = (res as any).result
      expect(result.content[0].text).toContain('hermes-mcp')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('MCP server — write-level tools', () => {
  it('openkb_upsert_knowledge creates a new doc directly', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_upsert_knowledge',
        arguments: {
          slug: 'direct-write',
          title: 'Direct Write Test',
          summary: 'Written by Hermes',
          content: '# Direct write\nThis was written directly by the agent.',
          type: 'context',
          agentName: 'hermes-writer'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      const result = (res as any).result
      expect(result.content[0].text).toContain('direct-write')
      expect(result.content[0].text).toContain('version 1')

      // Verify it's actually in the DB
      const doc = await service.getKnowledge('direct-write')
      expect(doc).toBeDefined()
      expect(doc!.content).toContain('written directly')
      // Should be active by default
      expect(doc!.status).toBe('active')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_upsert_knowledge updates an existing doc', async () => {
    const { dir, db, service } = await testService()
    try {
      await call(service, 'tools/call', {
        name: 'openkb_upsert_knowledge',
        arguments: {
          slug: 'hermes-mcp',
          title: 'Hermes MCP Integration (Updated)',
          summary: 'Updated MCP spec',
          content: '# Updated content',
          type: 'spec',
          agentName: 'hermes-writer'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })

      const doc = await service.getKnowledge('hermes-mcp')
      expect(doc).toBeDefined()
      expect(doc!.version).toBe(2)
      expect(doc!.content).toContain('Updated')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_upsert_knowledge activates an inactive existing doc', async () => {
    const { dir, db, service } = await testService()
    try {
      await service.upsertKnowledge({
        slug: 'inactive-mcp',
        title: 'Inactive MCP Knowledge',
        summary: 'Inactive knowledge',
        type: 'context',
        status: 'inactive',
        content: 'Old content'})

      await call(service, 'tools/call', {
        name: 'openkb_upsert_knowledge',
        arguments: {
          slug: 'inactive-mcp',
          title: 'Inactive MCP Knowledge',
          summary: 'Restored knowledge',
          content: 'Restored content',
          agentName: 'hermes-writer'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })

      const doc = await service.getKnowledge('inactive-mcp')
      expect(doc!.status).toBe('active')
      expect(doc!.content).toBe('Restored content')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_delete_knowledge removes a doc', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_delete_knowledge',
        arguments: {
          slug: 'cli-workflow',
          agentName: 'hermes-deleter'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      expect((res as any).result.content[0].text).toContain('deleted')

      const doc = await service.getKnowledge('cli-workflow')
      expect(doc).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('openkb_delete_knowledge returns error for missing doc', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_delete_knowledge',
        arguments: {
          slug: 'nonexistent',
          agentName: 'hermes-deleter'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'write' })
      expectToolError(res)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('read-level agent cannot call write tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_upsert_knowledge',
        arguments: {
          slug: 'should-fail',
          title: 'Fail',
          summary: 'Fail',
          content: 'Fail',
          agentName: 'read-only'}},
        1,
        { userId: 'user_1', userEmail: 'owner@test.com', authenticated: true, tokenPermission: 'read' })
      expectToolError(res)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('MCP server — error handling', () => {
  it('SDK handles unknown methods gracefully', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'nonexistent_method', {})
      expect((res as any).error).toBeTruthy()
      expect((res as any).error.message).toContain('not found')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('SDK returns tool errors for unknown tools', async () => {
    const { dir, db, service } = await testService()
    try {
      const res = await call(service, 'tools/call', {
        name: 'openkb_nonexistent',
        arguments: {}})
      expectToolError(res)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
