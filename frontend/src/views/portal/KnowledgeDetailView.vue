<template>
  <!-- Full-page edit: no history tree; preview left, form right -->
  <KnowledgeEditWorkspace
    v-if="knowledge && editing"
    :model="form"
    :saving="saving"
    slug-disabled
    show-change-summary
    :submit-label="submitLabel"
    :heading="editHeading"
    :subtitle="editSubtitle"
    :type-options="typeOptions"
    :status-options="statusOptions"
    @update:model="Object.assign(form, $event)"
    @submit="saveVersion"
    @cancel="editing = false"
  />

  <!-- Review: history tree + version content -->
  <div v-else class="flex h-[calc(100vh-8rem)] flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <n-button quaternary size="small" class="mb-2 -ml-2" @click="router.push({ name: 'portal-knowledge' })">
          <template #icon><div class="i-tabler-arrow-left" /></template>
          {{ i18n.t('nav.knowledge') }}
        </n-button>
        <div v-if="knowledge" class="flex flex-wrap items-center gap-2">
          <h1 class="m-0 truncate text-xl font-bold leading-tight text-gray-900 dark:text-white sm:text-2xl">{{ knowledge.title }}</h1>
          <n-tag size="small" :bordered="false">{{ knowledge.type }}</n-tag>
          <n-tag size="small" :type="statusType(knowledge.status)" :bordered="false">{{ knowledge.status }}</n-tag>
          <n-tag size="small" type="info" :bordered="false">{{ scopeAtTag(knowledge) }}</n-tag>
        </div>
        <p v-if="knowledge" class="mt-1 truncate font-mono text-xs text-gray-500 dark:text-dark-400">{{ knowledge.slug }}</p>
      </div>
      <div v-if="knowledge" class="flex flex-wrap gap-2">
        <n-button type="primary" @click="startEdit">
          <template #icon><div class="i-tabler-edit" /></template>
          {{ editButtonLabel }}
        </n-button>
        <n-button quaternary type="error" @click="deleteKnowledge">
          <template #icon><div class="i-tabler-trash" /></template>
          {{ i18n.t('common.delete') }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="error" type="error" :bordered="false" closable @close="error = ''">
      {{ error }}
    </n-alert>

    <n-spin :show="loading" class="min-h-0 flex-1">
      <div
        v-if="knowledge"
        class="grid min-h-[28rem] flex-1 gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900 lg:grid-cols-[minmax(220px,280px)_1fr]"
      >
        <aside class="border-b border-gray-100 p-4 dark:border-dark-700 lg:border-b-0 lg:border-r">
          <VersionTimeline
            :versions="versions"
            :selected-id="selectedVersionId"
            :loading="historyLoading"
            :page="historyPage"
            :page-size="historyPageSize"
            :total="historyTotal"
            :total-pages="historyTotalPages"
            @select="onSelectVersion"
            @page-change="fetchHistory"
          />
        </aside>

        <section class="flex min-h-0 flex-col p-4 sm:p-5">
          <template v-if="selectedVersion">
            <div class="mb-4 flex shrink-0 items-start gap-3 border-b border-gray-100 pb-4 dark:border-dark-700">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-base font-semibold text-gray-900 dark:text-white">
                    Version {{ selectedVersion.version }}
                  </h2>
                  <n-tag v-if="selectedVersion.current" size="small" type="success" :bordered="false">Current</n-tag>
                </div>
                <p class="mt-1 text-sm text-gray-600 dark:text-dark-300">
                  {{ selectedVersion.changeSummary || 'No change note recorded.' }}
                </p>
                <div class="mt-2 flex flex-wrap gap-3 text-xs text-gray-400 dark:text-dark-500">
                  <span>{{ formatDate(selectedVersion.createdAt) }}</span>
                  <span v-if="selectedVersion.createdBy">by {{ selectedVersion.createdBy }}</span>
                  <span>{{ selectedVersion.content.length.toLocaleString() }} characters</span>
                </div>
              </div>
              <n-button
                class="shrink-0"
                size="small"
                quaternary
                type="error"
                :disabled="historyTotal <= 1"
                :title="historyTotal <= 1 ? 'Cannot delete the only version — delete the knowledge item instead' : 'Delete this version snapshot'"
                @click="deleteSelectedVersion"
              >
                <template #icon><div class="i-tabler-trash" /></template>
                {{ i18n.t('knowledge.deleteVersion') }}
              </n-button>
            </div>

            <div
              v-if="knowledge.scope.pathPatterns?.length"
              class="mb-4 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-dark-400"
            >
              <span class="rounded bg-gray-100 px-2 py-1 dark:bg-dark-800">
                paths: {{ knowledge.scope.pathPatterns.join(', ') }}
              </span>
            </div>

            <MarkdownPane
              class="min-h-0 flex-1"
              :model-value="selectedVersion.content"
              default-mode="rendered"
              surface-class="min-h-[16rem]"
            />
          </template>

          <n-empty v-else description="Select a version" class="my-auto py-12" />
        </section>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import VersionTimeline from './components/knowledge/VersionTimeline.vue'
import KnowledgeEditWorkspace from './components/knowledge/KnowledgeEditWorkspace.vue'
import MarkdownPane from './components/knowledge/MarkdownPane.vue'
import {
  apiFetch,
  relativeTime,
  scopeAtTag,
  type Knowledge,
  type KnowledgeVersion,
  type KnowledgeVersionPage,
} from '@/utils/api'
import {
  emptyKnowledgeForm,
  formFromKnowledge,
  knowledgePayloadFromForm,
  validateKnowledgeForm,
  type KnowledgeFormModel,
} from '@/utils/knowledgeForm'
import { useI18nStore } from '@/stores/i18n'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const i18n = useI18nStore()

const loading = ref(true)
const historyLoading = ref(false)
const saving = ref(false)
const editing = ref(false)
const error = ref('')
const knowledge = ref<Knowledge | null>(null)
const versions = ref<KnowledgeVersion[]>([])
const selectedVersionId = ref<number | ''>('')
const historyPage = ref(1)
const historyPageSize = 20
const historyTotal = ref(0)
const historyTotalPages = ref(1)

const form = reactive<KnowledgeFormModel>(emptyKnowledgeForm())

const typeOptions = ['context', 'rule', 'spec', 'workflow', 'runbook', 'decision', 'reference', 'prompt', 'skill', 'template'].map((value) => ({ label: value, value }))
const statusOptions = computed(() => [
  { label: i18n.t('knowledge.statusActive'), value: 'active' },
  { label: i18n.t('knowledge.statusInactive'), value: 'inactive' },
])

const selectedVersion = computed(() => versions.value.find((v) => v.id === selectedVersionId.value) ?? null)
const editButtonLabel = computed(() =>
  selectedVersion.value && !selectedVersion.value.current
    ? 'Restore as new version'
    : 'Edit as new version',
)
const editHeading = computed(() =>
  selectedVersion.value && !selectedVersion.value.current
    ? `Restore from v${selectedVersion.value.version}`
    : 'Edit as new version',
)
const editSubtitle = computed(() =>
  selectedVersion.value && !selectedVersion.value.current
    ? 'Saving creates a new current version from this snapshot. History stays intact.'
    : 'Snapshots are immutable. Saving creates a new version from this form.',
)
const submitLabel = computed(() =>
  selectedVersion.value && !selectedVersion.value.current
    ? 'Restore as new version'
    : 'Save version',
)

const slug = computed(() => String(route.params.slug ?? ''))

function statusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (status === 'active') return 'success'
  if (status === 'inactive') return 'warning'
  return 'default'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function onSelectVersion(id: number | string) {
  selectedVersionId.value = typeof id === 'number' ? id : Number(id)
}

function startEdit() {
  if (!knowledge.value) return
  const content = selectedVersion.value?.content ?? knowledge.value.content
  Object.assign(form, formFromKnowledge(knowledge.value, content))
  editing.value = true
}

async function fetchHistory(nextPage = historyPage.value) {
  if (!slug.value) return
  historyLoading.value = true
  try {
    const data = await apiFetch<KnowledgeVersionPage>(
      `/v1/knowledge/${encodeURIComponent(slug.value)}/versions?page=${nextPage}&pageSize=${historyPageSize}`,
    )
    knowledge.value = data.knowledge
    versions.value = data.versions ?? []
    historyPage.value = data.page ?? nextPage
    historyTotal.value = data.total ?? 0
    historyTotalPages.value = data.totalPages ?? 1
    if (!selectedVersionId.value || !versions.value.some((v) => v.id === selectedVersionId.value)) {
      selectedVersionId.value = versions.value.find((v) => v.current)?.id ?? versions.value[0]?.id ?? ''
    }
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load version history'
  } finally {
    historyLoading.value = false
    loading.value = false
  }
}

async function saveVersion() {
  const invalid = validateKnowledgeForm(form)
  if (invalid) {
    message.error(invalid)
    return
  }
  saving.value = true
  try {
    await apiFetch('/v1/knowledge', {
      method: 'POST',
      body: JSON.stringify(knowledgePayloadFromForm(form, { includeChangeSummary: true })),
    })
    message.success('Knowledge version saved')
    editing.value = false
    selectedVersionId.value = ''
    await fetchHistory(1)
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Failed to save knowledge')
  } finally {
    saving.value = false
  }
}

function deleteKnowledge() {
  if (!knowledge.value) return
  const title = knowledge.value.title
  const itemSlug = knowledge.value.slug
  dialog.warning({
    title: 'Delete knowledge',
    content: `Delete "${title}"? This removes its version history too.`,
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await apiFetch(`/v1/knowledge/${encodeURIComponent(itemSlug)}`, { method: 'DELETE' })
        message.success('Knowledge deleted')
        router.push({ name: 'portal-knowledge' })
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to delete knowledge')
        throw err
      }
    },
  })
}

function deleteSelectedVersion() {
  if (!knowledge.value || !selectedVersion.value) return
  if (historyTotal.value <= 1) {
    message.warning('Cannot delete the only remaining version. Delete the knowledge item instead.')
    return
  }
  const itemSlug = knowledge.value.slug
  const version = selectedVersion.value
  dialog.warning({
    title: 'Delete version',
    content: version.current
      ? `Delete current version v${version.version}? The previous version will become current.`
      : `Delete snapshot v${version.version}? This cannot be undone.`,
    positiveText: 'Delete version',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await apiFetch(
          `/v1/knowledge/${encodeURIComponent(itemSlug)}/versions/${encodeURIComponent(version.id)}`,
          { method: 'DELETE' },
        )
        message.success(`Version v${version.version} deleted`)
        selectedVersionId.value = ''
        await fetchHistory(historyPage.value)
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to delete version')
        throw err
      }
    },
  })
}

watch(
  () => route.params.slug,
  () => {
    editing.value = false
    selectedVersionId.value = ''
    loading.value = true
    fetchHistory(1)
  },
)

onMounted(() => fetchHistory(1))
</script>
