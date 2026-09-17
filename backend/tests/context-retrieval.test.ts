import { describe, expect, it } from 'vitest'
import {
  normalizeContextPaths,
  normalizeKnowledgeScope,
  normalizeStackFacets,
  searchKnowledgeWithContext,
  selectContextKnowledgeResult,
  type Knowledge,
} from '../src/core/index.js'

function knowledge(overrides: Partial<Knowledge> = {}): Knowledge {
  return {
    id: 1,
    slug: 'knowledge-item',
    title: 'Knowledge item',
    summary: 'Useful project guidance',
    type: 'context',
    status: 'active',
    content: 'Use the project guidance.',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    scope: {},
    ...overrides,
  }
}

describe('context retrieval eligibility and delivery', () => {
  it('normalizes canonical stack metadata and keeps empty stacks global', () => {
    expect(normalizeKnowledgeScope({ stacks: [] })).toEqual({})
    expect(normalizeKnowledgeScope({ stacks: ['framework:vue:3'] })).toEqual({
      stacks: ['framework:vue:3'],
    })
  })

  it('includes all global and matching technology knowledge regardless of task or old policy', () => {
    const docs = [
      knowledge({ slug: 'global-auto', scope: { contextPolicy: 'auto' } }),
      knowledge({ id: 2, slug: 'global-manual', scope: { contextPolicy: 'manual' } }),
      knowledge({ id: 3, slug: 'vue', scope: { stacks: ['framework:vue:3'], contextPolicy: 'manual' } }),
      knowledge({ id: 4, slug: 'ci4', scope: { stacks: ['framework:codeigniter:4'] } }),
    ]
    const baseline = selectContextKnowledgeResult(docs, { stack: ['framework:vue:3'] })
    expect(baseline.knowledge.map(item => item.slug).sort()).toEqual(['global-auto', 'global-manual', 'vue'])
    for (const task of ['unrelated words', 'migrate CodeIgniter controller', '']) {
      const result = selectContextKnowledgeResult(docs, { stack: ['framework:vue:3'], task, component: 'backend' })
      expect(result.knowledge).toEqual(baseline.knowledge)
      expect(result.diagnostics.excludedByTask).toBe(0)
    }
    expect(selectContextKnowledgeResult(docs).knowledge.map(item => item.slug).sort()).toEqual(['global-auto', 'global-manual'])
  })

  it('requires every technology, even for required rules and tasks mentioning CI4', () => {
    const ci4 = knowledge({ slug: 'ci4', scope: {
      stacks: ['language:php', 'framework:codeigniter:4'], contextPolicy: 'required',
    } })
    const global = knowledge({ id: 2, slug: 'writing-rule', scope: {
      contextPolicy: 'required',
    } })
    for (const stack of [undefined, [], ['language:php'], ['language:php', 'framework:laravel:12'], ['framework:codeigniter:4'], ['language:typescript', 'framework:vue:3']]) {
      const result = selectContextKnowledgeResult([ci4, global], { stack, task: 'Implement CI4 controller' })
      expect(result.knowledge.map(item => item.slug)).toEqual(['writing-rule'])
    }
    expect(selectContextKnowledgeResult([ci4, global], {
      stack: ['language:php', 'framework:codeigniter:4'], task: 'Unrelated task',
    }).knowledge.map(item => item.slug)).toContain('ci4')
    expect(searchKnowledgeWithContext([ci4], '', { stack: ['language:php'] }).knowledge).toEqual([])
  })

  it('does not ignore an unknown requirement when another requirement matches', () => {
    const doc = knowledge({ scope: { stacks: ['language:php', 'unrecognized'] } })
    expect(selectContextKnowledgeResult([doc], { stack: ['language:php'] }).knowledge).toEqual([])
  })

  it('normalizes versioned stack aliases without guessing unversioned frameworks', () => {
    expect(normalizeStackFacets(['Vue 3', 'Vue:3', 'vue3', 'vue@3', 'typescript', 'Vue'], { 'vue 3': 'framework:vue:3', 'vue:3': 'framework:vue:3', vue3: 'framework:vue:3', 'vue@3': 'framework:vue:3', typescript: 'language:typescript' })).toEqual({
      facets: ['framework:vue:3', 'language:typescript'],
      unknown: ['Vue'],
      provided: true,
    })
  })

  it('treats empty scope as global knowledge', () => {
    const universal = knowledge({ id: 1, slug: 'universal', scope: { contextPolicy: 'required' } })
    const vue = knowledge({
      id: 2,
      slug: 'vue-guide',
      title: 'Vue 3 component guide',
      content: 'Use Vue component guidance.',
      scope: { stacks: ['framework:vue:3'] },
    })
    const ci4 = knowledge({ id: 3, slug: 'ci4-guide', scope: { stacks: ['framework:codeigniter:4'] } })
    const legacy = knowledge({ id: 4, slug: 'legacy-global', scope: {} })

    const result = selectContextKnowledgeResult([ci4, legacy, vue, universal], {
      projectSlug: 'openkb',
      stack: ['framework:vue:3', 'language:typescript'],
      task: 'update the Vue component',
    })

    expect(result.knowledge.map((item) => item.slug)).toContain('universal')
    expect(result.knowledge.map((item) => item.slug)).toContain('vue-guide')
    expect(result.knowledge.map((item) => item.slug)).not.toContain('ci4-guide')
    expect(result.knowledge.map((item) => item.slug)).toContain('legacy-global')
    expect(result.diagnostics.excludedByStack).toBe(1)
    expect(result.diagnostics.unclassified).toBe(0)
    expect(result.diagnostics.stack).toEqual(['framework:vue:3', 'language:typescript'])
  })

  it('keeps project and path constraints conjunctive', () => {
    const matching = knowledge({
      id: 1,
      slug: 'matching-path',
      scope: { projectSlug: 'openkb', pathPatterns: ['backend/**/*.ts'] },
    })
    const otherProject = knowledge({
      id: 2,
      slug: 'other-project',
      scope: { projectSlug: 'other', pathPatterns: ['backend/**/*.ts'] },
    })
    const wrongPath = knowledge({
      id: 3,
      slug: 'wrong-path',
      scope: { projectSlug: 'openkb', pathPatterns: ['frontend/**/*.ts'] },
    })

    const result = selectContextKnowledgeResult([otherProject, wrongPath, matching], {
      projectSlug: 'openkb',
      path: 'backend/src/server.ts',
      stack: ['language:typescript'],
    })

    expect(result.knowledge.map((item) => item.slug)).toEqual(['matching-path'])
    expect(result.diagnostics.excludedByProject).toBe(1)
    expect(result.diagnostics.excludedByPath).toBe(1)
  })

  it('requires an explicit root for absolute paths and rejects paths outside it', () => {
    expect(normalizeContextPaths({ path: '/data/openkb/backend/src/api/app.ts' })).toEqual({
      paths: [],
      invalid: [],
      absoluteWithoutRoot: ['/data/openkb/backend/src/api/app.ts'],
    })
    expect(normalizeContextPaths({
      path: '/data/openkb/backend/src/api/app.ts',
      root: '/data/openkb',
    }).paths).toEqual(['backend/src/api/app.ts'])
    expect(normalizeContextPaths({
      path: '/data/other/backend/src/api/app.ts',
      root: '/data/openkb',
    }).invalid).toEqual(['/data/other/backend/src/api/app.ts'])
  })

  it('returns more than eight short relevant items when the budget allows', () => {
    const docs = Array.from({ length: 12 }, (_, index) => knowledge({
      id: index + 1,
      slug: `short-${index + 1}`,
      title: `Short relevant item ${index + 1}`,
      scope: {},
    }))

    const result = selectContextKnowledgeResult(docs, {
      stack: ['language:typescript'],
      maxTokens: 4000,
    })

    expect(result.returnedCount).toBe(12)
    expect(result.omittedCount).toBe(0)
  })

  it('requires fetching all matching knowledge omitted or summarized by the budget', () => {
    const required = knowledge({
      id: 1,
      slug: 'required-rule',
      scope: { contextPolicy: 'required' },
      content: 'A '.repeat(1_000),
    })
    const optional = knowledge({
      id: 2,
      slug: 'large-optional',
      scope: {},
      content: 'B '.repeat(1_000),
    })

    const requiredResult = selectContextKnowledgeResult([required], {
      maxTokens: 200,
      stack: ['language:typescript'],
    })
    expect(requiredResult.incompleteRequiredContext).toBe(true)
    expect(requiredResult.requiredFetch).toEqual(['required-rule'])

    const summaryResult = selectContextKnowledgeResult([optional], {
      maxTokens: 400,
      stack: ['language:typescript'],
      responseMode: 'adaptive',
    })
    expect(summaryResult.entries[0]?.delivery).toBe('summary')
    expect(summaryResult.entries[0]?.doc.slug).toBe('large-optional')
    expect(summaryResult.requiredFetch).toEqual(['large-optional'])
    expect(summaryResult.incompleteRequiredContext).toBe(true)
  })

  it('binds continuation to the filtered corpus and query', () => {
    const docs = [1, 2, 3].map((id) => knowledge({ id, slug: `cursor-${id}` }))
    const first = selectContextKnowledgeResult(docs, {
      stack: ['language:typescript'],
      limit: 1,
    })
    expect(first.nextCursor).toBeTruthy()

    const second = selectContextKnowledgeResult(docs, {
      stack: ['language:typescript'],
      limit: 1,
      cursor: first.nextCursor,
    })
    expect(second.knowledge.map((item) => item.slug)).not.toEqual(first.knowledge.map((item) => item.slug))

    const stale = selectContextKnowledgeResult(docs, {
      stack: ['language:go'],
      limit: 1,
      cursor: first.nextCursor,
    })
    expect(stale.diagnostics.cursorError).toBe('stale')
  })

  it('shares eligibility filtering with contextual search', () => {
    const vue = knowledge({
      id: 1,
      slug: 'shared-vue-guidance',
      title: 'Shared framework guidance',
      content: 'Framework migration guidance.',
      scope: { stacks: ['framework:vue:3'] },
    })
    const ci4 = knowledge({
      id: 2,
      slug: 'shared-ci4-guidance',
      title: 'Shared framework guidance',
      content: 'Framework migration guidance.',
      scope: { stacks: ['framework:codeigniter:4'] },
    })

    const result = searchKnowledgeWithContext([ci4, vue], 'framework migration', {
      stack: ['framework:vue:3'],
    })
    expect(result.knowledge.map((item) => item.slug)).toEqual(['shared-vue-guidance'])
    expect(result.eligibleCount).toBe(1)
  })
})
