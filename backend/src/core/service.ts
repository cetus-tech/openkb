import { listTechnologies, saveTechnology, technologyAliases, type Technology } from '../db/technologies.js'
import type { Knex } from 'knex'
import {
  getKnowledge,
  listKnowledge,
  listKnowledgePage,
  listDocumentVersions,
  listProposals,
  listProposalsPage,
  getProposal,
  upsertKnowledge,
  createProposal,
  deleteKnowledge,
  deleteKnowledgeVersion,
  setKnowledgeGroup,
  listKnowledgeGroups,
  createKnowledgeGroup,
  updateKnowledgeGroup,
  deleteKnowledgeGroup,
  reorderKnowledgeGroups,
  type DeleteKnowledgeVersionResult,
  registerOrUpdateAgent,
  touchAgent,
  listAgents,
  lookupAgent,
  deleteAgent,
  deleteProposal,
  updateProposalStatus,
  updateProposal,
  type UpdateProposalInput,
  getAppSetting,
  setAppSetting,
  type ProposeKnowledgeInput,
  type UpsertKnowledgeInput,
  type KnowledgeListOptions,
  type KnowledgePage,
  type KnowledgeVersionPage,
  type VersionListOptions,
  type RegisterAgentInput,
  type AgentPermission,
  type AgentInfo,
  type KnowledgeGroupsPayload,
  type KnowledgeGroup,
  type CreateKnowledgeGroupInput,
  type UpdateKnowledgeGroupInput,
  type ReorderKnowledgeGroupItem,
} from '../db/db-access.js'
import {
  searchKnowledge,
  searchKnowledgeWithContext,
  selectContextKnowledge,
  selectContextKnowledgeResult,
  type ContextQuery,
  type ContextRetrievalResult,
  type ContextSearchResult,
  type Knowledge,
} from '../core/index.js'

export interface KnowledgeService {
  listTechnologies(): Promise<Technology[]>
  saveTechnology(facet: string, input: { label?: unknown; aliases?: unknown }): Promise<Technology>
  /* knowledge */
  listKnowledge(): Promise<Knowledge[]>
  listKnowledgePage(options?: KnowledgeListOptions): Promise<KnowledgePage>
  getKnowledge(slugOrId: string): Promise<Knowledge | undefined>
  listDocumentVersions(slugOrId: string, options?: VersionListOptions): Promise<KnowledgeVersionPage | undefined>
  searchKnowledge(query: string, limit?: number): Promise<Knowledge[]>
  getContext(query: ContextQuery): Promise<Knowledge[]>
  getContextResult(query?: ContextQuery): Promise<ContextRetrievalResult>
  searchKnowledgeWithContext(query: string, context?: ContextQuery): Promise<ContextSearchResult>
  upsertKnowledge(input: UpsertKnowledgeInput): Promise<Knowledge>
  deleteKnowledge(slug: string): Promise<boolean>
  deleteKnowledgeVersion(slug: string, versionId: string): Promise<DeleteKnowledgeVersionResult>
  setKnowledgeGroup(slug: string, groupId: number | null): Promise<Knowledge | undefined>
  /* knowledge groups (dashboard only; does not affect MCP retrieval) */
  listKnowledgeGroups(): Promise<KnowledgeGroupsPayload>
  createKnowledgeGroup(input: CreateKnowledgeGroupInput): Promise<KnowledgeGroup>
  updateKnowledgeGroup(id: number, input: UpdateKnowledgeGroupInput): Promise<KnowledgeGroup | undefined>
  deleteKnowledgeGroup(id: number): Promise<boolean>
  reorderKnowledgeGroups(items: ReorderKnowledgeGroupItem[]): Promise<KnowledgeGroupsPayload>
  /* proposals */
  proposeKnowledge(input: ProposeKnowledgeInput): ReturnType<typeof createProposal>
  listProposals(): ReturnType<typeof listProposals>
  listProposalsPage(options?: Parameters<typeof listProposalsPage>[1]): ReturnType<typeof listProposalsPage>
  getProposal(id: string | number): ReturnType<typeof getProposal>
  updateProposalStatus(id: string | number, status: 'open' | 'approved' | 'rejected', reviewedBy?: string): Promise<any>
  updateProposal(id: string | number, input: UpdateProposalInput): Promise<any>
  deleteProposal(id: string | number): Promise<boolean>
  /* agents */
  registerOrUpdateAgent(input: RegisterAgentInput): Promise<{ agent: AgentInfo; created: boolean }>
  touchAgent(input: RegisterAgentInput): Promise<void>
  lookupAgent(name: string): Promise<AgentInfo | undefined>
  listAgents(): Promise<AgentInfo[]>
  deleteAgent(agentId: string | number): Promise<boolean>
  /* app settings */
  getAppSetting(key: string): Promise<string | null>
  setAppSetting(key: string, value: string): Promise<void>
}

export function createKnowledgeService(db: Knex): KnowledgeService {
  return {
    listTechnologies: () => listTechnologies(db),
    saveTechnology: (facet, input) => saveTechnology(db, facet, input),
    listKnowledge: () => listKnowledge(db),
    listKnowledgePage: (options) => listKnowledgePage(db, options),
    getKnowledge: (slugOrId) => getKnowledge(db, slugOrId),
    listDocumentVersions: (slugOrId, options) => listDocumentVersions(db, slugOrId, options),
    async searchKnowledge(query, limit = 10) {
      return searchKnowledge(await listKnowledge(db), query, limit)
    },
    async getContext(query) {
      return selectContextKnowledge(await listKnowledge(db), { ...query, stackAliases: await technologyAliases(db) })
    },
    async getContextResult(query = {}) {
      return selectContextKnowledgeResult(await listKnowledge(db), { ...query, stackAliases: await technologyAliases(db) })
    },
    async searchKnowledgeWithContext(query, context = {}) {
      return searchKnowledgeWithContext(await listKnowledge(db), query, { ...context, stackAliases: await technologyAliases(db) })
    },
    upsertKnowledge: (input) => upsertKnowledge(db, input),
    deleteKnowledge: (slug) => deleteKnowledge(db, slug),
    deleteKnowledgeVersion: (slug, versionId) => deleteKnowledgeVersion(db, slug, versionId),
    setKnowledgeGroup: (slug, groupId) => setKnowledgeGroup(db, slug, groupId),
    listKnowledgeGroups: () => listKnowledgeGroups(db),
    createKnowledgeGroup: (input) => createKnowledgeGroup(db, input),
    updateKnowledgeGroup: (id, input) => updateKnowledgeGroup(db, id, input),
    deleteKnowledgeGroup: (id) => deleteKnowledgeGroup(db, id),
    reorderKnowledgeGroups: (items) => reorderKnowledgeGroups(db, items),
    proposeKnowledge: (input) => createProposal(db, input),
    listProposals: () => listProposals(db),
    listProposalsPage: (options) => listProposalsPage(db, options),
    getProposal: (id) => getProposal(db, id),
    updateProposalStatus: (id, status, reviewedBy) => updateProposalStatus(db, id, status, reviewedBy),
    updateProposal: (id, input) => updateProposal(db, id, input),
    deleteProposal: (id) => deleteProposal(db, id),
    registerOrUpdateAgent: (input) => registerOrUpdateAgent(db, input),
    touchAgent: (input) => touchAgent(db, input),
    lookupAgent: (name) => lookupAgent(db, name),
    listAgents: () => listAgents(db),
    deleteAgent: (agentId) => deleteAgent(db, agentId),
    getAppSetting: (key) => getAppSetting(db, key),
    setAppSetting: (key, value) => setAppSetting(db, key, value),
  }
}
