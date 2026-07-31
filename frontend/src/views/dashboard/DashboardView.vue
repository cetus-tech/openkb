<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-white">{{ i18n.t('dashboard.title') }}</h1>
        <p class="mt-4 mb-0 max-w-4xl text-sm text-gray-500 dark:text-dark-400">
          {{ i18n.t('dashboard.subtitle') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <n-button quaternary :loading="loading" title="Refresh dashboard" @click="fetchDashboard">
          <template #icon><div class="i-tabler-refresh" /></template>
          {{ i18n.t('common.refresh') }}
        </n-button>
        <n-button type="primary" @click="router.push({ path: '/dashboard/knowledge', query: { create: 'true' } })">
          <template #icon><div class="i-tabler-plus" /></template>
          {{ i18n.t('dashboard.addKnowledge') }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="error" type="warning" :bordered="false" closable @close="error = ''">
      {{ error }}
    </n-alert>

    <n-spin v-if="loading && !hasLoaded" size="large" class="flex justify-center py-20" />

    <template v-else>
      <n-card
        v-if="showSetupGuide"
        size="small"
        :bordered="true"
        class="border-primary-200/80 bg-gradient-to-br from-primary-50/70 via-white to-white dark:border-primary-900/40 dark:from-primary-950/30 dark:via-dark-900 dark:to-dark-900"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Getting started</div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Finish the knowledge loop</h2>
            <p class="mt-1 max-w-2xl text-sm text-gray-600 dark:text-dark-300">
              Create a token for agents, add active knowledge, connect an MCP client, then review memories as agents learn.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <n-tag size="small" type="info" :bordered="false">{{ completedSetupSteps }}/{{ setupSteps.length }} ready</n-tag>
            <n-button size="tiny" quaternary circle title="Dismiss setup guide" @click="dismissSetupGuide">
              <template #icon><div class="i-tabler-x" /></template>
            </n-button>
          </div>
        </div>
        <n-grid cols="1 s:2 xl:4" :x-gap="12" :y-gap="12" responsive="screen" class="mt-4">
          <n-grid-item v-for="(step, index) in setupSteps" :key="step.id">
            <n-card
              hoverable
              size="small"
              class="cursor-pointer h-full transition-all"
              :class="step.done ? 'border-emerald-200 dark:border-emerald-900/40' : 'hover:border-primary-300 dark:hover:border-primary-700'"
              @click="router.push(step.to)"
            >
              <div class="mb-3 flex items-center justify-between">
                <span
                  class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold"
                  :class="step.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-dark-800 dark:text-dark-300'"
                >
                  {{ index + 1 }}
                </span>
                <div :class="step.done ? 'i-tabler-circle-check text-emerald-600' : 'i-tabler-circle text-gray-300 dark:text-dark-600'" />
              </div>
              <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ step.title }}</div>
              <p class="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-dark-400">{{ step.description }}</p>
            </n-card>
          </n-grid-item>
        </n-grid>
      </n-card>

      <n-grid cols="1 s:2 xl:5" :x-gap="16" :y-gap="16" responsive="screen">
        <n-grid-item v-for="stat in stats" :key="stat.label">
          <n-card hoverable class="cursor-pointer h-full" @click="stat.to && router.push(stat.to)">
            <div class="flex items-center gap-5">
              <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg" :class="stat.tone">
                <div :class="stat.icon" class="text-2xl" />
              </div>
              <n-statistic :label="stat.label" :value="stat.value" />
            </div>
          </n-card>
        </n-grid-item>
      </n-grid>

      <n-card size="small" class="h-full">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
              <div class="i-tabler-plug-connected text-xl" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="font-semibold text-gray-900 dark:text-white">MCP endpoint</h2>
                <n-tag size="small" :type="healthOnline ? 'success' : 'error'" :bordered="false">
                  {{ healthOnline ? 'Online' : 'Offline' }}
                </n-tag>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <n-tag type="info" :bordered="false">
              <code class="font-mono text-xs">{{ mcpEndpoint }}</code>
            </n-tag>
            <n-button size="small" quaternary @click="copyMcpEndpoint">
              <template #icon><div class="i-tabler-copy" /></template>
              {{ mcpCopied ? i18n.t('common.copied') : i18n.t('common.copy') }}
            </n-button>
            <n-button size="small" quaternary @click="router.push('/dashboard/settings')">
              <template #icon><div class="i-tabler-key" /></template>
              {{ i18n.t('agents.tokensTitle') }}
            </n-button>
          </div>
        </div>
      </n-card>

      <n-alert
        v-if="openProposalCount"
        type="warning"
        :title="openProposalsAlertTitle"
      >
        <div class="flex flex-wrap items-center justify-between gap-4">
          <span>{{ i18n.t('dashboard.openProposalsNoticeDesc') }}</span>
          <n-button type="primary" size="small" @click="router.push('/dashboard/proposals')">
            {{ i18n.t('dashboard.reviewProposals') }}
          </n-button>
        </div>
      </n-alert>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <n-card class="h-full" :title="i18n.t('dashboard.recentKnowledge')">
          <template #header-extra>
            <n-button text type="primary" @click="router.push('/dashboard/knowledge')">
              {{ i18n.t('dashboard.viewAll') }}
              <template #icon><div class="i-tabler-arrow-up-right" /></template>
            </n-button>
          </template>
          <p class="mb-3 text-xs text-gray-500 dark:text-dark-400 -mt-2">{{ activeKnowledgeTotal }} {{ i18n.t('dashboard.itemsAvailable') }}</p>

          <n-data-table
            v-if="documents.length"
            size="small"
            :bordered="false"
            :single-line="false"
            :columns="knowledgeColumns"
            :data="documents"
            :row-key="(row: Knowledge) => row.id"
            :row-props="knowledgeRowProps"
          />
          <n-empty v-else description="No active knowledge items" class="py-8">
            <template #extra>
              <n-button type="primary" size="small" @click="router.push({ path: '/dashboard/knowledge', query: { create: 'true' } })">
                {{ i18n.t('dashboard.addKnowledge') }}
              </n-button>
            </template>
          </n-empty>
        </n-card>

        <n-card class="h-full" :title="i18n.t('dashboard.connectedAgents')">
          <template #header-extra>
            <n-button text type="primary" @click="router.push('/dashboard/agents')">{{ i18n.t('common.manage') }}</n-button>
          </template>
          <p class="mb-3 text-xs text-gray-500 dark:text-dark-400 -mt-2">{{ i18n.t('dashboard.identitiesRegistered') }}</p>

          <div v-if="agents.length" class="divide-y divide-gray-100 dark:divide-dark-800">
            <div
              v-for="agent in agents.slice(0, 5)"
              :key="agent.id"
              class="flex min-w-0 items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">{{ agent.name }}</span>
              <n-tag v-if="agent.lastTokenPermission" size="small" :type="permissionType(agent.lastTokenPermission)" :bordered="false">{{ agent.lastTokenPermission }}</n-tag>
              <n-tag v-else size="small" :bordered="false">no token yet</n-tag>
              <span class="shrink-0 text-xs text-gray-400 dark:text-dark-500">
                {{ agent.lastSeenAt ? relativeTime(agent.lastSeenAt) : 'Waiting' }}
              </span>
            </div>
          </div>
          <n-empty v-else description="No agents connected" class="py-8">
            <template #extra>
              <n-button size="small" quaternary @click="router.push('/dashboard/settings')">
                {{ i18n.t('agents.createToken') }}
              </n-button>
            </template>
          </n-empty>
        </n-card>
      </div>
    </template>

    <p v-if="lastUpdated" class="text-right text-xs text-gray-400 dark:text-dark-500">
      Updated {{ relativeTime(lastUpdated) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NTag, type DataTableColumns } from 'naive-ui'
import { apiFetch, relativeTime, scopeLabel, type Agent, type Knowledge, type KnowledgePage, type Proposal, type ProposalPage } from '@/utils/api'
import { useI18nStore } from '@/stores/i18n'

const router = useRouter()
const i18n = useI18nStore()
const loading = ref(true)
const hasLoaded = ref(false)
const error = ref('')
const healthOnline = ref(false)
const lastUpdated = ref('')
const documents = ref<Knowledge[]>([])
const activeKnowledgeTotal = ref(0)
const agents = ref<Agent[]>([])
const proposals = ref<Proposal[]>([])
const proposalCounts = ref({ all: 0, open: 0, approved: 0, rejected: 0 })
const tokenCount = ref(0)
const mcpCopied = ref(false)
const mcpEndpoint = `${window.location.origin}/mcp`

const knowledgeColumns: DataTableColumns<Knowledge> = [
  {
    title: 'Title',
    key: 'title',
    ellipsis: { tooltip: true },
    render: (row) => h('span', { class: 'font-medium text-gray-900 dark:text-white' }, row.title),
  },
  {
    title: 'Type',
    key: 'type',
    width: 100,
    render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => row.type }),
  },
  {
    title: 'Scope',
    key: 'scope',
    width: 110,
    ellipsis: { tooltip: true },
    render: (row) => scopeLabel(row),
  },
  {
    title: 'Ver',
    key: 'version',
    width: 64,
    render: (row) => `v${row.version}`,
  },
  {
    title: 'Updated',
    key: 'updatedAt',
    width: 96,
    render: (row) => h('span', { class: 'text-xs text-gray-500 dark:text-dark-400' }, relativeTime(row.updatedAt)),
  },
]

