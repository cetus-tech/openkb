import { technologyAliases } from './technologies.js'
import { createHash } from 'node:crypto'
import type { Knex } from 'knex'
import {
  knowledgeTypes,
  type Knowledge,
  type KnowledgeStatus,
  type KnowledgeType,
  type KnowledgeScope,
  normalizeKnowledgeScope,
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
  /**
   * Dashboard-only filter. Omit for all knowledge.
   * Pass `null` or `'ungrouped'` for items with no group.
   * Pass a number for a specific group (direct membership only).
   */
  groupId?: number | null | 'ungrouped'
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

export interface CreateKnowledgeGroupInput {
  name: string
  parentId?: number | null
}

export interface UpdateKnowledgeGroupInput {
  name?: string
  parentId?: number | null
}

export interface ReorderKnowledgeGroupItem {
  id: number
  parentId: number | null
  sortOrder: number
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
  label?: string
  /** API/MCP token id last used by this agent (from bearer auth). */
  tokenId?: number
}

/** Only write agent last-seen metadata at most this often per agent. */
const AGENT_TOUCH_INTERVAL_MS = 60_000

/** MCP permission granted by a bearer token. There is deliberately no admin tier: the MCP surface never gets dashboard admin powers. */
export type AgentPermission = 'read' | 'propose' | 'write'

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
  label?: string | null
  last_seen_at?: string | null
  last_token_id?: number | null
  created_at: string
  updated_at: string
}

export interface AgentInfo {
  id: number
  name: string
  label?: string
  lastSeenAt?: string
  /** Last MCP/API token used by this agent when connecting. */
  lastTokenId?: number
  lastTokenPrefix?: string
  lastTokenName?: string
  lastUserName?: string
  /** Permission of the last token used by this agent (display only; MCP gating reads the current request's token). */
  lastTokenPermission?: AgentPermission
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
  group_id?: number | null
  created_at: string
  updated_at: string
}

