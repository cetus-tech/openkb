import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

// Single source of truth for the version: package.json.
const require = createRequire(import.meta.url)
const packageJson = require('../../package.json') as { version: string }

export const OPENKB_VERSION = packageJson.version

export const knowledgeTypes = [
  'context',
  'rule',
  'spec',
  'workflow',
  'runbook',
  'decision',
  'reference',
  'prompt',
  'skill',
  'template',
] as const

export type KnowledgeType = (typeof knowledgeTypes)[number]

export const knowledgeStatuses = ['active', 'inactive'] as const
export type KnowledgeStatus = (typeof knowledgeStatuses)[number]

export const contextPolicies = ['required', 'auto', 'manual'] as const
export type ContextPolicy = (typeof contextPolicies)[number]

export const responseModes = ['adaptive', 'summary', 'full'] as const
export type ResponseMode = (typeof responseModes)[number]

export const pathKinds = ['file', 'directory'] as const
export type ContextPathKind = (typeof pathKinds)[number]

/** Defaults are shared by MCP, REST, and the core selector. */
export const DEFAULT_CONTEXT_MAX_TOKENS = 4_000
export const MAX_CONTEXT_MAX_TOKENS = 12_000
export const DEFAULT_CONTEXT_ENTRY_LIMIT = 50
export const MAX_CONTEXT_ENTRY_LIMIT = 50
export const MAX_CONTEXT_RESPONSE_BYTES = 256_000
export const CONTEXT_TOKEN_ESTIMATOR = 'openkb-reference-v1'

export interface KnowledgeScope {
  projectSlug?: string
  pathPatterns?: string[]
  /** Required canonical technology facets. Omitted or empty means global. */
  stacks?: string[]
  /** Deprecated compatibility input. Ignored during context selection. */
  contextPolicy?: ContextPolicy
}

export interface Knowledge {
  id: number
  slug: string
  title: string
  summary: string
  type: KnowledgeType
  status: KnowledgeStatus
  content: string
  scope: KnowledgeScope
  version: number
  /** Author of the current version (version.created_by). */
  createdBy?: string
  updatedAt: string
  /** Dashboard-only group assignment. It does not affect retrieval. */
  groupId?: number | null
}

export interface ContextQuery {
  projectSlug?: string
  /** Singular path compatibility alias. */
  path?: string
  /** Paths for work spanning more than one component. */
  paths?: string[]
  pathKind?: ContextPathKind
  /** Required when a legacy absolute path needs project-root normalization. */
  root?: string
  /** Declared project technologies, preferably canonical facets. */
  /** Internal catalog snapshot; never accepted from an HTTP/MCP caller. */
  stackAliases?: Readonly<Record<string, string>>
  stack?: string[]
  /** Deprecated compatibility hint; use project/path restrictions instead. */
  component?: string
  /** Deprecated compatibility hint; ignored for context selection and ordering. */
  task?: string
  type?: string
  limit?: number
  maxTokens?: number
  responseMode?: ResponseMode
  cursor?: string
  /** Explicitly broad search may inspect stack-incompatible active items. */
  discovery?: boolean
  /** Internal compatibility switch for old clients that omit all context fields. */
  legacyMode?: boolean
}

export interface StackNormalization {
  facets: string[]
  unknown: string[]
  provided: boolean
}

export interface PathNormalization {
  paths: string[]
  invalid: string[]
  absoluteWithoutRoot: string[]
}

export interface ContextDiagnostics {
  /** Canonical stack facets used for eligibility and ranking. */
  stack: string[]
  /** Canonical project-relative paths used for eligibility and ranking. */
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

export type ContextDelivery = 'full' | 'summary'

export interface ContextEntry {
  doc: Knowledge
  /** Alias retained for clients that call entries knowledge. */
  knowledge: Knowledge
  delivery: ContextDelivery
  required: boolean
  estimatedTokens: number
  reason: string
}

export interface ContextRetrievalResult {
  entries: ContextEntry[]
  /** Full document objects retained for REST/client compatibility. */
  knowledge: Knowledge[]
  eligibleCount: number
  returnedCount: number
  omittedCount: number
  omittedByBudget: number
  omittedByLimit: number
  requiredFetch: string[]
  incompleteRequiredContext: boolean
  nextCursor?: string
  cursor?: string
  estimatedTokens: number
  estimatedBytes: number
  maxBytes: number
  maxTokens: number
  tokenEstimator: string
  responseMode: ResponseMode
  diagnostics: ContextDiagnostics
}

export interface ContextSearchResult {
  knowledge: Knowledge[]
  eligibleCount: number
  matchedCount: number
  omittedCount: number
  diagnostics: ContextDiagnostics
}

function canonicalFacet(value: string, aliases: Readonly<Record<string, string>> = {}): string | undefined {
  const raw = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!raw) return undefined
  const alias = Object.hasOwn(aliases, raw) ? aliases[raw] : undefined
  if (alias) return alias

