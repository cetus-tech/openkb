import type { Knowledge } from '@/utils/api'

/** Shared knowledge create/edit form shape (list modal + detail workspace). */
export interface KnowledgeFormModel {
  slug: string
  title: string
  summary: string
  type: string
  status: string
  projectSlug: string
  pathPatterns: string
  content: string
  changeSummary: string
}

function csv(value: string): string[] | undefined {
  const values = value.split(',').map((item) => item.trim()).filter(Boolean)
  return values.length ? values : undefined
}

export function emptyKnowledgeForm(): KnowledgeFormModel {
  return {
    slug: '',
    title: '',
    summary: '',
    type: 'context',
    status: 'active',
    projectSlug: '',
    pathPatterns: '',
    content: '',
    changeSummary: '',
  }
}

export function formFromKnowledge(doc: Knowledge, content: string): KnowledgeFormModel {
  return {
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary,
    type: doc.type,
    status: doc.status,
    projectSlug: doc.scope.projectSlug ?? '',
    pathPatterns: doc.scope.pathPatterns?.join(', ') ?? '',
    content,
    changeSummary: '',
  }
}

/** Build POST /v1/knowledge body from the editor form. */
export function knowledgePayloadFromForm(
  form: KnowledgeFormModel,
  options?: { includeChangeSummary?: boolean },
) {
  const scope = {
    ...(form.projectSlug.trim() ? { projectSlug: form.projectSlug.trim() } : {}),
    ...(csv(form.pathPatterns) ? { pathPatterns: csv(form.pathPatterns) } : {}),
  }
  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    summary: form.summary.trim(),
    type: form.type,
    status: form.status,
    content: form.content,
    scope,
    ...(options?.includeChangeSummary && form.changeSummary.trim()
      ? { changeSummary: form.changeSummary.trim() }
      : {}),
  }
}

export function validateKnowledgeForm(form: KnowledgeFormModel): string | null {
  if (!form.slug.trim() || !form.title.trim() || !form.summary.trim() || !form.content.trim()) {
    return 'Slug, title, summary, and content are required'
  }
  return null
}