interface KnowledgeGroupRow {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
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

/** knowledge row joined with its current (latest) version snapshot. */
interface KnowledgeJoinedRow extends KnowledgeRow {
  version_id?: number | null
  version_number?: number | null
  content_markdown?: string | null
  content_hash?: string | null
  change_summary?: string | null
  created_by?: string | null
  version_created_at?: string | null
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
  return normalizeKnowledgeScope(scope)
}

function stringifyScope(value: KnowledgeScope): string {
  return JSON.stringify(normalizeKnowledgeScope(value))
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

/**
 * One-row-per-knowledge query that carries the current version inline.
 * The correlated subquery picks the latest version, so it also covers
 * orphaned/stale current_version_id rows without a second query.
 */
function joinedKnowledgeSelect(db: Knex) {
  return db<KnowledgeJoinedRow>('knowledge as k')
    .leftJoin(
      'knowledge_versions as v',
      'v.id',
      db.raw('(select v2.id from knowledge_versions v2 where v2.knowledge_id = k.id order by v2.version_number desc limit 1)'),
    )
    .select(
      'k.id',
      'k.slug',
      'k.title',
      'k.type',
      'k.status',
      'k.summary',
      'k.scope_json',
      'k.current_version_id',
      'k.group_id',
      'k.created_at',
      'k.updated_at',
      'v.id as version_id',
      'v.version_number',
      'v.content_markdown',
      'v.content_hash',
      'v.change_summary',
      'v.created_by',
      'v.created_at as version_created_at',
    )
}

function mapKnowledgeRow(row: KnowledgeJoinedRow): Knowledge {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    type: row.type,
    status: row.status,
    content: row.content_markdown ?? '',
    scope: parseScope(row.scope_json),
    version: row.version_number ?? 0,
    createdBy: row.created_by ?? undefined,
    updatedAt: row.updated_at,
    groupId: row.group_id ?? null,
  }
}

function mapGroupRow(row: KnowledgeGroupRow, knowledgeCount = 0): KnowledgeGroup {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order,
    knowledgeCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildGroupTree(groups: KnowledgeGroup[]): KnowledgeGroupTreeNode[] {
  const nodes = new Map<number, KnowledgeGroupTreeNode>()
  for (const group of groups) {
    nodes.set(group.id, { ...group, children: [] })
  }
  const roots: KnowledgeGroupTreeNode[] = []
  for (const group of groups) {
    const node = nodes.get(group.id)!
    if (group.parentId != null && nodes.has(group.parentId)) {
      nodes.get(group.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortRecursive = (list: KnowledgeGroupTreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id - b.id)
    for (const node of list) sortRecursive(node.children)
  }
  sortRecursive(roots)
  return roots
}

async function assertGroupExists(db: Knex, groupId: number): Promise<KnowledgeGroupRow> {
  const row = await db<KnowledgeGroupRow>('knowledge_groups').where({ id: groupId }).first()
  if (!row) throw new Error(`Knowledge group not found: ${groupId}`)
  return row
}

/** True when `ancestorId` is `groupId` or an ancestor of it (cycle guard). */
async function isGroupDescendantOrSelf(db: Knex, groupId: number, ancestorId: number): Promise<boolean> {
  if (groupId === ancestorId) return true
  let currentId: number | null = groupId
  const seen = new Set<number>()
  while (currentId != null) {
    if (seen.has(currentId)) break
    seen.add(currentId)
    const row: KnowledgeGroupRow | undefined = await db<KnowledgeGroupRow>('knowledge_groups')
      .where({ id: currentId })
      .first()
    if (!row) break
    if (row.parent_id === ancestorId) return true
    currentId = row.parent_id
  }
  return false
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
    : normalizeKnowledgeScope(input.scope, await technologyAliases(trx))
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
  const rows = await joinedKnowledgeSelect(db)
    .orderBy('k.updated_at', 'desc')
    .orderBy('k.slug', 'asc')
  return rows.map(mapKnowledgeRow)
}

export async function listKnowledgePage(db: Knex, options: KnowledgeListOptions = {}): Promise<KnowledgePage> {
  const normalizedQuery = options.query?.trim().toLowerCase()
  let query = joinedKnowledgeSelect(db)
  if (options.type) query = query.where('k.type', options.type)
  if (options.status) query = query.where('k.status', options.status)
  if (options.groupId === null || options.groupId === 'ungrouped') {
    query = query.whereNull('k.group_id')
  } else if (typeof options.groupId === 'number' && Number.isFinite(options.groupId)) {
    query = query.where('k.group_id', options.groupId)
  }
  if (normalizedQuery) {
    const pattern = `%${normalizedQuery}%`
    query = query.whereRaw(
      '(lower(k.title) like ? or lower(k.summary) like ? or lower(k.slug) like ? or lower(v.content_markdown) like ?)',
      [pattern, pattern, pattern, pattern],
    )
  }

  const countRow = await query.clone().count('k.id as count').first() as { count?: number | string } | undefined
  const total = Number(countRow?.count ?? 0)
  const { page, pageSize, totalPages } = pageValues(total, options)
  const rows = await query
    .clone()
    .orderBy('k.updated_at', 'desc')
    .orderBy('k.slug', 'asc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    knowledge: rows.map(mapKnowledgeRow),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export async function getKnowledge(db: Knex, slugOrId: string | number): Promise<Knowledge | undefined> {
  const key = String(slugOrId)
  const query = joinedKnowledgeSelect(db)
  const row = /^\d+$/.test(key)
    ? await query.where('k.id', Number(key)).orWhere('k.slug', key).first()
    : await query.where('k.slug', key).first()
  return row ? mapKnowledgeRow(row) : undefined
}

export async function listDocumentVersions(db: Knex, slugOrId: string | number, options: VersionListOptions = {}): Promise<KnowledgeVersionPage | undefined> {
  const key = String(slugOrId)
  const knowledge = await getKnowledge(db, slugOrId)
  if (!knowledge) return undefined
  const documentRow = await db<KnowledgeRow>('knowledge').where({ id: knowledge.id }).first()
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
    knowledge,
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

/**
 * Assign knowledge to a dashboard group (or clear group). Management-only;
 * does not create a new version or change retrieval behavior.
 */
export async function setKnowledgeGroup(
  db: Knex,
  slug: string,
  groupId: number | null,
): Promise<Knowledge | undefined> {
  const existing = await db<KnowledgeRow>('knowledge').where({ slug }).first()
  if (!existing) return undefined
  if (groupId != null) await assertGroupExists(db, groupId)
  await db<KnowledgeRow>('knowledge').where({ id: existing.id }).update({ group_id: groupId })
  return getKnowledge(db, slug)
}

/* ------------------------------------------------------------------ */
/*  Knowledge groups (dashboard organization only)                     */
/* ------------------------------------------------------------------ */

export async function listKnowledgeGroups(db: Knex): Promise<KnowledgeGroupsPayload> {
  const rows = await db<KnowledgeGroupRow>('knowledge_groups')
    .orderBy('sort_order', 'asc')
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')

  const countRows = await db('knowledge')
    .select('group_id')
    .count('id as count')
    .groupBy('group_id') as Array<{ group_id: number | null; count: number | string }>

  const counts = new Map<number | null, number>()
  for (const row of countRows) {
    counts.set(row.group_id ?? null, Number(row.count))
  }

  const groups = rows.map((row) => mapGroupRow(row, counts.get(row.id) ?? 0))
  const totalCount = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return {
    groups,
    tree: buildGroupTree(groups),
    ungroupedCount: counts.get(null) ?? 0,
    totalCount,
  }
}

export async function createKnowledgeGroup(db: Knex, input: CreateKnowledgeGroupInput): Promise<KnowledgeGroup> {
  const name = input.name.trim()
  if (!name) throw new Error('Group name is required')
  const parentId = input.parentId ?? null
  if (parentId != null) await assertGroupExists(db, parentId)

  const siblingQuery = db<KnowledgeGroupRow>('knowledge_groups')
  const maxRow = parentId == null
    ? await siblingQuery.whereNull('parent_id').max('sort_order as max').first() as { max?: number | string } | undefined
    : await siblingQuery.where({ parent_id: parentId }).max('sort_order as max').first() as { max?: number | string } | undefined
  const sortOrder = Number(maxRow?.max ?? -1) + 1
  const timestamp = now()
  const id = await insertId(db, 'knowledge_groups', {
    name,
    parent_id: parentId,
    sort_order: sortOrder,
    created_at: timestamp,
    updated_at: timestamp,
  })
  const row = await db<KnowledgeGroupRow>('knowledge_groups').where({ id }).first()
  return mapGroupRow(row!, 0)
}

export async function updateKnowledgeGroup(
  db: Knex,
  id: number,
  input: UpdateKnowledgeGroupInput,
): Promise<KnowledgeGroup | undefined> {
  const existing = await db<KnowledgeGroupRow>('knowledge_groups').where({ id }).first()
  if (!existing) return undefined

  const updates: Partial<KnowledgeGroupRow> = { updated_at: now() }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('Group name is required')
    updates.name = name
  }
  if (input.parentId !== undefined) {
    const parentId = input.parentId
    if (parentId != null) {
      await assertGroupExists(db, parentId)
      if (await isGroupDescendantOrSelf(db, parentId, id)) {
        throw new Error('Cannot move a group into itself or one of its descendants')
      }
    }
    updates.parent_id = parentId
  }

  await db<KnowledgeGroupRow>('knowledge_groups').where({ id }).update(updates)
  const payload = await listKnowledgeGroups(db)
  return payload.groups.find((g) => g.id === id)
}

export async function deleteKnowledgeGroup(db: Knex, id: number): Promise<boolean> {
  const existing = await db<KnowledgeGroupRow>('knowledge_groups').where({ id }).first()
  if (!existing) return false

  await db.transaction(async (trx) => {
    // Reparent children to this group's parent so the tree stays intact.
    await trx<KnowledgeGroupRow>('knowledge_groups')
      .where({ parent_id: id })
      .update({ parent_id: existing.parent_id, updated_at: now() })
    // Knowledge becomes ungrouped; groups never gate retrieval.
    await trx<KnowledgeRow>('knowledge').where({ group_id: id }).update({ group_id: null })
    await trx<KnowledgeGroupRow>('knowledge_groups').where({ id }).delete()
  })
  return true
}

/**
 * Apply a full sibling/parent layout after drag-and-drop.
 * Validates cycle-free parent links, then writes parent_id + sort_order.
 */
export async function reorderKnowledgeGroups(
  db: Knex,
  items: ReorderKnowledgeGroupItem[],
): Promise<KnowledgeGroupsPayload> {
  if (!items.length) return listKnowledgeGroups(db)

  const existing = await db<KnowledgeGroupRow>('knowledge_groups').select('id')
  const existingIds = new Set(existing.map((row) => row.id))
  for (const item of items) {
    if (!existingIds.has(item.id)) throw new Error(`Knowledge group not found: ${item.id}`)
    if (item.parentId != null && !existingIds.has(item.parentId)) {
      throw new Error(`Knowledge group not found: ${item.parentId}`)
    }
    if (item.parentId === item.id) throw new Error('Cannot set a group as its own parent')
  }

  // Build parent map from the proposed layout and reject cycles.
  const parentOf = new Map<number, number | null>()
  for (const item of items) parentOf.set(item.id, item.parentId)
  for (const id of existingIds) {
    if (!parentOf.has(id)) {
      const row = existing.find((r) => r.id === id)
      // Keep unmentioned groups; only reorder submitted ones.
      void row
    }
  }
  for (const item of items) {
    let cursor = item.parentId
    const seen = new Set<number>([item.id])
    while (cursor != null) {
      if (seen.has(cursor)) throw new Error('Group reorder would create a cycle')
      seen.add(cursor)
      if (parentOf.has(cursor)) {
        cursor = parentOf.get(cursor) ?? null
      } else {
        const row = await db<KnowledgeGroupRow>('knowledge_groups').where({ id: cursor }).first()
        cursor = row?.parent_id ?? null
      }
    }
  }

  const timestamp = now()
  await db.transaction(async (trx) => {
    for (const item of items) {
      await trx<KnowledgeGroupRow>('knowledge_groups').where({ id: item.id }).update({
        parent_id: item.parentId,
        sort_order: item.sortOrder,
        updated_at: timestamp,
      })
    }
  })
  return listKnowledgeGroups(db)
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
    : normalizeKnowledgeScope(input.scope, await technologyAliases(db))
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
    const scopeJson = input.scope ? stringifyScope(normalizeKnowledgeScope(input.scope, await technologyAliases(trx))) : proposal.scope_json

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
    label: input.label ?? null,
    last_seen_at: timestamp,
    last_token_id: input.tokenId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  })
  const agent = await getAgentById(db, agentId)
  return { agent: agent!, created: true }
}

/**
 * Cheap identity touch used by the MCP hot path: registers the agent when
 * unknown and refreshes last_seen_at/last_token_id at most once per interval.
 * Avoids a DB write on every MCP request/tool call while keeping the Agents
 * dashboard roughly current.
 */
export async function touchAgent(db: Knex, input: RegisterAgentInput): Promise<void> {
  const timestamp = now()
  const existing = await db<AgentRow>('agents').where({ name: input.name }).first()
  if (!existing) {
    await insertId(db, 'agents', {
      name: input.name,
      label: input.label ?? null,
      last_seen_at: timestamp,
      last_token_id: input.tokenId ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    return
  }

  const lastSeen = existing.last_seen_at ? Date.parse(existing.last_seen_at) : 0
  const recentlySeen = Number.isFinite(lastSeen) && Date.now() - lastSeen < AGENT_TOUCH_INTERVAL_MS
  const sameToken = input.tokenId == null || existing.last_token_id === input.tokenId
  if (recentlySeen && sameToken) return

  await db<AgentRow>('agents').where({ id: existing.id }).update({
    last_seen_at: timestamp,
    ...(input.tokenId ? { last_token_id: input.tokenId } : {}),
    updated_at: timestamp,
  })
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
      'a.label',
      'a.last_seen_at',
      'a.last_token_id',
      'a.created_at',
      'a.updated_at',
      't.token_prefix as token_prefix',
      't.token_value as token_value',
      't.name as token_name',
      't.permission_level as token_permission',
      'u.name as user_name',
      'u.email as user_email',
    )
    .orderBy('a.last_seen_at', 'desc')
  return rows.map((row) => agentFromJoinedRow(row as AgentJoinedRow))
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
  token_permission?: AgentPermission | null
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
      'a.label',
      'a.last_seen_at',
      'a.last_token_id',
      'a.created_at',
      'a.updated_at',
      't.token_prefix as token_prefix',
      't.token_value as token_value',
      't.name as token_name',
      't.permission_level as token_permission',
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
    label: row.label ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastTokenId: row.last_token_id ?? undefined,
    lastTokenPrefix: tokenShortForm(row.token_prefix, row.token_value),
    lastTokenName: row.token_name ?? undefined,
    lastUserName: row.user_name || row.user_email || undefined,
    lastTokenPermission: row.token_permission ?? undefined,
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
