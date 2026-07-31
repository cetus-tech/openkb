import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z, type ZodRawShape } from 'zod'
import type { KnowledgeService } from '../core/service.js'
import { knowledgeTypes, isActiveForRetrieval, OPENKB_VERSION, pathMatchesPattern, type Knowledge, type KnowledgeScope } from '../core/index.js'
import type { AgentPermission, ChangeProposal, KnowledgeVersion } from '../db/db-access.js'

type ToolInputShape = ZodRawShape

interface McpTool {
  name: string
  description: string
  inputSchema: ToolInputShape
}

export interface McpLogger {
  info(obj: object | string, msg?: string): void
  error(obj: object | string, msg?: string): void
  warn?(obj: object | string, msg?: string): void
  debug?(obj: object | string, msg?: string): void
}

export interface McpRequestContext {
  authenticated?: boolean
  agentName?: string
  /** Owning human from the API token (required for authenticated MCP). */
  userId?: number
  userEmail?: string
  /** API/MCP token id used for this request (for last-used tracking on agents). */
  tokenId?: number
  /**
   * MCP permission granted by the bearer token. This is the single source of
   * truth for tool gating; the client-asserted agent name is identity only.
   */
  tokenPermission?: AgentPermission
  logger?: McpLogger
}

/**
 * Streamable HTTP requires the Accept header to advertise both
 * `application/json` and `text/event-stream`. Some MCP clients send generic
 * values (a wildcard, or `application/json` only). This mutates both the parsed
 * headers and the raw header array — the MCP SDK's hono adapter reads
 * `rawHeaders`, not `headers`, when building the web-standard request.
 */
export function normalizeMcpAcceptHeader(raw: IncomingMessage): void {
  const currentAccept = raw.headers['accept'] || ''
  if (currentAccept.includes('text/event-stream') && currentAccept.includes('application/json')) return
  const normalized = 'application/json, text/event-stream'
  raw.headers['accept'] = normalized

  const rawHeaders = raw.rawHeaders
  let found = false
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'accept') {
      rawHeaders[index + 1] = normalized
      found = true
    }
  }
  if (!found) rawHeaders.push('accept', normalized)
}

interface AgentIdentity {
  agentName: string
  permission: AgentPermission
  userId?: number
  userEmail?: string
}

/**
 * MCP tool surface (permission-gated by the bearer token).
 *
 * Design notes (MCP best practices):
 * - One tool per agent goal; avoid near-duplicate tools that call the same backend.
 * - Keep the default authenticated (propose) set small so clients load fewer schemas.
 * - Advertise write tools only when the request token has write permission.
 *
 * | Permission | Tools |
 * |------------|--------|
 * | read       | whoami, get_context, search, get_knowledge, list_types, list_versions |
 * | propose    | + remember, list_proposals, get_proposal |
 * | write      | + upsert_knowledge, delete_knowledge |
 *
 * There is no admin tier on the MCP surface: tokens max out at write, and
 * dashboard admin actions stay owner-only in the REST API. Permission is owned
 * by the bearer token (set in Settings → MCP tokens), not by the agent name.
 * Claiming any agent name never changes the granted tools.
 */
