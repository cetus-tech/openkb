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
  type DeleteKnowledgeVersionResult,
  registerOrUpdateAgent,
  listAgents,
  lookupAgent,
  updateAgentPermission,
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
} from '../db/db-access.js'
import { searchKnowledge, selectContextKnowledge, type ContextQuery, type Knowledge } from '../core/index.js'

export interface KnowledgeService {
  /* knowledge */
  listKnowledge(): Promise<Knowledge[]>
  listKnowledgePage(options?: KnowledgeListOptions): Promise<KnowledgePage>
  getKnowledge(slugOrId: string): Promise<Knowledge | undefined>
  listDocumentVersions(slugOrId: string, options?: VersionListOptions): Promise<KnowledgeVersionPage | undefined>
  searchKnowledge(query: string, limit?: number): Promise<Knowledge[]>
  getContext(query: ContextQuery): Promise<Knowledge[]>
  upsertKnowledge(input: UpsertKnowledgeInput): Promise<Knowledge>
  deleteKnowledge(slug: string): Promise<boolean>
  deleteKnowledgeVersion(slug: string, versionId: string): Promise<DeleteKnowledgeVersionResult>
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
  lookupAgent(name: string): Promise<AgentInfo | undefined>
  listAgents(): Promise<AgentInfo[]>
  updateAgentPermission(agentId: string | number, permissionLevel: AgentPermission): Promise<AgentInfo | undefined>
  deleteAgent(agentId: string | number): Promise<boolean>
  /* app settings */
  getAppSetting(key: string): Promise<string | null>
  setAppSetting(key: string, value: string): Promise<void>
}

export function createKnowledgeService(db: Knex): KnowledgeService {
  return {
    listKnowledge: () => listKnowledge(db),
    listKnowledgePage: (options) => listKnowledgePage(db, options),
    getKnowledge: (slugOrId) => getKnowledge(db, slugOrId),
    listDocumentVersions: (slugOrId, options) => listDocumentVersions(db, slugOrId, options),
    async searchKnowledge(query, limit = 10) {
      return searchKnowledge(await listKnowledge(db), query, limit)
    },
    async getContext(query) {
      return selectContextKnowledge(await listKnowledge(db), query)
    },
    upsertKnowledge: (input) => upsertKnowledge(db, input),
    deleteKnowledge: (slug) => deleteKnowledge(db, slug),
    deleteKnowledgeVersion: (slug, versionId) => deleteKnowledgeVersion(db, slug, versionId),
    proposeKnowledge: (input) => createProposal(db, input),
    listProposals: () => listProposals(db),
    listProposalsPage: (options) => listProposalsPage(db, options),
    getProposal: (id) => getProposal(db, id),
    updateProposalStatus: (id, status, reviewedBy) => updateProposalStatus(db, id, status, reviewedBy),
    updateProposal: (id, input) => updateProposal(db, id, input),
    deleteProposal: (id) => deleteProposal(db, id),
    registerOrUpdateAgent: (input) => registerOrUpdateAgent(db, input),
    lookupAgent: (name) => lookupAgent(db, name),
    listAgents: () => listAgents(db),
    updateAgentPermission: (agentId, permissionLevel) => updateAgentPermission(db, agentId, permissionLevel),
    deleteAgent: (agentId) => deleteAgent(db, agentId),
    getAppSetting: (key) => getAppSetting(db, key),
    setAppSetting: (key, value) => setAppSetting(db, key, value),
  }
}
