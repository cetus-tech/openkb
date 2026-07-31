import { createHash } from 'node:crypto'
import type { Knex } from 'knex'
import {
  knowledgeTypes,
  type Knowledge,
  type KnowledgeStatus,
  type KnowledgeType,
  type KnowledgeScope,
} from '../core/index.js'

/* ------------------------------------------------------------------ */
/*  Input types                                                        */
/* ------------------------------------------------------------------ */

export interface UpsertKnowledgeInput {
  slug: string
  title: string
  summary: string
  type: KnowledgeType
  status?: KnowledgeStatus
  content: string
  scope?: Partial<KnowledgeScope>
  /** Optional note for this version. Falls back to summary when omitted. */
  changeSummary?: string
  createdBy?: string
}

export interface ProposeKnowledgeInput {
  slug?: string
  title: string
  summary: string
  type?: KnowledgeType
  content: string
  scope?: Partial<KnowledgeScope>
  createdBy?: string
}

export interface KnowledgeListOptions {
  page?: number
  pageSize?: number
  query?: string
  type?: string
  status?: string
}

export interface VersionListOptions {
  page?: number
  pageSize?: number
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

export interface KnowledgePage {
  knowledge: Knowledge[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface KnowledgeVersionPage {
  knowledge: Knowledge
  versions: KnowledgeVersion[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface RegisterAgentInput {
  name: string
  permissionLevel?: AgentPermission
  label?: string
  /** API/MCP token id last used by this agent (from bearer auth). */
  tokenId?: number
}

export type AgentPermission = 'read' | 'propose' | 'write' | 'admin'

/* ------------------------------------------------------------------ */
/*  Output types                                                       */
/* ------------------------------------------------------------------ */

export interface ChangeProposal {
  id: number
  knowledgeId?: number
  slug: string
  type: KnowledgeType
  scope: KnowledgeScope
  status: 'open' | 'approved' | 'rejected'
  title: string
  proposedContentMarkdown: string
  summary: string
  createdBy?: string
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface AgentRow {
  id: number
  name: string
  permission_level: AgentPermission
  label?: string | null
  last_seen_at?: string | null
  last_token_id?: number | null
  created_at: string
  updated_at: string
}

export interface AgentInfo {
  id: number
  name: string
  permissionLevel: AgentPermission
  label?: string
  lastSeenAt?: string
  /** Last MCP/API token used by this agent when connecting. */
  lastTokenId?: number
  lastTokenPrefix?: string
  lastTokenName?: string
  lastUserName?: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  Internal row types (DB shape)                                      */
/* ------------------------------------------------------------------ */

interface KnowledgeRow {
  id: number
  slug: string
  title: string
  type: KnowledgeType
  status: KnowledgeStatus
  summary: string
  scope_json: string | KnowledgeScope
  current_version_id?: number | null
  created_at: string
  updated_at: string
}

interface VersionRow {
  id: number
  knowledge_id: number
  version_number: number
  content_markdown: string
  content_hash: string
  change_summary?: string | null
  created_by?: string | null
  created_at: string
}

interface ProposalRow {
  id: number
  knowledge_id?: number | null
  proposed_slug: string
  proposed_type: KnowledgeType
  scope_json: string | KnowledgeScope
  status: 'open' | 'approved' | 'rejected'
  title: string
  proposed_content_markdown: string
  summary: string
  created_by?: string | null
  created_at: string
  reviewed_by?: string | null
  reviewed_at?: string | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function now(): string {
  return new Date().toISOString()
}

async function insertId(db: Knex, table: string, row: Record<string, unknown>): Promise<number> {
  const result = await db(table).insert(row)
  return Number(Array.isArray(result) ? result[0] : result)
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function parseScope(value: string | KnowledgeScope): KnowledgeScope {
  const raw = (typeof value === 'string' ? JSON.parse(value) : value) as KnowledgeScope & { toolTargets?: unknown }
  // Drop legacy toolTargets if present in stored JSON.
  const { toolTargets: _removed, ...scope } = raw
  return scope
}

function stringifyScope(value: KnowledgeScope): string {
  return JSON.stringify(value)
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'knowledge'
}

async function availableSlug(db: Knex, requested: string): Promise<string> {
  const base = slugify(requested)
  let candidate = base
  let suffix = 2
  while (await db<KnowledgeRow>('knowledge').where({ slug: candidate }).first()) {
    candidate = `${base}-${suffix++}`
  }
  return candidate
}

function assertKnowledgeType(type: KnowledgeType): void {
  if (!knowledgeTypes.includes(type)) throw new Error(`Unsupported knowledge type: ${type}`)
}

async function versionForDocument(db: Knex, knowledgeId: number, versionId?: number | null): Promise<VersionRow | undefined> {
  if (versionId != null) {
    const current = await db<VersionRow>('knowledge_versions').where({ id: versionId, knowledge_id: knowledgeId }).first()
    if (current) return current
    // Fall back if current_version_id is stale/orphaned after deletes.
  }
  return db<VersionRow>('knowledge_versions').where({ knowledge_id: knowledgeId }).orderBy('version_number', 'desc').first()
}

async function rowToKnowledge(db: Knex, row: KnowledgeRow): Promise<Knowledge> {
  const version = await versionForDocument(db, row.id, row.current_version_id)
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    type: row.type,
    status: row.status,
    content: version?.content_markdown ?? '',
    scope: parseScope(row.scope_json),
    version: version?.version_number ?? 0,
    createdBy: version?.created_by ?? undefined,
    updatedAt: row.updated_at,
  }
}

function versionFromRow(row: VersionRow, currentVersionId?: number | null): KnowledgeVersion {
  return {
    id: row.id,
    knowledgeId: row.knowledge_id,
    version: row.version_number,
    content: row.content_markdown,
    contentHash: row.content_hash,
    changeSummary: row.change_summary ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    current: row.id === currentVersionId,
  }
}

function pageValues(total: number, options: { page?: number; pageSize?: number }): { page: number; pageSize: number; totalPages: number } {
  const requestedPageSize = Number(options.pageSize ?? 20)
  const requestedPage = Number(options.page ?? 1)
  const pageSize = Math.min(Math.max(Number.isFinite(requestedPageSize) ? Math.floor(requestedPageSize) : 20, 1), 100)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1, 1), totalPages)
  return { page, pageSize, totalPages }
}

async function upsertKnowledgeInTransaction(trx: Knex, input: UpsertKnowledgeInput): Promise<void> {
  const documentType = input.type ?? 'context'
  assertKnowledgeType(documentType)
  const timestamp = now()
  const existing = await trx<KnowledgeRow>('knowledge').where({ slug: input.slug }).first()
  const scope: KnowledgeScope = input.scope === undefined
    ? (existing ? parseScope(existing.scope_json) : {})
    : { ...(input.scope as KnowledgeScope) }
  const latest = existing ? await versionForDocument(trx, existing.id) : undefined
  const versionNumber = (latest?.version_number ?? 0) + 1

  let knowledgeId: number
  if (!existing) {
    knowledgeId = await insertId(trx, 'knowledge', {
      slug: input.slug,
      title: input.title,
      type: documentType,
      status: input.status ?? 'active',
      summary: input.summary,
      scope_json: stringifyScope(scope),
      current_version_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
  } else {
    knowledgeId = existing.id
    await trx<KnowledgeRow>('knowledge').where({ id: existing.id }).update({
      title: input.title,
      type: documentType,
      status: input.status ?? existing.status,
      summary: input.summary,
      scope_json: stringifyScope(scope),
      updated_at: timestamp,
    })
  }

  const versionId = await insertId(trx, 'knowledge_versions', {
    knowledge_id: knowledgeId,
    version_number: versionNumber,
    content_markdown: input.content,
    content_hash: hash(input.content),
    change_summary: input.changeSummary?.trim() || input.summary,
    created_by: input.createdBy ?? null,
    created_at: timestamp,
  })

  await trx<KnowledgeRow>('knowledge').where({ id: knowledgeId }).update({
    current_version_id: versionId,
    updated_at: timestamp,
  })
}

/* ------------------------------------------------------------------ */
/*  Knowledge                                                          */
/* ------------------------------------------------------------------ */

export async function listKnowledge(db: Knex): Promise<Knowledge[]> {
  const rows = await db<KnowledgeRow>('knowledge').orderBy('updated_at', 'desc').orderBy('slug', 'asc')
  return Promise.all(rows.map((row) => rowToKnowledge(db, row)))
}

export async function listKnowledgePage(db: Knex, options: KnowledgeListOptions = {}): Promise<KnowledgePage> {
  const normalizedQuery = options.query?.trim().toLowerCase()
  const allKnowledge = await listKnowledge(db)
  const filtered = allKnowledge.filter((k) => {
    if (options.type && k.type !== options.type) return false
    if (options.status && k.status !== options.status) return false
    if (!normalizedQuery) return true
    return [k.title, k.summary, k.slug, k.content]
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  })
  const { page, pageSize, totalPages } = pageValues(filtered.length, options)
  const start = (page - 1) * pageSize
  return {
    knowledge: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages,
  }
}

export async function getKnowledge(db: Knex, slugOrId: string | number): Promise<Knowledge | undefined> {
  const key = String(slugOrId)
  const query = db<KnowledgeRow>('knowledge')
  const row = /^\d+$/.test(key)
    ? await query.where({ id: Number(key) }).orWhere({ slug: key }).first()
    : await query.where({ slug: key }).first()
  return row ? rowToKnowledge(db, row) : undefined
}

export async function listDocumentVersions(db: Knex, slugOrId: string | number, options: VersionListOptions = {}): Promise<KnowledgeVersionPage | undefined> {
  const key = String(slugOrId)
  const documentRow = /^\d+$/.test(key)
    ? await db<KnowledgeRow>('knowledge').where({ id: Number(key) }).orWhere({ slug: key }).first()
    : await db<KnowledgeRow>('knowledge').where({ slug: key }).first()
  if (!documentRow) return undefined

  const countRow = await db<VersionRow>('knowledge_versions')
    .where({ knowledge_id: documentRow.id })
    .count('id as count')
    .first() as { count?: number | string } | undefined
  const total = Number(countRow?.count ?? 0)
  const { page, pageSize, totalPages } = pageValues(total, options)
  const rows = await db<VersionRow>('knowledge_versions')
    .where({ knowledge_id: documentRow.id })
    .orderBy('version_number', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    knowledge: await rowToKnowledge(db, documentRow),
    versions: rows.map((row) => versionFromRow(row, documentRow.current_version_id)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export async function upsertKnowledge(db: Knex, input: UpsertKnowledgeInput): Promise<Knowledge> {
  await db.transaction((trx) => upsertKnowledgeInTransaction(trx, input))
  return (await getKnowledge(db, input.slug))!
}

export async function deleteKnowledge(db: Knex, slug: string): Promise<boolean> {
  const deleted = await db<KnowledgeRow>('knowledge')
    .where({ slug })
    .delete()
  return deleted > 0
}

export type DeleteKnowledgeVersionResult =
  | { ok: true; knowledge: Knowledge }
  | { ok: false; reason: 'not_found' | 'last_version' }

/**
 * Delete one immutable snapshot. Refuses when it is the only version left
 * (delete the knowledge item instead). If the deleted row was current,
 * current_version_id moves to the newest remaining version.
 */
export async function deleteKnowledgeVersion(
  db: Knex,
  slug: string,
  versionId: string | number,
): Promise<DeleteKnowledgeVersionResult> {
  return db.transaction(async (trx) => {
    const documentRow = await trx<KnowledgeRow>('knowledge').where({ slug }).first()
    if (!documentRow) return { ok: false, reason: 'not_found' }

    const versionRow = await trx<VersionRow>('knowledge_versions')
      .where({ id: Number(versionId), knowledge_id: documentRow.id })
      .first()
    if (!versionRow) return { ok: false, reason: 'not_found' }

    const countRow = await trx<VersionRow>('knowledge_versions')
      .where({ knowledge_id: documentRow.id })
      .count('id as count')
      .first() as { count?: number | string } | undefined
    const total = Number(countRow?.count ?? 0)
    if (total <= 1) return { ok: false, reason: 'last_version' }

    const deletedVersionId = Number(versionId)
    await trx<VersionRow>('knowledge_versions').where({ id: deletedVersionId }).delete()

    const updates: Partial<KnowledgeRow> = { updated_at: now() }
    // Coerce IDs: route params are strings, DB ids are integers ("8" === 8 is false).
    const currentId = documentRow.current_version_id == null ? null : Number(documentRow.current_version_id)
    const currentStillThere =
      currentId != null && currentId !== deletedVersionId
        ? await trx<VersionRow>('knowledge_versions').where({ id: currentId, knowledge_id: documentRow.id }).first()
        : undefined
    if (currentId === deletedVersionId || !currentStillThere) {
      const next = await trx<VersionRow>('knowledge_versions')
        .where({ knowledge_id: documentRow.id })
        .orderBy('version_number', 'desc')
        .first()
      updates.current_version_id = next?.id ?? null
    }
    await trx<KnowledgeRow>('knowledge').where({ id: documentRow.id }).update(updates)

    const knowledge = await getKnowledge(trx, slug)
    if (!knowledge) return { ok: false, reason: 'not_found' }
    return { ok: true, knowledge }
  })
}

/* ------------------------------------------------------------------ */
/*  Proposals                                                          */
/* ------------------------------------------------------------------ */

export async function createProposal(db: Knex, input: ProposeKnowledgeInput): Promise<ChangeProposal> {
  const existing = input.slug ? await db<KnowledgeRow>('knowledge').where({ slug: input.slug }).first() : undefined
  const proposalSlug = existing?.slug ?? (input.slug ? slugify(input.slug) : await availableSlug(db, input.title))
  const proposalType = input.type ?? 'context'
  assertKnowledgeType(proposalType)
  const openProposal = await db<ProposalRow>('change_proposals')
    .where({ proposed_slug: proposalSlug, status: 'open' })
    .first()
  if (openProposal) throw new Error(`An open proposal already exists for knowledge "${proposalSlug}".`)
  const scope: KnowledgeScope = input.scope === undefined
    ? (existing ? parseScope(existing.scope_json) : {})
    : { ...(input.scope as KnowledgeScope) }
  const timestamp = now()
  const proposalId = await insertId(db, 'change_proposals', {
    knowledge_id: existing?.id ?? null,
    proposed_slug: proposalSlug,
    proposed_type: proposalType,
    scope_json: stringifyScope(scope),
    status: 'open',
    title: input.title,
    proposed_content_markdown: input.content,
    summary: input.summary,
    created_by: input.createdBy ?? null,
    created_at: timestamp,
    reviewed_by: null,
    reviewed_at: null,
  })
  const created = await db<ProposalRow>('change_proposals').where({ id: proposalId }).first()
  return proposalFromRow(created!)
}

export async function listProposals(db: Knex): Promise<ChangeProposal[]> {
  const rows = await db<ProposalRow>('change_proposals').orderBy('created_at', 'desc')
  return rows.map(proposalFromRow)
}

export interface ProposalListOptions {
  page?: number
  pageSize?: number
  status?: 'open' | 'approved' | 'rejected' | 'all' | string
}

export interface ProposalPage {
  proposals: ChangeProposal[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: { all: number; open: number; approved: number; rejected: number }
}

export async function listProposalsPage(db: Knex, options: ProposalListOptions = {}): Promise<ProposalPage> {
  const status = String(options.status ?? 'all').trim().toLowerCase()
  const base = db<ProposalRow>('change_proposals')
  const filtered =
    status && status !== 'all' && (status === 'open' || status === 'approved' || status === 'rejected')
      ? base.clone().where('status', status)
      : base.clone()

  const countRow = await filtered.clone().count('id as count').first() as { count?: number | string } | undefined
  const total = Number(countRow?.count ?? 0)
  const { page, pageSize, totalPages } = pageValues(total, options)

  const rows = await filtered
    .clone()
    .orderBy('created_at', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [allRow, openRow, approvedRow, rejectedRow] = await Promise.all([
    db<ProposalRow>('change_proposals').count('id as count').first() as Promise<{ count?: number | string } | undefined>,
    db<ProposalRow>('change_proposals').where({ status: 'open' }).count('id as count').first() as Promise<{ count?: number | string } | undefined>,
    db<ProposalRow>('change_proposals').where({ status: 'approved' }).count('id as count').first() as Promise<{ count?: number | string } | undefined>,
    db<ProposalRow>('change_proposals').where({ status: 'rejected' }).count('id as count').first() as Promise<{ count?: number | string } | undefined>,
  ])

  return {
    proposals: rows.map(proposalFromRow),
    total,
    page,
    pageSize,
    totalPages,
    counts: {
      all: Number(allRow?.count ?? 0),
      open: Number(openRow?.count ?? 0),
      approved: Number(approvedRow?.count ?? 0),
      rejected: Number(rejectedRow?.count ?? 0),
    },
  }
}

function asRowId(id: string | number): number | undefined {
  const n = typeof id === 'number' ? id : Number(id)
  if (!Number.isFinite(n)) return undefined
  return n
}

export async function getProposal(db: Knex, proposalId: string | number): Promise<ChangeProposal | undefined> {
  const id = asRowId(proposalId)
  if (id == null) return undefined
  const row = await db<ProposalRow>('change_proposals').where({ id }).first()
  return row ? proposalFromRow(row) : undefined
}

export interface UpdateProposalInput {
  status?: 'open' | 'approved' | 'rejected'
  title?: string
  summary?: string
  proposedContentMarkdown?: string
  content?: string
  type?: KnowledgeType
  scope?: Partial<KnowledgeScope>
  reviewedBy?: string
}

export async function updateProposal(
  db: Knex,
  proposalId: string | number,
  input: UpdateProposalInput,
): Promise<ChangeProposal | undefined> {
  const id = asRowId(proposalId)
  if (id == null) return undefined
  const updated = await db.transaction(async (trx) => {
    const proposal = await trx<ProposalRow>('change_proposals').where({ id }).first()
    if (!proposal) return undefined

    const title = input.title?.trim() || proposal.title
    const summary = input.summary?.trim() || proposal.summary
    const content = input.proposedContentMarkdown ?? input.content ?? proposal.proposed_content_markdown
    const type = input.type || proposal.proposed_type
    const scopeJson = input.scope ? stringifyScope(input.scope) : proposal.scope_json

    if (input.status === 'open') {
      if (proposal.status === 'open') {
        throw new Error('Proposal is already open')
      }
      if (proposal.status !== 'rejected') {
        throw new Error(`Only rejected proposals can be reinstated (current status: ${proposal.status})`)
      }
      if (proposal.status === 'rejected') {
        const openConflict = await trx<ProposalRow>('change_proposals')
          .where({ proposed_slug: proposal.proposed_slug, status: 'open' })
          .whereNot({ id })
          .first()
        if (openConflict) {
          throw new Error(`An open proposal already exists for knowledge "${proposal.proposed_slug}".`)
        }
      }
      await trx<ProposalRow>('change_proposals').where({ id }).update({
        title,
        summary,
        proposed_content_markdown: content,
        proposed_type: type,
        scope_json: scopeJson,
        status: 'open',
        reviewed_by: null,
        reviewed_at: null,
      })
      return trx<ProposalRow>('change_proposals').where({ id }).first()
    }

    if (proposal.status !== 'open' && input.status && input.status !== proposal.status) {
      throw new Error(`Proposal is already ${proposal.status}`)
    }

    if (proposal.status !== 'open' && !input.status) {
      throw new Error(`Only open proposals can be edited`)
    }

    const nextStatus = input.status || proposal.status
    const timestamp = now()
    let approvedDocumentId = proposal.knowledge_id ?? null

    if (nextStatus === 'approved') {
      await upsertKnowledgeInTransaction(trx, {
        slug: proposal.proposed_slug,
        title,
        summary,
        type,
        status: 'active',
        content,
        scope: parseScope(scopeJson),
        changeSummary: summary,
        createdBy: proposal.created_by ?? undefined,
      })
      const approvedDocument = await trx<KnowledgeRow>('knowledge').where({ slug: proposal.proposed_slug }).first()
      approvedDocumentId = approvedDocument?.id ?? approvedDocumentId
    }

    const updates: Partial<ProposalRow> = {
      title,
      summary,
      proposed_content_markdown: content,
      proposed_type: type,
      scope_json: scopeJson,
    }

    if (input.status) {
      updates.status = nextStatus
      updates.reviewed_by = input.reviewedBy ?? null
      updates.reviewed_at = timestamp
      if (nextStatus === 'approved') updates.knowledge_id = approvedDocumentId
    }

    await trx<ProposalRow>('change_proposals').where({ id }).update(updates)
    return trx<ProposalRow>('change_proposals').where({ id }).first()
  })

  return updated ? proposalFromRow(updated) : undefined
}

export async function updateProposalStatus(
  db: Knex,
  proposalId: string | number,
  status: 'open' | 'approved' | 'rejected',
  reviewedBy?: string,
): Promise<ChangeProposal | undefined> {
  return updateProposal(db, proposalId, { status, reviewedBy })
}

export async function deleteProposal(
  db: Knex,
  proposalId: string | number,
): Promise<boolean> {
  const id = asRowId(proposalId)
  if (id == null) return false
  const proposal = await db<ProposalRow>('change_proposals').where({ id }).first()
  if (!proposal) return false
  if (proposal.status !== 'rejected') {
    throw new Error(`Only rejected proposals can be deleted (current status: ${proposal.status})`)
  }
  const deletedCount = await db<ProposalRow>('change_proposals').where({ id }).delete()
  return deletedCount > 0
}

function proposalFromRow(row: ProposalRow): ChangeProposal {
  return {
    id: row.id,
    knowledgeId: row.knowledge_id ?? undefined,
    slug: row.proposed_slug,
    type: row.proposed_type,
    scope: parseScope(row.scope_json),
    status: row.status,
    title: row.title,
    proposedContentMarkdown: row.proposed_content_markdown,
    summary: row.summary,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
  }
}

/* ------------------------------------------------------------------ */
/*  Agents                                                             */
/* ------------------------------------------------------------------ */

export async function registerOrUpdateAgent(db: Knex, input: RegisterAgentInput): Promise<{ agent: AgentInfo; created: boolean }> {
  const timestamp = now()

  // Agent identity is name-only (client-asserted). Knowledge attribution uses token owner.
  // last_token_id records which bearer was last used (for dashboard display).
  const existing = await db<AgentRow>('agents')
    .where({ name: input.name })
    .first()

  if (existing) {
    await db<AgentRow>('agents').where({ id: existing.id }).update({
      last_seen_at: timestamp,
      label: input.label ?? existing.label,
      ...(input.tokenId ? { last_token_id: input.tokenId } : {}),
      updated_at: timestamp,
    })
    const agent = await getAgentById(db, existing.id)
    return { agent: agent!, created: false }
  }

  const agentId = await insertId(db, 'agents', {
    name: input.name,
    permission_level: input.permissionLevel ?? 'propose',
    label: input.label ?? null,
    last_seen_at: timestamp,
    last_token_id: input.tokenId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  })
  const agent = await getAgentById(db, agentId)
  return { agent: agent!, created: true }
}

export async function lookupAgent(db: Knex, name: string): Promise<AgentInfo | undefined> {
  const row = await db<AgentRow>('agents')
    .where({ name })
    .first()
  if (!row) return undefined
  return getAgentById(db, row.id)
}

export async function listAgents(db: Knex): Promise<AgentInfo[]> {
  const rows = await db('agents as a')
    .leftJoin('api_tokens as t', 'a.last_token_id', 't.id')
    .leftJoin('users as u', 't.user_id', 'u.id')
    .select(
      'a.id',
      'a.name',
      'a.permission_level',
      'a.label',
      'a.last_seen_at',
      'a.last_token_id',
      'a.created_at',
      'a.updated_at',
      't.token_prefix as token_prefix',
      't.token_value as token_value',
      't.name as token_name',
      'u.name as user_name',
      'u.email as user_email',
    )
    .orderBy('a.last_seen_at', 'desc')
  return rows.map((row) => agentFromJoinedRow(row as AgentJoinedRow))
}

export async function updateAgentPermission(
  db: Knex,
  agentId: string | number,
  permissionLevel: AgentPermission,
): Promise<AgentInfo | undefined> {
  const timestamp = now()
  const id = asRowId(agentId)
  if (id == null) return undefined
  const updated = await db<AgentRow>('agents')
    .where({ id })
    .update({ permission_level: permissionLevel, updated_at: timestamp })
  if (!updated) return undefined
  return getAgentById(db, id)
}

export async function deleteAgent(db: Knex, agentId: string | number): Promise<boolean> {
  const id = asRowId(agentId)
  if (id == null) return false
  const deleted = await db<AgentRow>('agents').where({ id }).delete()
  return deleted > 0
}

interface AgentJoinedRow extends AgentRow {
  token_prefix?: string | null
  token_value?: string | null
  token_name?: string | null
  user_name?: string | null
  user_email?: string | null
}

async function getAgentById(db: Knex, agentId: string | number): Promise<AgentInfo | undefined> {
  const row = await db('agents as a')
    .leftJoin('api_tokens as t', 'a.last_token_id', 't.id')
    .leftJoin('users as u', 't.user_id', 'u.id')
    .select(
      'a.id',
      'a.name',
      'a.permission_level',
      'a.label',
      'a.last_seen_at',
      'a.last_token_id',
      'a.created_at',
      'a.updated_at',
      't.token_prefix as token_prefix',
      't.token_value as token_value',
      't.name as token_name',
      'u.name as user_name',
      'u.email as user_email',
    )
    .where('a.id', agentId)
    .first() as AgentJoinedRow | undefined
  return row ? agentFromJoinedRow(row) : undefined
}

function tokenShortForm(prefix?: string | null, value?: string | null): string | undefined {
  if (value) return `${value.slice(0, 8)}...${value.slice(-4)}`
  if (prefix) return prefix
  return undefined
}

function agentFromJoinedRow(row: AgentJoinedRow): AgentInfo {
  return {
    id: row.id,
    name: row.name,
    permissionLevel: row.permission_level,
    label: row.label ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastTokenId: row.last_token_id ?? undefined,
    lastTokenPrefix: tokenShortForm(row.token_prefix, row.token_value),
    lastTokenName: row.token_name ?? undefined,
    lastUserName: row.user_name || row.user_email || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface AppSettingRow {
  id?: number
  key: string
  value: string
  updated_at: string
}

export async function getAppSetting(db: Knex, key: string): Promise<string | null> {
  const row = await db<AppSettingRow>('app_settings').where({ key }).first()
  return row ? row.value : null
}

export async function setAppSetting(db: Knex, key: string, value: string): Promise<void> {
  const timestamp = now()
  const existing = await db<AppSettingRow>('app_settings').where({ key }).first()
  if (existing) {
    await db<AppSettingRow>('app_settings').where({ key }).update({ value, updated_at: timestamp })
  } else {
    await db<AppSettingRow>('app_settings').insert({ key, value, updated_at: timestamp })
  }
}