  // Explicit canonical IDs work for any technology, including those not yet
  // in the catalog. Human-readable names require a managed alias.
  if (/^language:[a-z0-9][a-z0-9_-]*$/.test(raw)) return raw
  if (/^framework:[a-z0-9][a-z0-9_-]*:[0-9]+$/.test(raw)) return raw
  return undefined
}

/** Normalize human-friendly aliases without guessing an unknown framework version. */
export function normalizeStackFacets(input?: readonly unknown[] | string, aliases: Readonly<Record<string, string>> = {}): StackNormalization {
  const values = typeof input === 'string'
    ? input.split(',')
    : Array.isArray(input)
      ? input
      : []
  const facets: string[] = []
  const unknown: string[] = []
  for (const item of values) {
    const raw = String(item).trim()
    if (!raw) continue
    const facet = canonicalFacet(raw, aliases)
    if (facet) {
      if (!facets.includes(facet)) facets.push(facet)
    } else if (!unknown.includes(raw)) {
      unknown.push(raw)
    }
  }
  return { facets, unknown, provided: values.some((item) => String(item).trim().length > 0) }
}

/** Return a canonical facet for one known alias, or undefined when unresolved. */
export function normalizeStackFacet(value: string, aliases: Readonly<Record<string, string>> = {}): string | undefined {
  return canonicalFacet(value, aliases)
}

/** Normalize scope metadata at write/import boundaries while retaining unknown facets for review. */
export function normalizeKnowledgeScope(scope?: Partial<KnowledgeScope> | null, aliases: Readonly<Record<string, string>> = {}): KnowledgeScope {
  if (!scope || typeof scope !== 'object') return {}
  const source = scope as unknown as Record<string, unknown>
  const normalized = {} as KnowledgeScope & Record<string, unknown>
  // Scope is an extensible JSON envelope. Preserve fields owned by older or
  // newer clients when a document is edited, while replacing only the fields
  // understood by this selector with their normalized forms.
  for (const [key, value] of Object.entries(source)) {
    if (!['projectSlug', 'pathPatterns', 'stacks', 'applicability', 'contextPolicy', 'toolTargets'].includes(key)) {
      normalized[key] = value
    }
  }
  if (typeof scope.projectSlug === 'string' && scope.projectSlug.trim()) {
    normalized.projectSlug = scope.projectSlug.trim()
  }
  if (Array.isArray(scope.pathPatterns)) {
    const patterns = scope.pathPatterns.map((pattern) => String(pattern).trim()).filter(Boolean)
    if (patterns.length) normalized.pathPatterns = patterns
  }
  if (Array.isArray(scope.stacks)) {
    const normalizedStacks: string[] = []
    for (const stack of scope.stacks.map((item) => String(item).trim()).filter(Boolean)) {
      const facet = canonicalFacet(stack, aliases)
      const value = facet ?? stack
      if (!normalizedStacks.includes(value)) normalizedStacks.push(value)
    }
    // Empty arrays have the same meaning as an omitted stacks field, so keep
    // global scopes compact as `{}`.
    if (normalizedStacks.length) normalized.stacks = normalizedStacks
  }

  return normalized
}

