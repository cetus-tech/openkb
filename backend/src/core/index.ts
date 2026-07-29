export const OPENKB_VERSION = '0.1.0'

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

export interface KnowledgeScope {
  projectSlug?: string
  pathPatterns?: string[]
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
}

export interface ContextQuery {
  projectSlug?: string
  path?: string
  limit?: number
}

/** Only active knowledge is retrieved by MCP search/context. */
export function isActiveForRetrieval(doc: Knowledge): boolean {
  return doc.status === 'active'
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '**') return true

  let regex = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
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

  return new RegExp(`^${regex}$`).test(path)
}

export function knowledgeMatchesContext(doc: Knowledge, query: ContextQuery): boolean {
  if (!isActiveForRetrieval(doc)) return false
  if (query.projectSlug && doc.scope.projectSlug && doc.scope.projectSlug !== query.projectSlug) return false
  if (query.path && doc.scope.pathPatterns?.length) {
    if (!doc.scope.pathPatterns.some((pattern) => pathMatchesPattern(query.path!, pattern))) return false
  }
  return true
}

function matchingPathPatterns(doc: Knowledge, path?: string): string[] {
  if (!path || !doc.scope.pathPatterns?.length) return []
  return doc.scope.pathPatterns.filter((pattern) => pathMatchesPattern(path, pattern))
}

function pathSpecificityScore(pattern: string): number {
  const segments = pattern.split('/').filter(Boolean)
  return segments.reduce((score, segment) => {
    if (segment === '**') return score + 1
    if (segment.includes('*') || segment.includes('?')) return score + 2
    return score + 4
  }, 0)
}

function contextSpecificityScore(doc: Knowledge, query: ContextQuery): number {
  let score = 0

  const matchedPatterns = matchingPathPatterns(doc, query.path)
  if (matchedPatterns.length > 0) {
    score += 40
    score += Math.max(...matchedPatterns.map(pathSpecificityScore))
  }

  if (doc.scope.projectSlug) score += 5
  return score
}

export function selectContextKnowledge(docs: Knowledge[], query: ContextQuery): Knowledge[] {
  const limit = query.limit ?? 10
  return docs
    .filter((doc) => knowledgeMatchesContext(doc, query))
    .sort((a, b) => {
      const specificity = contextSpecificityScore(b, query) - contextSpecificityScore(a, query)
      if (specificity !== 0) return specificity
      const pathScoped = Number(Boolean(b.scope.pathPatterns?.length)) - Number(Boolean(a.scope.pathPatterns?.length))
      if (pathScoped !== 0) return pathScoped
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, limit)
}

export function searchKnowledge(docs: Knowledge[], query: string, limit = 10): Knowledge[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return docs
    .map((doc) => {
      const haystack = `${doc.slug}\n${doc.title}\n${doc.summary}\n${doc.type}\n${doc.content}`.toLowerCase()
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
      return { doc, score }
    })
    .filter((item) => item.score > 0 && isActiveForRetrieval(item.doc))
    .sort((a, b) => b.score - a.score || b.doc.updatedAt.localeCompare(a.doc.updatedAt))
    .slice(0, limit)
    .map((item) => item.doc)
}