function knowledgeRowProps(row: Knowledge) {
  return {
    style: 'cursor: pointer',
    onClick: () => router.push(`/dashboard/knowledge/${encodeURIComponent(row.slug)}`),
  }
}

const guideDismissed = ref(false)

async function dismissSetupGuide() {
  guideDismissed.value = true
  try {
    await apiFetch('/v1/settings/setup_guide_dismissed', {
      method: 'PUT',
      body: JSON.stringify({ value: 'true' }),
    })
  } catch {
    // Ignore failure if offline
  }
}

const openProposalCount = computed(() => proposalCounts.value.open)
const approvedProposalCount = computed(() => proposalCounts.value.approved)
const rejectedProposalCount = computed(() => proposalCounts.value.rejected)

const setupSteps = computed(() => [
  {
    id: 'token',
    title: 'Create MCP token',
    description: tokenCount.value
      ? `${tokenCount.value} token${tokenCount.value === 1 ? '' : 's'} ready for agents`
      : 'Agents need a bearer token from Settings',
    done: tokenCount.value > 0,
    to: '/dashboard/settings',
  },
  {
    id: 'knowledge',
    title: 'Add active knowledge',
    description: activeKnowledgeTotal.value
      ? `${activeKnowledgeTotal.value} active item${activeKnowledgeTotal.value === 1 ? '' : 's'} retrievable`
      : 'Seed rules, decisions, or project context',
    done: activeKnowledgeTotal.value > 0,
    to: '/dashboard/knowledge',
  },
  {
    id: 'agent',
    title: 'Connect an agent',
    description: agents.value.length
      ? `${agents.value.length} ${agents.value.length === 1 ? 'identity' : 'identities'} registered`
      : 'Point an MCP client at /mcp with your token',
    done: agents.value.length > 0,
    to: '/dashboard/agents',
  },
  {
    id: 'review',
    title: 'Review memories',
    description: openProposalCount.value
      ? `${openProposalCount.value} open proposal${openProposalCount.value === 1 ? '' : 's'}`
      : 'Approve openkb_remember proposals when agents learn',
    done: (openProposalCount.value === 0 && agents.value.length > 0) || approvedProposalCount.value > 0 || rejectedProposalCount.value > 0,
    to: '/dashboard/proposals',
  },
])