/** Only active knowledge is retrieved by MCP search/context. */
export function isActiveForRetrieval(doc: Knowledge): boolean {
  return doc.status === 'active'
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

/**
 * Normalize file paths without silently stripping an arbitrary absolute prefix.
 * Absolute paths need an explicit project root so equivalent paths are safe to map.
 */
export function normalizeContextPaths(query: Pick<ContextQuery, 'path' | 'paths' | 'root'>): PathNormalization {
  const rawPaths = [
    ...(query.path ? [query.path] : []),
    ...(query.paths ?? []),
  ]
  const paths: string[] = []
  const invalid: string[] = []
  const absoluteWithoutRoot: string[] = []
  const root = query.root ? normalizeRelativePath(query.root).replace(/\/$/, '') : undefined

  for (const rawValue of rawPaths) {
    const raw = String(rawValue).trim()
    if (!raw) continue
    const normalized = normalizeRelativePath(raw)
    const isWindowsAbsolute = /^[a-z]:\//i.test(normalized)
    const isUnixAbsolute = normalized.startsWith('/')
    if (isWindowsAbsolute || isUnixAbsolute) {
      if (!root) {
        absoluteWithoutRoot.push(raw)
        continue
      }
      const normalizedRoot = root.replace(/\/$/, '')
      const comparablePath = normalized.toLowerCase()
      const comparableRoot = normalizedRoot.toLowerCase()
      if (comparablePath !== comparableRoot && !comparablePath.startsWith(`${comparableRoot}/`)) {
        invalid.push(raw)
        continue
      }
      const relative = normalized.slice(normalizedRoot.length).replace(/^\/+/, '')
      if (!relative || relative === '..' || relative.startsWith('../')) {
        invalid.push(raw)
        continue
      }
      if (!paths.includes(relative)) paths.push(relative)
      continue
    }
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      invalid.push(raw)
      continue
    }
    if (!paths.includes(normalized)) paths.push(normalized)
  }
  return { paths, invalid, absoluteWithoutRoot }
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRelativePath(path)
  const normalizedPattern = normalizeRelativePath(pattern.trim())
  if (normalizedPattern === '*' || normalizedPattern === '**') return true

  let regex = ''
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index]
    if (character === '*') {
      if (normalizedPattern[index + 1] === '*') {
        index += 1
        if (normalizedPattern[index + 1] === '/') {
          regex += '(?:.*/)?'
          index += 1
        } else {
          regex += '.*'
        }
      } else {
        regex += '[^/]*'
      }
    } else if (character === '?') {
      regex += '[^/]'
    } else if ('\\.^$+{}()|[]'.includes(character)) {
      regex += `\\${character}`
    } else {
      regex += character
    }
  }

  return new RegExp(`^${regex}$`).test(normalizedPath)
}

function normalizePathKind(value: unknown): ContextPathKind | undefined {
  return typeof value === 'string' && pathKinds.includes(value as ContextPathKind)
    ? value as ContextPathKind
    : undefined
}

function normalizeResponseMode(value: unknown): ResponseMode | undefined {
  return typeof value === 'string' && responseModes.includes(value as ResponseMode)
    ? value as ResponseMode
    : undefined
}

function normalizeQuery(query: ContextQuery): {
  query: ContextQuery
  stack: StackNormalization
  paths: PathNormalization
} {
  const stack = normalizeStackFacets(query.stack, query.stackAliases)
  const paths = normalizeContextPaths(query)
  return {
    query: {
      ...query,
      projectSlug: typeof query.projectSlug === 'string' ? query.projectSlug.trim() || undefined : undefined,
      path: paths.paths[0],
      paths: paths.paths,
      pathKind: normalizePathKind(query.pathKind),
      stack: stack.facets,
      task: typeof query.task === 'string' ? query.task.trim() || undefined : undefined,
      component: typeof query.component === 'string' ? query.component.trim().toLowerCase() || undefined : undefined,
      type: typeof query.type === 'string' ? query.type.trim() || undefined : undefined,
      responseMode: normalizeResponseMode(query.responseMode),
    },
    stack,
    paths,
  }
}

interface ContextEvaluation {
  eligible: boolean
  reason: string
  required: boolean
  exclusion?: keyof Pick<ContextDiagnostics, 'excludedByStack' | 'excludedByApplicability' | 'excludedByProject' | 'excludedByPath' | 'excludedByPolicy'>
}

function documentStacks(doc: Knowledge, query: ContextQuery): StackNormalization {
  return normalizeStackFacets(doc.scope.stacks, query.stackAliases)
}

