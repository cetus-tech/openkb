import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z, type ZodRawShape } from 'zod'
import type { KnowledgeService } from '../core/service.js'
import {
  knowledgeTypes,
  pathKinds,
  responseModes,
  isActiveForRetrieval,
  OPENKB_VERSION,
  type ContextQuery,
  type ContextRetrievalResult,
  type Knowledge,
  type KnowledgeScope,
} from '../core/index.js'
import type { AgentPermission, ChangeProposal, KnowledgeVersion } from '../db/db-access.js'

type ToolInputShape = ZodRawShape

interface McpTool {
  name: string
  description: string
  inputSchema: ToolInputShape
}

const STACK_FACET_DESCRIPTION =
  'Declared technology facets. Prefer lower-case canonical values such as language:typescript and framework:vue:3. Names and aliases come from the managed technology catalog; call openkb_list_technologies to discover them. Unregistered aliases remain unknown.'

const KNOWLEDGE_STACKS_DESCRIPTION =
  'Required technology facets for this knowledge. Prefer canonical values such as language:typescript and framework:vue:3. Names and aliases use the managed technology catalog. Every listed facet must match; omit stacks for global knowledge.'

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
      'Primary read tool: filter active knowledge by declared project stack and scope, include every applicable item, and deliver it within a token budget. Call this before non-trivial work.',
    inputSchema: {
      projectSlug: z.string().optional().describe('Optional project scope; omit for global knowledge'),
      path: z.string().optional().describe('Project-relative current file path; compatibility alias for paths'),
      paths: z.array(z.string()).optional().describe('Project-relative paths for work spanning components'),
      pathKind: z.enum(pathKinds).optional().describe('Whether the path identifies a file or directory'),
      root: z.string().optional().describe('Explicit root for normalizing a legacy absolute path'),
      stack: z.array(z.string()).optional().describe(`Complete declared project stack. ${STACK_FACET_DESCRIPTION}`),
      maxTokens: z.number().optional().describe('Estimated output token budget, default 4000, maximum 12000'),
      responseMode: z.enum(responseModes).optional().describe('adaptive, summary, or full; default adaptive'),
      cursor: z.string().optional().describe('Continuation cursor returned by a previous context response'),
      limit: z.number().optional().describe('Additional maximum number of optional results, maximum 50'),
    },
  },
  {
    name: 'openkb_search',
    description:
      'Search active knowledge by words in slug, title, summary, type, or content. Contextual filters run before ranking and limits. Omit query to list applicable items; set discovery for an explicit broader search.',
    inputSchema: {
      query: z.string().optional().describe('Words to search for; omit or leave empty to list active knowledge'),
      limit: z.number().optional().describe('Maximum number of results (default 10)'),
      projectSlug: z.string().optional().describe('Optional project scope; omit for global knowledge'),
      path: z.string().optional().describe('Optional project-relative current file path'),
      paths: z.array(z.string()).optional().describe('Optional project-relative paths'),
      pathKind: z.enum(pathKinds).optional(),
      root: z.string().optional().describe('Explicit root for normalizing a legacy absolute path'),
      stack: z.array(z.string()).optional().describe(`Complete declared project stack. ${STACK_FACET_DESCRIPTION}`),
      discovery: z.boolean().optional().describe('Explicitly include stack-incompatible active items for discovery'),
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
    name: 'openkb_list_technologies',
    description: 'List managed technology names, canonical IDs, and accepted aliases for stack declarations and knowledge scopes.',
    inputSchema: {},
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
      stacks: z.array(z.string()).optional().describe(KNOWLEDGE_STACKS_DESCRIPTION),
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
      stacks: z.array(z.string()).optional().describe(KNOWLEDGE_STACKS_DESCRIPTION),
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

function textResult(text: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

function formatScope(scope: KnowledgeScope): string {
  return [
    scope.projectSlug ? `project: ${scope.projectSlug}` : 'global',
    ...(scope.pathPatterns?.length ? [`paths: ${scope.pathPatterns.join(', ')}`] : []),
    ...(scope.stacks?.length ? [`stacks: ${scope.stacks.join(', ')}`] : []),
  ].join(' | ')
}

function formatDocFull(doc: Knowledge): string {
  return `# ${doc.title}\nslug: ${doc.slug}\ntype: ${doc.type}\nstatus: ${doc.status}\nversion: ${doc.version}\nscope: ${formatScope(doc.scope)}\nsummary: ${doc.summary}\n\n${doc.content}`
}

function formatDocSummary(doc: Knowledge, reason: string): string {
  return `- **${doc.title}** (\`${doc.slug}\`) - ${doc.type} v${doc.version}\n  ${doc.summary}\n  delivery: summary; reason: ${reason}; fetch with openkb_get_knowledge(slug="${doc.slug}")`
}

function formatDocList(doc: Knowledge): string {
  return `- **${doc.title}** (\`${doc.slug}\`) - ${doc.type} v${doc.version} [${formatScope(doc.scope)}]`
}

function formatProposal(proposal: ChangeProposal): string {
  return `- **${proposal.title}** (\`${proposal.slug}\`) - ${proposal.status} [${formatScope(proposal.scope)}] id:${proposal.id}${proposal.createdBy ? ` by ${proposal.createdBy}` : ''}\n  ${proposal.summary}`
}

function formatProposalFull(proposal: ChangeProposal): string {
  const meta = [
    `id: ${proposal.id}`,
    `slug: ${proposal.slug}`,
    `type: ${proposal.type}`,
    `status: ${proposal.status}`,
    `scope: ${formatScope(proposal.scope)}`,
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
  const hasStacks = Object.prototype.hasOwnProperty.call(args, 'stacks')
  const stacks = hasStacks ? stringArrayArg(args.stacks) ?? [] : undefined
  const scope: KnowledgeScope = {
    ...(args.projectSlug ? { projectSlug: String(args.projectSlug) } : {}),
    ...(pathPatterns ? { pathPatterns } : {}),
    ...(hasStacks ? { stacks } : {}),
  }
  return Object.keys(scope).length ? scope : undefined
}

function contextQueryFromArgs(args: Record<string, unknown>, options: { legacyMode?: boolean } = {}): ContextQuery {
  const stack = stringArrayArg(args.stack)
  const paths = stringArrayArg(args.paths)
  const responseMode = typeof args.responseMode === 'string' && responseModes.includes(args.responseMode as never)
    ? args.responseMode as ContextQuery['responseMode']
    : undefined
  const pathKind = typeof args.pathKind === 'string' && pathKinds.includes(args.pathKind as never)
    ? args.pathKind as ContextQuery['pathKind']
    : undefined
  return {
    projectSlug: args.projectSlug ? String(args.projectSlug) : undefined,
    path: args.path ? String(args.path) : undefined,
    paths,
    pathKind,
    root: args.root ? String(args.root) : undefined,
    stack,
    component: args.component ? String(args.component) : undefined,
    task: args.task ? String(args.task) : undefined,
    type: args.type ? String(args.type) : undefined,
    maxTokens: args.maxTokens == null ? undefined : Number(args.maxTokens),
    responseMode,
    cursor: args.cursor ? String(args.cursor) : undefined,
    limit: args.limit == null ? undefined : Number(args.limit),
    discovery: args.discovery === true,
    ...(options.legacyMode ? { legacyMode: true } : {}),
  }
}

/** Creator attribution: token owner email (server-known), not client-asserted. */
function creatorAttribution(agent: AgentIdentity): string {
  if (agent.userEmail) return agent.userEmail
  if (agent.userId != null) return String(agent.userId)
  return agent.agentName
}



function contextStructured(result: ContextRetrievalResult): Record<string, unknown> {
  return {
    eligibleCount: result.eligibleCount,
    returnedCount: result.returnedCount,
    omittedCount: result.omittedCount,
    omittedByBudget: result.omittedByBudget,
    omittedByLimit: result.omittedByLimit,
    requiredFetch: result.requiredFetch,
    incompleteRequiredContext: result.incompleteRequiredContext,
    ...(result.cursor ? { cursor: result.cursor } : {}),
    ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    estimatedTokens: result.estimatedTokens,
    estimatedBytes: result.estimatedBytes,
    maxBytes: result.maxBytes,
    maxTokens: result.maxTokens,
    tokenEstimator: result.tokenEstimator,
    responseMode: result.responseMode,
    diagnostics: result.diagnostics,
  }
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
        const context = contextQueryFromArgs(args, { legacyMode: !args.stack && !args.discovery })
        if (context.limit === undefined) context.limit = 10
        const searchResult = await service.searchKnowledgeWithContext(query, context)
        const docs = searchResult.knowledge
        if (!docs.length) {
          const diagnostic = searchResult.diagnostics.missingStack
            ? ' A declared project stack is required to retrieve stack-specific knowledge.'
            : ''
          result = textResult(query ? `No matching knowledge found.${diagnostic}` : `No applicable knowledge items found.${diagnostic}`, {
            eligibleCount: searchResult.eligibleCount,
            matchedCount: searchResult.matchedCount,
            omittedCount: searchResult.omittedCount,
            diagnostics: searchResult.diagnostics,
          })
        } else if (query) {
          result = textResult(docs.map(formatDocFull).join('\n\n---\n\n'), {
            eligibleCount: searchResult.eligibleCount,
            matchedCount: searchResult.matchedCount,
            omittedCount: searchResult.omittedCount,
            diagnostics: searchResult.diagnostics,
          })
        } else {
          result = textResult(`Found ${docs.length} knowledge item(s):\n\n${docs.map(formatDocList).join('\n')}`, {
            eligibleCount: searchResult.eligibleCount,
            matchedCount: searchResult.matchedCount,
            omittedCount: searchResult.omittedCount,
            diagnostics: searchResult.diagnostics,
          })
        }
        break
      }
      case 'openkb_get_context': {
        const context = contextQueryFromArgs(args)
        const retrieval = await service.getContextResult(context)
        const body = retrieval.entries.map((entry) => entry.delivery === 'full'
          ? formatDocFull(entry.doc)
          : formatDocSummary(entry.doc, entry.reason)).join('\n\n---\n\n')
        const notices: string[] = []
        if (retrieval.requiredFetch.length) {
          notices.push(`Fetch full applicable knowledge before continuing: ${retrieval.requiredFetch.map((slug) => `openkb_get_knowledge(slug="${slug}")`).join(', ')}`)
        }
        if (retrieval.nextCursor) notices.push(`More applicable knowledge is available. Continue with cursor: ${retrieval.nextCursor}`)
        if (retrieval.diagnostics.missingStack) notices.push('Stack-specific knowledge was omitted because the declared project stack is missing or unresolved.')
        const text = [
          body || 'No relevant knowledge found for this context.',
          notices.join('\n'),
        ].filter(Boolean).join('\n\n')
        result = textResult(text, contextStructured(retrieval))
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
      case 'openkb_list_technologies': {
        const technologies = await service.listTechnologies()
        result = textResult(JSON.stringify({ technologies }))
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
