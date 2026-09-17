export interface Technology {
  facet: string
  label: string
  aliases: string[]
}

export interface Knowledge {
  id: number
  slug: string
  title: string
  summary: string
  type: string
  status: string
  content: string
  version: number
  /** Author of the current version. */
  createdBy?: string
  updatedAt?: string
  /**
   * Dashboard-only group assignment for organizing knowledge in the UI.
   * Does not affect MCP search or context retrieval.
   */
  groupId?: number | null
  scope: {
    projectSlug?: string
    pathPatterns?: string[]
    /** Required technology facets. Omitted or empty means global. */
    stacks?: string[]
  }
}

export interface ContextEntry {
  slug: string
  title: string
  summary: string
  type: string
  delivery: 'full' | 'summary'
  required: boolean
  estimatedTokens: number
  reason: string
}

export interface ContextDiagnostics {
  stack: string[]
  paths: string[]
  missingStack: boolean
  unknownStack: string[]
  missingPath: boolean
  invalidPaths: string[]
  absolutePathRequiresRoot: string[]
  unclassified: number
  excludedByStack: number
  excludedByApplicability: number
  excludedByProject: number
  excludedByPath: number
  excludedByPolicy: number
  excludedByTask: number
  cursorError?: 'invalid' | 'stale'
}

export interface ContextResponse {
  knowledge: Knowledge[]
  entries: ContextEntry[]
  eligibleCount: number
  returnedCount: number
  omittedCount: number
  omittedByBudget: number
  omittedByLimit: number
  requiredFetch: string[]
  incompleteRequiredContext: boolean
  cursor?: string
  nextCursor?: string
  estimatedTokens: number
  estimatedBytes: number
  maxBytes: number
  maxTokens: number
  tokenEstimator: string
  responseMode: 'adaptive' | 'summary' | 'full'
  diagnostics: ContextDiagnostics
}

export interface KnowledgeGroup {
  id: number
  name: string
  parentId: number | null
  sortOrder: number
  knowledgeCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeGroupTreeNode extends KnowledgeGroup {
  children: KnowledgeGroupTreeNode[]
}

export interface KnowledgeGroupsPayload {
  groups: KnowledgeGroup[]
  tree: KnowledgeGroupTreeNode[]
  ungroupedCount: number
  totalCount: number
}

export interface KnowledgePage {
  knowledge: Knowledge[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface KnowledgeVersion {
  id: number
  knowledgeId: number
  version: number
  content: string
  contentHash: string
  changeSummary?: string
  createdBy?: string
  createdAt: string
  current: boolean
}

export interface KnowledgeVersionPage {
  knowledge: Knowledge
  versions: KnowledgeVersion[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface Agent {
  id: number
  name: string
  label?: string
  lastSeenAt?: string
  lastTokenId?: number
  lastTokenPrefix?: string
  lastTokenName?: string
  lastUserName?: string
  /** Permission of the token this agent last used (display only). */
  lastTokenPermission?: 'read' | 'propose' | 'write' | string
  createdAt?: string
}

export interface Proposal {
  id: number
  knowledgeId?: number
  slug: string
  type?: string
  title: string
  summary: string
  status: 'open' | 'approved' | 'rejected' | string
  proposedContentMarkdown?: string
  scope?: Knowledge['scope']
  createdAt?: string
  createdBy?: string
}

export interface ProposalPage {
  proposals: Proposal[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: { all: number; open: number; approved: number; rejected: number }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = localStorage.getItem('openkb_token')
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(input, { ...init, headers, credentials: init.credentials ?? 'include' })
  let payload: unknown = null
  if (typeof response.text === 'function') {
    const text = await response.text()
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
  } else if (typeof response.json === 'function') {
    payload = await response.json()
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message?: unknown }).message)
      : response.statusText || `Request failed with status ${response.status}`
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export function relativeTime(iso?: string): string {
  if (!iso) return 'unknown'
  const elapsed = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'just now'
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function scopeLabel(knowledge: Knowledge): string {
  return knowledge.scope?.projectSlug || 'global'
}

/** Display tag like `@global` or `@openkb` for scope chips beside titles. */
export function scopeAtTag(knowledge: Knowledge): string {
  const project = knowledge.scope?.projectSlug?.trim()
  return project ? `@${project}` : '@global'
}