function evaluateContext(doc: Knowledge, query: ContextQuery, normalized: ReturnType<typeof normalizeQuery>): ContextEvaluation {
  if (!isActiveForRetrieval(doc)) return { eligible: false, reason: 'inactive', required: false }

  if (query.type && doc.type !== query.type) {
    return { eligible: false, reason: 'different knowledge type', required: false }
  }

  const projectScoped = Boolean(doc.scope.projectSlug)
  if (!query.projectSlug && projectScoped && !query.legacyMode && !query.discovery) {
    return { eligible: false, reason: 'project scope requires projectSlug', required: false, exclusion: 'excludedByProject' }
  }
  if (query.projectSlug && projectScoped && doc.scope.projectSlug !== query.projectSlug) {
    return { eligible: false, reason: 'different project', required: false, exclusion: 'excludedByProject' }
  }

  const documentStack = documentStacks(doc, query)
  const hasRequiredStacks = documentStack.facets.length > 0 || documentStack.unknown.length > 0
  if (hasRequiredStacks && !query.discovery) {
    if (!normalized.stack.provided) {
      return { eligible: false, reason: 'declared stack is required', required: false, exclusion: 'excludedByStack' }
    }
    if (documentStack.unknown.length > 0 || !documentStack.facets.every((facet) => normalized.stack.facets.includes(facet))) {
      return { eligible: false, reason: 'declared stack does not match', required: false, exclusion: 'excludedByStack' }
    }
  }

  const patterns = doc.scope.pathPatterns ?? []
  if (patterns.length && !query.discovery) {
    if (normalized.paths.paths.length === 0 || query.pathKind === 'directory') {
      return { eligible: false, reason: 'a matching file path is required', required: false, exclusion: 'excludedByPath' }
    }
    const matches = normalized.paths.paths.some((path) => patterns.some((pattern) => pathMatchesPattern(path, pattern)))
    if (!matches) {
      return { eligible: false, reason: 'path does not match', required: false, exclusion: 'excludedByPath' }
    }
  }

  const reason = hasRequiredStacks
    ? `stack match${projectScoped ? `, project ${doc.scope.projectSlug}` : ''}`
    : projectScoped
      ? `project ${doc.scope.projectSlug}`
      : patterns.length
        ? 'matching file path'
        : 'global guidance'
  return {
    eligible: true,
    reason,
    required: true,
  }
}

function matchingPathPatterns(doc: Knowledge, paths: string[]): string[] {
  if (!paths.length || !doc.scope.pathPatterns?.length) return []
  return doc.scope.pathPatterns.filter((pattern) => paths.some((path) => pathMatchesPattern(path, pattern)))
}

function pathSpecificityScore(pattern: string): number {
  const segments = pattern.split('/').filter(Boolean)
  return segments.reduce((score, segment) => {
    if (segment === '**') return score + 1
    if (segment.includes('*') || segment.includes('?')) return score + 2
    return score + 4
  }, 0)
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

function contextSpecificityScore(doc: Knowledge, query: ContextQuery, paths: string[]): number {
  let score = 0
  const matchedPatterns = matchingPathPatterns(doc, paths)
  if (matchedPatterns.length > 0) {
    score += 40
    score += Math.max(...matchedPatterns.map(pathSpecificityScore))
  }
  if (doc.scope.projectSlug && query.projectSlug === doc.scope.projectSlug) score += 5
  if (documentStacks(doc, query).facets.length) score += 2
  return score
}

function compareContextDocs(a: Knowledge, b: Knowledge, query: ContextQuery, paths: string[]): number {
  const score = contextSpecificityScore(b, query, paths) - contextSpecificityScore(a, query, paths)
  if (score !== 0) return score
  const aPath = matchingPathPatterns(a, paths)
  const bPath = matchingPathPatterns(b, paths)
  const pathScore = Number(bPath.length > 0) - Number(aPath.length > 0)
  if (pathScore !== 0) return pathScore
  const projectScore = Number(Boolean(b.scope.projectSlug)) - Number(Boolean(a.scope.projectSlug))
  if (projectScore !== 0) return projectScore
  return b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug)
}

function normalizedMaxTokens(value: number | undefined): number {
  const requested = Number(value ?? DEFAULT_CONTEXT_MAX_TOKENS)
  if (!Number.isFinite(requested)) return DEFAULT_CONTEXT_MAX_TOKENS
  return Math.min(Math.max(Math.floor(requested), 1), MAX_CONTEXT_MAX_TOKENS)
}