const baseTools: McpTool[] = [
  {
    name: 'openkb_whoami',
    description:
      'Return this client\'s resolved agent name, token-owner user, permission level, server version, and the MCP tools available at that permission. Use when checking identity or why a tool is missing.',
    inputSchema: {},
  },
  {
    name: 'openkb_get_context',
    description:
      'Primary read tool: return the most relevant active knowledge for the current project and file path. Call this before non-trivial work.',
    inputSchema: {
      projectSlug: z.string().optional().describe('Optional project scope; omit for global knowledge'),
      path: z.string().optional().describe('Current file path'),
      limit: z.number().optional().describe('Maximum number of results (default 8)'),
    },
  },
  {
    name: 'openkb_search',
    description:
      'Search active knowledge by words in slug, title, summary, type, or content. Omit query to list active items. Narrow with projectSlug, path, or type.',
    inputSchema: {
      query: z.string().optional().describe('Words to search for; omit or leave empty to list active knowledge'),
      limit: z.number().optional().describe('Maximum number of results (default 10)'),
      projectSlug: z.string().optional().describe('Optional project scope; omit for global knowledge'),
      path: z.string().optional().describe('Optional current file path'),
      type: z.string().optional().describe('Optional knowledge type filter'),
    },
  },
  {
    name: 'openkb_get_knowledge',
    description: 'Fetch one complete active knowledge item by its stable slug.',
    inputSchema: {
      slug: z.string().describe('Stable knowledge slug'),
    },
  },
  {
    name: 'openkb_list_types',
    description: 'List valid knowledge types (context, rule, spec, workflow, runbook, decision, reference, prompt, skill, template).',
    inputSchema: {},
  },
  {
    name: 'openkb_list_versions',
    description: 'List version history for one knowledge item by slug (newest first).',
    inputSchema: {
      slug: z.string().describe('Stable knowledge slug'),
      page: z.number().optional().describe('Page number (default 1)'),
      pageSize: z.number().optional().describe('Versions per page (default 20, max 100)'),
    },
  },
]

const proposeTools: McpTool[] = [
  {
    name: 'openkb_remember',
    description:
      'Propose durable knowledge for human review (does not change active knowledge until approved). Use for new items or a full replacement of an existing slug. Preferred write path for agents.',
    inputSchema: {
      title: z.string().describe('Knowledge title'),
      summary: z.string().describe('Short knowledge summary'),
      content: z.string().describe('Complete Markdown content'),
      slug: z.string().optional().describe('Existing slug to update, or a new stable slug; auto-generated when omitted'),
      type: z.string().optional().describe('Knowledge type (default context)'),
      projectSlug: z.string().optional().describe('Optional project scope; omit for global knowledge'),
      pathPatterns: z.array(z.string()).optional().describe('Optional path globs this knowledge applies to'),
    },
  },
  {
    name: 'openkb_list_proposals',
    description: 'List change proposals. Defaults to open proposals awaiting review.',
    inputSchema: {
      status: z.string().optional().describe('Filter: open, approved, rejected, or all (default open)'),
      limit: z.number().optional().describe('Maximum number of proposals (default 20)'),
    },
  },
  {
    name: 'openkb_get_proposal',
    description: 'Fetch one proposal by id, including full proposed Markdown content.',
    inputSchema: {
      id: z.union([z.string(), z.number()]).describe('Proposal id returned by openkb_remember or openkb_list_proposals'),
    },
  },
]

const writeTools: McpTool[] = [
  {
    name: 'openkb_upsert_knowledge',
    description:
      'Create or update active knowledge directly (skips review). Only for trusted agents with write permission; prefer openkb_remember otherwise.',
    inputSchema: {
      slug: z.string().describe('Stable knowledge slug'),
      title: z.string().describe('Knowledge title'),
      summary: z.string().describe('Short knowledge summary'),
      content: z.string().describe('Complete Markdown content'),
      type: z.string().optional().describe('Knowledge type (default context)'),
      projectSlug: z.string().optional(),
      pathPatterns: z.array(z.string()).optional(),
    },
  },
  {
    name: 'openkb_delete_knowledge',
    description: 'Delete a knowledge item by slug. Only for trusted agents with write permission.',
    inputSchema: { slug: z.string().describe('Stable knowledge slug') },
  },
]

/** Optional identity args on every tool when headers cannot be set. Identity only — never changes permissions. */
const identityProperties: ToolInputShape = {
  agentName: z.string().optional().describe('Optional agent identity used for permissions, for example grok'),
}

