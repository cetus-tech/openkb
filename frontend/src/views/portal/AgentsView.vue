<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">{{ i18n.t('agents.title') }}</h1>
        <p class="mt-4 mb-0 max-w-4xl text-sm text-gray-500 dark:text-dark-400">{{ i18n.t('agents.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <n-button quaternary :loading="loading" title="Refresh agents" @click="fetchAgents">
          <template #icon><div class="i-tabler-refresh" /></template>
          {{ i18n.t('common.refresh') }}
        </n-button>
        <n-button type="primary" @click="showAddModal = true">
          <template #icon><div class="i-tabler-plus" /></template>
          {{ i18n.t('agents.registerAgent') }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="error" type="error" :bordered="false" closable @close="error = ''">{{ error }}
    </n-alert>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <n-card v-for="stat in stats" :key="stat.label" size="small" :bordered="true">
        <n-statistic :label="stat.label" :value="stat.value" />
      </n-card>
    </div>

    <n-spin v-if="loading && !agents.length" size="large" class="flex justify-center py-20" />

    <div v-else-if="agents.length" class="grid gap-3 lg:grid-cols-2">
      <n-card v-for="agent in agents" :key="agent.id" size="small" :bordered="true">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400">
            <div class="i-tabler-robot text-2xl" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold leading-none text-gray-900 dark:text-white">{{ agent.name }}</span>
              <n-tag size="small" :type="permissionType(agent.permissionLevel)" :bordered="false">{{ agent.permissionLevel }}</n-tag>
              <span class="text-xs text-gray-400 dark:text-dark-500">
                {{ agent.lastSeenAt ? `Last seen ${relativeTime(agent.lastSeenAt)}` : 'No requests recorded' }}
              </span>
            </div>
            <p v-if="agent.label" class="mt-1 text-sm text-gray-500 dark:text-dark-400">{{ agent.label }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-dark-500">
              <n-tag v-if="agent.lastUserName" size="small" :bordered="false" title="Token owner">
                <template #icon><div class="i-tabler-user" /></template>
                {{ agent.lastUserName }}
              </n-tag>
              <n-tag
                v-if="agent.lastTokenPrefix || agent.lastTokenName"
                size="small"
                type="info"
                :bordered="false"
                title="Last MCP token used"
              >
                <span class="inline-flex items-center gap-1.5">
                  <span v-if="agent.lastTokenName" class="truncate max-w-[8rem]">{{ agent.lastTokenName }}</span>
                  <span v-if="agent.lastTokenName && agent.lastTokenPrefix" class="opacity-50">·</span>
                  <span v-if="agent.lastTokenPrefix" class="font-mono">{{ agent.lastTokenPrefix }}</span>
                </span>
              </n-tag>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <n-select
              :value="agent.permissionLevel"
              :options="permissionOptions"
              size="small"
              class="w-36"
              @update:value="(value: string) => updatePermission(agent, value)"
            />
            <n-button quaternary circle type="error" title="Remove agent" @click="deleteAgent(agent)">
              <template #icon><div class="i-tabler-trash" /></template>
            </n-button>
          </div>
        </div>
      </n-card>
    </div>

    <n-empty v-else description="No MCP agents registered">
      <template #extra>
        <n-button type="primary" @click="showAddModal = true">
          <template #icon><div class="i-tabler-plus" /></template>
          {{ i18n.t('agents.registerAgent') }}
        </n-button>
      </template>
    </n-empty>

    <n-modal v-model:show="showAddModal" preset="card" title="Register MCP agent" class="max-w-md">
      <n-form :model="newAgent" @submit.prevent="handleRegister">
        <n-form-item label="Agent name" path="name"><n-input v-model:value="newAgent.name" placeholder="e.g. codex" /></n-form-item>
        <n-form-item label="Permission level" path="permissionLevel"><n-select v-model:value="newAgent.permissionLevel" :options="permissionOptions" /></n-form-item>
        <n-form-item label="Label"><n-input v-model:value="newAgent.label" placeholder="Optional description" /></n-form-item>
        <div class="flex justify-end gap-3">
          <n-button @click="showAddModal = false">{{ i18n.t('common.cancel') }}</n-button>
          <n-button type="primary" attr-type="submit" :loading="registering">{{ i18n.t('common.create') }}</n-button>
        </div>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { apiFetch, relativeTime, type Agent } from '@/utils/api'
import { useI18nStore } from '@/stores/i18n'

const loading = ref(true)
const i18n = useI18nStore()
const error = ref('')
const agents = ref<Agent[]>([])
const message = useMessage()
const dialog = useDialog()
const showAddModal = ref(false)
const registering = ref(false)
const newAgent = reactive({ name: '', permissionLevel: 'propose', label: '' })
const permissionOptions = [
  { label: 'Read only', value: 'read' },
  { label: 'Propose changes', value: 'propose' },
  { label: 'Write access', value: 'write' },
  { label: 'Administrator', value: 'admin' },
]

const stats = computed(() => [
  { label: i18n.t('agents.statRegistered'), value: agents.value.length },
  { label: i18n.t('agents.statWriteEnabled'), value: agents.value.filter((agent) => agent.permissionLevel === 'write' || agent.permissionLevel === 'admin').length },
  { label: i18n.t('agents.statSeenRecently'), value: agents.value.filter((agent) => agent.lastSeenAt && Date.now() - new Date(agent.lastSeenAt).getTime() < 86400000).length },
])

function permissionType(permission: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (permission === 'admin') return 'error'
  if (permission === 'write') return 'success'
  if (permission === 'propose') return 'warning'
  return 'default'
}

async function fetchAgents() {
  loading.value = true
  try {
    const data = await apiFetch<{ agents: Agent[] }>('/v1/agents')
    agents.value = data.agents ?? []
    error.value = ''
  } catch (err) {
    error.value = `Failed to load agents: ${err instanceof Error ? err.message : 'unknown error'}`
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!newAgent.name.trim()) {
    message.error('Agent name is required')
    return
  }
  registering.value = true
  try {
    await apiFetch('/v1/agents', { method: 'POST', body: JSON.stringify(newAgent) })
    message.success('Agent registered')
    Object.assign(newAgent, { name: '', permissionLevel: 'propose', label: '' })
    showAddModal.value = false
    await fetchAgents()
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Failed to register agent')
  } finally {
    registering.value = false
  }
}

async function updatePermission(agent: Agent, permissionLevel: string) {
  if (permissionLevel === agent.permissionLevel) return
  const previous = agent.permissionLevel
  agent.permissionLevel = permissionLevel
  try {
    await apiFetch(`/v1/agents/${agent.id}/permission`, { method: 'PATCH', body: JSON.stringify({ permissionLevel }) })
    message.success('Permission updated')
  } catch (err) {
    agent.permissionLevel = previous
    message.error(err instanceof Error ? err.message : 'Failed to update permission')
  }
}

function deleteAgent(agent: Agent) {
  dialog.warning({
    title: 'Remove agent',
    content: `Remove "${agent.name}"?`,
    positiveText: 'Remove',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await apiFetch(`/v1/agents/${agent.id}`, { method: 'DELETE' })
        message.success('Agent removed')
        await fetchAgents()
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to remove agent')
        throw err
      }
    },
  })
}

onMounted(fetchAgents)
</script>
