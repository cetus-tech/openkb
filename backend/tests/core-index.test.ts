import { describe, expect, it } from 'vitest'
import { knowledgeMatchesContext, pathMatchesPattern, searchKnowledge, selectContextKnowledge, type Knowledge } from '../src/core/index.js'

const baseDoc: Knowledge = {
  id: 1,
  slug: 'testing',
  title: 'Testing Workflow',
  summary: 'How to test',
  type: 'workflow',
  status: 'active',
  content: 'Run tests.',
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  scope: { projectSlug: 'openkb' },
}

describe('pathMatchesPattern', () => {
  it('matches simple glob patterns', () => {
    expect(pathMatchesPattern('src/foo.ts', 'src/*.ts')).toBe(true)
    expect(pathMatchesPattern('src/nested/foo.ts', 'src/*.ts')).toBe(false)
    expect(pathMatchesPattern('src/foo.ts', 'src/**/*.ts')).toBe(true)
    expect(pathMatchesPattern('src/nested/foo.ts', 'src/**/*.ts')).toBe(true)
    expect(pathMatchesPattern('backend/src/mcp/server.ts', 'backend/**')).toBe(true)
    expect(pathMatchesPattern('backend/src/mcp/server.ts', 'backend/**')).toBe(true)
    expect(pathMatchesPattern('src/foo.ts', 'src/foo.?s')).toBe(true)
  })
})

describe('knowledgeMatchesContext', () => {
  it('matches active docs in the same project', () => {
    expect(knowledgeMatchesContext(baseDoc, { projectSlug: 'openkb' })).toBe(true)
  })

  it('excludes inactive docs from retrieval', () => {
    const inactive = { ...baseDoc, status: 'inactive' as const }
    expect(knowledgeMatchesContext(inactive, { projectSlug: 'openkb' })).toBe(false)
  })

  it('matches project-scoped docs without path filters', () => {
    const universal = { ...baseDoc, id: 2, scope: { projectSlug: 'openkb' } }

    expect(knowledgeMatchesContext(universal, { projectSlug: 'openkb' })).toBe(true)
  })

})

describe('selectContextKnowledge', () => {
  it('prioritizes path-scoped docs over generic docs', () => {
    const generic = { ...baseDoc, id: 3, scope: { projectSlug: 'openkb' } }
    const scoped = { ...baseDoc, id: 4, scope: { projectSlug: 'openkb', pathPatterns: ['services/api/**/*.ts'] } }
    expect(selectContextKnowledge([generic, scoped], { projectSlug: 'openkb', path: 'services/api/src/server.ts' })[0]?.id).toBe(4)
  })

  it('prefers more specific path matches over broad path matches', () => {
    const broad = {
      ...baseDoc,
      id: 5,
      updatedAt: '2026-01-03T00:00:00.000Z',
      scope: { projectSlug: 'openkb', pathPatterns: ['src/**/*.ts'] },
    }
    const specific = {
      ...baseDoc,
      id: 6,
      updatedAt: '2026-01-02T00:00:00.000Z',
      scope: { projectSlug: 'openkb', pathPatterns: ['src/api/**/*.ts'] },
    }

    const results = selectContextKnowledge([broad, specific], {
      projectSlug: 'openkb',
      path: 'src/api/server.ts',
    })

    expect(results[0]?.id).toBe(6)
  })

})

describe('searchKnowledge', () => {
  it('returns active knowledge only', () => {
    const inactive = { ...baseDoc, id: 2 as never, status: 'inactive' as const, content: 'Inactive testing note.' }

    expect(searchKnowledge([baseDoc, inactive], 'testing').map((doc) => doc.id)).toEqual([baseDoc.id])
  })
})