function normalizedLimit(value: number | undefined): number {
  const requested = Number(value ?? DEFAULT_CONTEXT_ENTRY_LIMIT)
  if (!Number.isFinite(requested)) return DEFAULT_CONTEXT_ENTRY_LIMIT
  return Math.min(Math.max(Math.floor(requested), 1), MAX_CONTEXT_ENTRY_LIMIT)
}

/** Reference estimate used for budget decisions. It is not a model tokenizer. */
export function estimateReferenceTokens(value: string): number {
  const characters = Array.from(value).length
  return characters ? Math.max(1, Math.ceil(characters / 4)) : 0
}

export function estimateKnowledgeTokens(doc: Knowledge, delivery: ContextDelivery = 'full'): number {
  const metadata = `# ${doc.title}\nslug: ${doc.slug}\ntype: ${doc.type}\nsummary: ${doc.summary}`
  return estimateReferenceTokens(delivery === 'full' ? `${metadata}\n\n${doc.content}` : `${metadata}\n\n${doc.summary}`) + 24
}

function estimateKnowledgeBytes(doc: Knowledge, delivery: ContextDelivery): number {
  const metadata = `# ${doc.title}\nslug: ${doc.slug}\ntype: ${doc.type}\nsummary: ${doc.summary}`
  const reference = delivery === 'full' ? `${metadata}\n\n${doc.content}` : `${metadata}\n\n${doc.summary}`
  return Buffer.byteLength(reference, 'utf8') + 96
}

function diagnosticsFor(normalized: ReturnType<typeof normalizeQuery>): ContextDiagnostics {
  return {
    stack: [...normalized.stack.facets],
    paths: [...normalized.paths.paths],
    missingStack: false,
    unknownStack: [...normalized.stack.unknown],
    missingPath: normalized.paths.paths.length === 0,
    invalidPaths: [...normalized.paths.invalid],
    absolutePathRequiresRoot: [...normalized.paths.absoluteWithoutRoot],
    unclassified: 0,
    excludedByStack: 0,
    excludedByApplicability: 0,
    excludedByProject: 0,
    excludedByPath: 0,
    excludedByPolicy: 0,
    excludedByTask: 0,
  }
}

function diagnosticsForEvaluation(diagnostics: ContextDiagnostics, evaluation: ContextEvaluation, doc: Knowledge, query: ContextQuery, normalized: ReturnType<typeof normalizeQuery>): void {
  if (evaluation.exclusion) diagnostics[evaluation.exclusion] += 1
  const documentStack = documentStacks(doc, query)
  if (evaluation.exclusion === 'excludedByStack' && documentStack.facets.length && !normalized.stack.provided) {
    diagnostics.missingStack = true
  }
  if (evaluation.exclusion === 'excludedByStack' && documentStack.facets.length && normalized.stack.provided && !query.discovery) {
    diagnostics.missingStack = diagnostics.missingStack || normalized.stack.facets.length === 0
  }
}

interface CursorState {
  revision: string
  signature: string
  offset: number
  requiredDelivered: boolean
}

function stableQuerySignature(normalized: ReturnType<typeof normalizeQuery>): string {
  const normalizedQuery = normalized.query
  return JSON.stringify({
    projectSlug: normalizedQuery.projectSlug ?? null,
    paths: normalized.paths.paths,
    invalidPaths: normalized.paths.invalid,
    absolutePathRequiresRoot: normalized.paths.absoluteWithoutRoot,
    pathKind: normalizedQuery.pathKind ?? 'file',
    stack: normalized.stack.facets,
    unknownStack: normalized.stack.unknown,
    catalogRevision: createHash('sha256').update(JSON.stringify(Object.entries(normalizedQuery.stackAliases ?? {}).sort(([a], [b]) => a.localeCompare(b)))).digest('hex'),
    type: normalizedQuery.type ?? '',
    limit: normalizedLimit(normalizedQuery.limit),
    maxTokens: normalizedMaxTokens(normalizedQuery.maxTokens),
    responseMode: normalizedQuery.responseMode ?? 'adaptive',
    discovery: Boolean(normalizedQuery.discovery),
    legacyMode: Boolean(normalizedQuery.legacyMode),
  })
}

function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
}