export function toolsForPermission(permission: AgentPermission): McpTool[] {
  const tools = [...baseTools]
  if (permission === 'propose' || permission === 'write') tools.push(...proposeTools)
  if (permission === 'write') tools.push(...writeTools)
  return tools.map((tool) => ({
    ...tool,
    inputSchema: {
      ...identityProperties,
      ...tool.inputSchema,
    },
  }))
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

function formatDocFull(doc: Knowledge): string {
  const scope = [
    doc.scope.projectSlug ? `project: ${doc.scope.projectSlug}` : 'global',
    ...(doc.scope.pathPatterns?.length ? [`paths: ${doc.scope.pathPatterns.join(', ')}`] : []),
  ].join(' | ')
  return `# ${doc.title}\nslug: ${doc.slug}\ntype: ${doc.type}\nstatus: ${doc.status}\nversion: ${doc.version}\nscope: ${scope}\nsummary: ${doc.summary}\n\n${doc.content}`
}

function formatDocList(doc: Knowledge): string {
  const scope = doc.scope.projectSlug ? `project:${doc.scope.projectSlug}` : 'global'
  return `- **${doc.title}** (\`${doc.slug}\`) - ${doc.type} v${doc.version} [${scope}]`
}

function formatProposal(proposal: ChangeProposal): string {
  const scope = proposal.scope.projectSlug ? `project:${proposal.scope.projectSlug}` : 'global'
  return `- **${proposal.title}** (\`${proposal.slug}\`) - ${proposal.status} [${scope}] id:${proposal.id}${proposal.createdBy ? ` by ${proposal.createdBy}` : ''}\n  ${proposal.summary}`
}

function formatProposalFull(proposal: ChangeProposal): string {
  const scope = [
    proposal.scope.projectSlug ? `project: ${proposal.scope.projectSlug}` : 'global',
    ...(proposal.scope.pathPatterns?.length ? [`paths: ${proposal.scope.pathPatterns.join(', ')}`] : []),
  ].join(' | ')
  const meta = [
    `id: ${proposal.id}`,
    `slug: ${proposal.slug}`,
    `type: ${proposal.type}`,
    `status: ${proposal.status}`,
    `scope: ${scope}`,
    `summary: ${proposal.summary}`,
    proposal.createdBy ? `createdBy: ${proposal.createdBy}` : undefined,
    `createdAt: ${proposal.createdAt}`,
    proposal.reviewedBy ? `reviewedBy: ${proposal.reviewedBy}` : undefined,
    proposal.reviewedAt ? `reviewedAt: ${proposal.reviewedAt}` : undefined,
  ].filter(Boolean).join('\n')
  return `# ${proposal.title}\n${meta}\n\n${proposal.proposedContentMarkdown}`
}

function formatVersion(version: KnowledgeVersion): string {
  const current = version.current ? ' (current)' : ''
  const by = version.createdBy ? ` by ${version.createdBy}` : ''
  const summary = version.changeSummary ? ` — ${version.changeSummary}` : ''
  return `- v${version.version}${current} ${version.createdAt}${by}${summary}`
}

function stringArrayArg(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map((item) => String(item).trim()).filter(Boolean)
  return items.length ? items : undefined
}

function scopeFromArgs(args: Record<string, unknown>): KnowledgeScope | undefined {
  const pathPatterns = stringArrayArg(args.pathPatterns)
  const scope: KnowledgeScope = {
    ...(args.projectSlug ? { projectSlug: String(args.projectSlug) } : {}),
    ...(pathPatterns ? { pathPatterns } : {}),
  }
  return Object.keys(scope).length ? scope : undefined
}

/** Creator attribution: token owner email (server-known), not client-asserted. */
function creatorAttribution(agent: AgentIdentity): string {
  if (agent.userEmail) return agent.userEmail
  if (agent.userId != null) return String(agent.userId)
  return agent.agentName
}

function filterKnowledge(docs: Knowledge[], args: Record<string, unknown>): Knowledge[] {
  const projectSlug = args.projectSlug ? String(args.projectSlug) : undefined
  const path = args.path ? String(args.path) : undefined
  const type = args.type ? String(args.type) : undefined
  // Agent identity is only for permissions; retrieval uses project/path/type.
  return docs.filter((doc) => {
    if (!isActiveForRetrieval(doc)) return false
    if (projectSlug && doc.scope.projectSlug && doc.scope.projectSlug !== projectSlug) return false
    if (type && doc.type !== type) return false
    if (path && doc.scope.pathPatterns?.length && !doc.scope.pathPatterns.some((pattern) => pathMatchesPattern(path, pattern))) return false
    return true
  })
}

async function resolveAgent(
  service: KnowledgeService,
  args: Record<string, unknown> | undefined,
  context: McpRequestContext,
): Promise<AgentIdentity> {
  const agentName = String(args?.agentName ?? context.agentName ?? '').trim() || 'anonymous'
  const userId = context.userId
  const userEmail = context.userEmail
  // Permission comes from the bearer token (owner-set), never from the
  // client-asserted name. Unauthenticated requests stay at read.
  const permission: AgentPermission = context.tokenPermission ?? (context.authenticated ? 'propose' : 'read')

  if (agentName !== 'anonymous') {
    // Register/refresh the identity label for the Agents dashboard (throttled).
    await service.touchAgent({
      name: agentName,
      tokenId: context.tokenId,
    })
  }
  return { agentName, permission, userId, userEmail }
}

async function handleToolCall(service: KnowledgeService, tool: string, args: Record<string, unknown>, agent: AgentIdentity, logger?: McpLogger): Promise<CallToolResult> {
  if (!toolsForPermission(agent.permission).some((item) => item.name === tool)) {
    throw { code: -32601, message: `Unknown tool or insufficient permission: ${tool}` }
  }

  const startTime = Date.now()
  logger?.info({ tool, agent: agent.agentName, user: agent.userEmail, args }, `MCP tool call started: ${tool}`)

  try {
    let result: CallToolResult
    switch (tool) {
      case 'openkb_whoami': {
        const available = toolsForPermission(agent.permission).map((item) => item.name)
        result = textResult([
          `OpenKB ${OPENKB_VERSION}`,
          `agent: ${agent.agentName}`,
          agent.userEmail ? `tokenOwner: ${agent.userEmail}` : 'tokenOwner: (unknown)',
          agent.userId ? `tokenOwnerUserId: ${agent.userId}` : '',
          `permission: ${agent.permission}`,
          `tools (${available.length}): ${available.join(', ')}`,
          agent.permission === 'read'
            ? 'Hint: ask the token owner to raise the token permission in Settings → MCP tokens if you need remember/write tools.'
            : agent.permission === 'propose'
              ? 'Hint: use openkb_remember for reviewable writes; openkb_upsert_knowledge requires write token permission. Knowledge is attributed to the token owner.'
              : 'Hint: this token has write permission. Knowledge writes are attributed to the human who owns the API token.',
        ].filter(Boolean).join('\n'))
        break
      }
      case 'openkb_search': {
        const query = String(args.query ?? '').trim()
        const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 50)
        const candidates = query
          ? await service.searchKnowledge(query, 1000)
          : await service.listKnowledge()
        const docs = filterKnowledge(candidates, args).slice(0, limit)
        if (!docs.length) {
          result = textResult(query ? 'No matching knowledge found.' : 'No knowledge items found.')
        } else if (query) {
          result = textResult(docs.map(formatDocFull).join('\n\n---\n\n'))
        } else {
          result = textResult(`Found ${docs.length} knowledge item(s):\n\n${docs.map(formatDocList).join('\n')}`)
        }
        break
      }
      case 'openkb_get_context': {
        // Retrieval uses project/path scope only.
        const docs = await service.getContext({
          projectSlug: args.projectSlug ? String(args.projectSlug) : undefined,
          path: args.path ? String(args.path) : undefined,
          limit: Math.min(Math.max(Number(args.limit ?? 8), 1), 50),
        })
        result = textResult(docs.length ? docs.map(formatDocFull).join('\n\n---\n\n') : 'No relevant knowledge found for this context.')
        break
      }
      case 'openkb_get_knowledge': {
        const slug = String(args.slug ?? '').trim()
        if (!slug) throw { code: -32602, message: 'slug is required' }
        const doc = await service.getKnowledge(slug)
        if (!doc || !isActiveForRetrieval(doc)) throw { code: -32602, message: `Active knowledge "${slug}" not found.` }
        result = textResult(formatDocFull(doc))
        break
      }
      case 'openkb_list_types':
        result = textResult(`Available knowledge types:\n\n${knowledgeTypes.map((type) => `- \`${type}\``).join('\n')}`)
        break
      case 'openkb_list_versions': {
        const slug = String(args.slug ?? '').trim()
        if (!slug) throw { code: -32602, message: 'slug is required' }
        const history = await service.listDocumentVersions(slug, {
          page: Number(args.page ?? 1),
          pageSize: Number(args.pageSize ?? 20),
        })
        if (!history) throw { code: -32602, message: `Knowledge "${slug}" not found.` }
        const { knowledge, versions, page, pageSize, total, totalPages } = history
        if (!versions.length) {
          result = textResult(`No versions for \`${knowledge.slug}\`.`)
        } else {
          result = textResult(
            `Versions of **${knowledge.title}** (\`${knowledge.slug}\`) — page ${page}/${totalPages}, ${total} total (pageSize ${pageSize}):\n\n${versions.map(formatVersion).join('\n')}`,
          )
        }
        break
      }
      case 'openkb_remember': {
        const title = String(args.title ?? '').trim()
        const summary = String(args.summary ?? '').trim()
        const content = String(args.content ?? '').trim()
        if (!title || !summary || !content) throw { code: -32602, message: 'title, summary, and content are required' }
        const type = String(args.type ?? 'context')
        if (!knowledgeTypes.includes(type as never)) throw { code: -32602, message: `Unsupported knowledge type: ${type}` }
        const proposal = await service.proposeKnowledge({
          slug: args.slug ? String(args.slug) : undefined,
          title,
          summary,
          type: type as never,
          content,
          scope: scopeFromArgs(args),
          createdBy: creatorAttribution(agent),
        })
        result = textResult(`Memory proposal created (ID: ${proposal.id}). It is open for review. Status: ${proposal.status}. Slug: ${proposal.slug}.`)
        break
      }
      case 'openkb_list_proposals': {
        const statusFilter = String(args.status ?? 'open').trim().toLowerCase()
        const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100)
        let proposals = await service.listProposals()
        if (statusFilter !== 'all') {
          if (!['open', 'approved', 'rejected'].includes(statusFilter)) {
            throw { code: -32602, message: 'status must be open, approved, rejected, or all' }
          }
          proposals = proposals.filter((item) => item.status === statusFilter)
        }
        proposals = proposals.slice(0, limit)
        if (!proposals.length) {
          result = textResult(statusFilter === 'all' ? 'No proposals found.' : `No ${statusFilter} proposals.`)
        } else {
          result = textResult(`Found ${proposals.length} proposal(s):\n\n${proposals.map(formatProposal).join('\n')}`)
        }
        break
      }
      case 'openkb_get_proposal': {
        const id = String(args.id ?? '').trim()
        if (!id) throw { code: -32602, message: 'id is required' }
        const proposal = await service.getProposal(id)
        if (!proposal) throw { code: -32602, message: `Proposal not found: ${id}` }
        result = textResult(formatProposalFull(proposal))
        break
      }
      case 'openkb_upsert_knowledge': {
        const slug = String(args.slug ?? '').trim()
        const title = String(args.title ?? '').trim()
        const summary = String(args.summary ?? '').trim()
        const content = String(args.content ?? '').trim()
        if (!slug || !title || !summary || !content) throw { code: -32602, message: 'slug, title, summary, and content are required' }
        const type = String(args.type ?? 'context')
        if (!knowledgeTypes.includes(type as never)) throw { code: -32602, message: `Unsupported knowledge type: ${type}` }
        const doc = await service.upsertKnowledge({
          slug,
          title,
          summary,
          type: type as never,
          status: 'active',
          content,
          scope: scopeFromArgs(args),
          createdBy: creatorAttribution(agent),
        })
        result = textResult(`Knowledge "${doc.slug}" saved as active version ${doc.version}.`)
        break
      }
      case 'openkb_delete_knowledge': {
        const slug = String(args.slug ?? '').trim()
        if (!slug) throw { code: -32602, message: 'slug is required' }
        if (!await service.deleteKnowledge(slug)) throw { code: -32602, message: `Knowledge "${slug}" not found.` }
        result = textResult(`Knowledge "${slug}" deleted.`)
        break
      }
      default:
        throw { code: -32601, message: `Unknown tool: ${tool}` }
    }
    
    logger?.info({ tool, durationMs: Date.now() - startTime }, `MCP tool call completed: ${tool}`)
    return result
  } catch (error) {
    logger?.error({ tool, err: error, durationMs: Date.now() - startTime }, `MCP tool call failed: ${tool}`)
    throw error
  }
}