const openProposalsAlertTitle = computed(() => {
  const key = openProposalCount.value === 1 ? 'dashboard.openProposalsNoticeTitle' : 'dashboard.openProposalsNoticeTitlePlural'
  return i18n.t(key).replace('{count}', String(openProposalCount.value))
})

const completedSetupSteps = computed(() => setupSteps.value.filter((step) => step.done).length)
const showSetupGuide = computed(() => {
  if (guideDismissed.value) return false
  if (hasLoaded.value && completedSetupSteps.value >= setupSteps.value.length) {
    dismissSetupGuide()
    return false
  }
  return completedSetupSteps.value < setupSteps.value.length
})

const stats = computed(() => [
  {
    label: i18n.t('dashboard.activeKnowledge'),
    value: activeKnowledgeTotal.value.toString(),
    icon: 'i-tabler-database',
    tone: 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400',
    to: '/dashboard/knowledge',
  },
  {
    label: i18n.t('dashboard.activeAgents'),
    value: agents.value.length.toString(),
    icon: 'i-tabler-robot',
    tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
    to: '/dashboard/agents',
  },
  {
    label: i18n.t('dashboard.openProposals'),
    value: openProposalCount.value.toString(),
    icon: 'i-tabler-git-pull-request',
    tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    to: '/dashboard/proposals?status=open',
  },
  {
    label: i18n.t('proposals.statApproved'),
    value: approvedProposalCount.value.toString(),
    icon: 'i-tabler-circle-check',
    tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    to: '/dashboard/proposals?status=approved',
  },
  {
    label: i18n.t('proposals.statRejected'),
    value: rejectedProposalCount.value.toString(),
    icon: 'i-tabler-circle-x',
    tone: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400',
    to: '/dashboard/proposals?status=rejected',
  },
])