function decodeCursor(value: string | undefined): CursorState | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CursorState>
    if (typeof parsed.revision !== 'string' || typeof parsed.signature !== 'string' || typeof parsed.offset !== 'number' || typeof parsed.requiredDelivered !== 'boolean') return undefined
    if (!Number.isInteger(parsed.offset) || parsed.offset < 0) return undefined
    return parsed as CursorState
  } catch {
    return undefined
  }
}

function corpusRevision(docs: Knowledge[]): string {
  const source = docs
    .map((doc) => `${doc.id}:${doc.slug}:${doc.version}:${doc.updatedAt}:${JSON.stringify(doc.scope)}:${doc.status}`)
    .sort()
    .join('|')
  let hash = 2166136261
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

/** Select and pack context with scope filtering before ranking and limits. */
export function selectContextKnowledgeResult(docs: Knowledge[], query: ContextQuery = {}): ContextRetrievalResult {
  const normalized = normalizeQuery(query)
  const contextQuery = normalized.query
  const diagnostics = diagnosticsFor(normalized)
  const maxTokens = normalizedMaxTokens(contextQuery.maxTokens)
  const responseMode = contextQuery.responseMode ?? 'adaptive'
  const limit = normalizedLimit(contextQuery.limit)
  const revision = corpusRevision(docs)
  const signature = stableQuerySignature(normalized)

  const candidates: Array<{ doc: Knowledge; evaluation: ContextEvaluation }> = []
  for (const doc of docs) {
    const evaluation = evaluateContext(doc, contextQuery, normalized)
    diagnosticsForEvaluation(diagnostics, evaluation, doc, contextQuery, normalized)
    if (!evaluation.eligible) continue
    candidates.push({ doc, evaluation })
  }

  candidates.sort((a, b) => compareContextDocs(a.doc, b.doc, contextQuery, normalized.paths.paths))
  const eligibleCount = candidates.length

  let offset = 0
  if (contextQuery.cursor) {
    const cursor = decodeCursor(contextQuery.cursor)
    if (!cursor) diagnostics.cursorError = 'invalid'
    else if (cursor.revision !== revision || cursor.signature !== signature) diagnostics.cursorError = 'stale'
    else {
      offset = Math.min(cursor.offset, candidates.length)
    }
  }

  // Response metadata and continuation notices consume output too. This reserve
  // keeps the formatted transport response within the reference estimate.
  const metadataReserve = 180
  const metadataReserveBytes = 1_024
  let usedTokens = metadataReserve
  let usedBytes = metadataReserveBytes
  const entries: ContextEntry[] = []
  const requiredFetch: string[] = []
  const addEntry = (candidate: { doc: Knowledge; evaluation: ContextEvaluation }, delivery: ContextDelivery): boolean => {
    const estimatedTokens = estimateKnowledgeTokens(candidate.doc, delivery)
    const estimatedBytes = estimateKnowledgeBytes(candidate.doc, delivery)
    if (usedTokens + estimatedTokens > maxTokens || usedBytes + estimatedBytes > MAX_CONTEXT_RESPONSE_BYTES) return false
    entries.push({
      doc: candidate.doc,
      knowledge: candidate.doc,
      delivery,
      required: candidate.evaluation.required,
      estimatedTokens,
      reason: candidate.evaluation.reason,
    })
    usedTokens += estimatedTokens
    usedBytes += estimatedBytes
    return true
  }

  let considered = offset
  let omittedByBudget = 0
  for (; considered < candidates.length; considered += 1) {
    if (entries.length >= limit) break
    const candidate = candidates[considered]!
    if (responseMode !== 'summary' && addEntry(candidate, 'full')) continue
    if (responseMode !== 'full' && addEntry(candidate, 'summary')) {
      requiredFetch.push(candidate.doc.slug)
      continue
    }
    requiredFetch.push(candidate.doc.slug)
    omittedByBudget += 1
  }
  const omittedByLimit = candidates.length - considered
  const omittedCount = omittedByBudget + omittedByLimit
  const nextCursor = omittedByLimit > 0
    ? encodeCursor({ revision, signature, offset: considered, requiredDelivered: false })
    : undefined
  const outputEntries = entries

  return {
    entries: outputEntries,
    knowledge: outputEntries.map((entry) => entry.doc),
    eligibleCount,
    returnedCount: entries.length,
    omittedCount,
    omittedByBudget,
    omittedByLimit,
    requiredFetch,
    incompleteRequiredContext: requiredFetch.length > 0 || omittedByLimit > 0,
    ...(nextCursor ? { nextCursor } : {}),
    ...(contextQuery.cursor ? { cursor: contextQuery.cursor } : {}),
    estimatedTokens: usedTokens,
    estimatedBytes: usedBytes,
    maxBytes: MAX_CONTEXT_RESPONSE_BYTES,
    maxTokens,
    tokenEstimator: CONTEXT_TOKEN_ESTIMATOR,
    responseMode,
    diagnostics,
  }
}

/** Compatibility selector returning only full document objects. */
export function selectContextKnowledge(docs: Knowledge[], query: ContextQuery = {}): Knowledge[] {
  const result = selectContextKnowledgeResult(docs, {
    ...query,
    maxTokens: MAX_CONTEXT_MAX_TOKENS,
    responseMode: 'full',
    limit: query.limit ?? MAX_CONTEXT_ENTRY_LIMIT,
  })
  return result.knowledge
}

/** Context matching is strict by default; old callers may opt into legacyMode. */
export function knowledgeMatchesContext(doc: Knowledge, query: ContextQuery): boolean {
  const normalized = normalizeQuery(query)
  return evaluateContext(doc, normalized.query, normalized).eligible
}

function searchTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[,.;:!?]+|[,.;:!?]+$/g, ''))
    .filter(Boolean)
}