function toMcpError(error: unknown): McpError {
  if (error instanceof McpError) return error
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown }
    if (typeof candidate.code === 'number' && typeof candidate.message === 'string') {
      return new McpError(candidate.code, candidate.message)
    }
  }
  return new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : String(error))
}

function identityFromRequestBody(body: unknown): Pick<McpRequestContext, 'agentName'> {
  if (typeof body !== 'object' || body === null) return {}
  const request = body as { method?: unknown; params?: unknown }
  if (typeof request.params !== 'object' || request.params === null) return {}
  const params = request.params as { arguments?: unknown; agentName?: unknown }
  const identity = request.method === 'tools/call' && typeof params.arguments === 'object' && params.arguments !== null
    ? params.arguments as { agentName?: unknown }
    : params
  return {
    ...(typeof identity.agentName === 'string' && identity.agentName.trim() ? { agentName: identity.agentName.trim() } : {}),
  }
}

export async function createMcpServer(service: KnowledgeService, context: McpRequestContext = {}): Promise<McpServer> {
  const initialIdentity = await resolveAgent(service, undefined, context)
  const server = new McpServer({ name: 'openkb', version: OPENKB_VERSION })

  for (const tool of toolsForPermission(initialIdentity.permission)) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
    }, async (args) => {
      const toolArgs = (args ?? {}) as Record<string, unknown>
      const identity = await resolveAgent(service, toolArgs, context)
      try {
        return await handleToolCall(service, tool.name, toolArgs, identity, context.logger)
      } catch (error) {
        throw toMcpError(error)
      }
    })
  }

  return server
}