function permissionType(permission: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (permission === 'write') return 'success'
  if (permission === 'propose') return 'warning'
  return 'default'
}

async function copyMcpEndpoint() {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(mcpEndpoint)
    else {
      const textarea = document.createElement('textarea')
      textarea.value = mcpEndpoint
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    mcpCopied.value = true
    window.setTimeout(() => {
      mcpCopied.value = false
    }, 1800)
  } catch {
    error.value = 'Could not copy the MCP endpoint. Select it manually.'
  }
}

async function fetchDashboard() {
  loading.value = true
  const failures: string[] = []
  const [health, docs, agentList, proposalList, tokens, guideSetting] = await Promise.allSettled([
    apiFetch<{ ok: boolean }>('/health'),
    apiFetch<KnowledgePage>('/v1/knowledge?page=1&pageSize=5&status=active'),
    apiFetch<{ agents: Agent[] }>('/v1/agents'),
    apiFetch<ProposalPage>('/v1/proposals?page=1&pageSize=5&status=open'),
    apiFetch<{ tokens: unknown[] }>('/auth/tokens'),
    apiFetch<{ key: string; value: string }>('/v1/settings/setup_guide_dismissed'),
  ])

  if (health.status === 'fulfilled') healthOnline.value = health.value.ok
  else failures.push('health')
  if (docs.status === 'fulfilled') {
    documents.value = docs.value.knowledge ?? []
    activeKnowledgeTotal.value = docs.value.total ?? 0
  } else failures.push('knowledge')
  if (agentList.status === 'fulfilled') agents.value = agentList.value.agents ?? []
  else failures.push('agents')
  if (proposalList.status === 'fulfilled') {
    proposals.value = proposalList.value.proposals ?? []
    proposalCounts.value = proposalList.value.counts ?? { all: 0, open: 0, approved: 0, rejected: 0 }
  } else failures.push('proposals')
  if (tokens.status === 'fulfilled') tokenCount.value = tokens.value.tokens?.length ?? 0
  else failures.push('tokens')
  if (guideSetting.status === 'fulfilled' && guideSetting.value?.value === 'true') {
    guideDismissed.value = true
  }

  error.value = failures.length
    ? `Could not load ${failures.join(', ')}. Check the server connection and refresh.`
    : ''
  lastUpdated.value = new Date().toISOString()
  hasLoaded.value = true
  if (completedSetupSteps.value >= setupSteps.value.length) {
    dismissSetupGuide()
  }
  loading.value = false
}

onMounted(fetchDashboard)
</script>