function countTermMatches(value: string, terms: string[]): number {
  const tokens = new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:[-_.:/@][\p{L}\p{N}]+)*/gu) ?? [])
  return terms.reduce((score, term) => score + (tokens.has(term) ? 1 : 0), 0)
}

/** Legacy lexical search retained for API compatibility when no context is supplied. */
export function searchKnowledge(docs: Knowledge[], query: string, limit = 10): Knowledge[] {
  const terms = searchTerms(query)
  if (!terms.length) return []
  return docs
    .filter(isActiveForRetrieval)
    .map((doc) => ({
      doc,
      score: countTermMatches(`${doc.slug} ${doc.title} ${doc.summary} ${doc.type} ${doc.content}`, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.doc.updatedAt.localeCompare(a.doc.updatedAt) || a.doc.slug.localeCompare(b.doc.slug))
    .slice(0, Math.min(Math.max(Math.floor(limit), 1), MAX_CONTEXT_ENTRY_LIMIT))
    .map((item) => item.doc)
}

/** Search after contextual eligibility filtering, so top-k cannot hide valid matches. */
export function searchKnowledgeWithContext(docs: Knowledge[], queryText: string, query: ContextQuery = {}): ContextSearchResult {
  const normalized = normalizeQuery(query)
  const contextQuery = normalized.query
  const diagnostics = diagnosticsFor(normalized)
  const terms = searchTerms(queryText)
  const evaluated: Array<{ doc: Knowledge; evaluation: ContextEvaluation }> = []
  for (const doc of docs) {
    const evaluation = evaluateContext(doc, contextQuery, normalized)
    diagnosticsForEvaluation(diagnostics, evaluation, doc, contextQuery, normalized)
    if (evaluation.eligible) evaluated.push({ doc, evaluation })
  }
  if (!terms.length) {
    evaluated.sort((a, b) => compareContextDocs(a.doc, b.doc, contextQuery, normalized.paths.paths))
    const limit = normalizedLimit(contextQuery.limit)
    return {
      knowledge: evaluated.slice(0, limit).map((item) => item.doc),
      eligibleCount: evaluated.length,
      matchedCount: evaluated.length,
      omittedCount: Math.max(0, evaluated.length - limit),
      diagnostics,
    }
  }
  const matches = evaluated
    .map(({ doc }) => ({
      doc,
      score: countTermMatches(`${doc.slug} ${doc.title} ${doc.summary} ${doc.type}`, terms) * 4
        + countTermMatches(doc.content, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || compareContextDocs(a.doc, b.doc, contextQuery, normalized.paths.paths))
  const limit = normalizedLimit(contextQuery.limit)
  return {
    knowledge: matches.slice(0, limit).map((item) => item.doc),
    eligibleCount: evaluated.length,
    matchedCount: matches.length,
    omittedCount: Math.max(0, matches.length - limit),
    diagnostics,
  }
}