export async function handleMcpHttpRequest(
  service: KnowledgeService,
  request: IncomingMessage,
  response: ServerResponse,
  body: unknown,
  context: McpRequestContext = {},
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  let server: McpServer | undefined

  try {
    const bodyIdentity = identityFromRequestBody(body)
    const agentName = context.agentName ?? bodyIdentity.agentName
    context.logger?.debug?.({ url: request.url, agentName }, 'MCP HTTP request received')
    
    server = await createMcpServer(service, {
      authenticated: context.authenticated,
      agentName,
      userId: context.userId,
      userEmail: context.userEmail,
      tokenId: context.tokenId,
      tokenPermission: context.tokenPermission,
      logger: context.logger,
    })
    response.once('close', () => {
      context.logger?.debug?.('MCP response closed, cleaning up transport and server')
      void transport.close()
      void server?.close()
    })
    await server.connect(transport)
    await transport.handleRequest(request, response, body)
  } catch (error) {
    context.logger?.error({ err: error }, 'Failed to handle MCP HTTP request')
    if (!response.headersSent) {
      response.statusCode = 500
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: ErrorCode.InternalError, message: 'Internal server error' },
        id: null,
      }))
    }
    await transport.close().catch(() => undefined)
    await server?.close().catch(() => undefined)
  }
}
