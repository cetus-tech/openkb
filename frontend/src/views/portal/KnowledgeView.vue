<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">{{ i18n.t('knowledge.title') }}</h1>
        <p class="mt-4 mb-0 max-w-4xl text-sm text-gray-500 dark:text-dark-400">
          {{ i18n.t('knowledge.subtitle') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <n-button quaternary :loading="loading" title="Refresh knowledge" @click="fetchKnowledge">
          <template #icon><div class="i-tabler-refresh" /></template>
          {{ i18n.t('common.refresh') }}
        </n-button>
        <n-button type="primary" @click="openCreate">
          <template #icon><div class="i-tabler-plus" /></template>
          {{ i18n.t('knowledge.createKnowledge') }}
        </n-button>
        <n-button secondary :loading="importing" title="Import Markdown knowledge" @click="triggerImport">
          <template #icon><div class="i-tabler-upload" /></template>
          {{ i18n.t('knowledge.import') }}
        </n-button>
        <input
          ref="importInput"
          type="file"
          accept=".md,text/markdown,text/plain"
          multiple
          class="hidden"
          @change="onImportFiles"
        >
      </div>
    </div>

    <n-alert v-if="error" type="error" :bordered="false" closable @close="error = ''">
      {{ error }}
    </n-alert>

    <n-card size="small" :bordered="true">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center">
        <n-input
          v-model:value="query"
          clearable
          placeholder="Search title, summary, slug, or content"
          class="xl:w-72 sm:w-64 w-full"
          @keyup.enter="submitSearch"
          @clear="submitSearch"
        >
          <template #prefix><div class="i-tabler-search text-gray-400" /></template>
        </n-input>
        <n-button type="primary" secondary :loading="loading" title="Search knowledge" @click="submitSearch">
          <template #icon><div class="i-tabler-search" /></template>
          {{ i18n.t('common.search') }}
        </n-button>
        <n-select v-model:value="typeFilter" clearable :options="typeOptions" :placeholder="i18n.t('knowledge.allTypes')" class="xl:w-44" />
        <n-select v-model:value="statusFilter" clearable :options="statusFilterOptions" :placeholder="i18n.t('knowledge.allStatuses')" class="xl:w-48" />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-dark-800 dark:text-dark-400">
        <span>{{ countSummaryText }}</span>
      </div>
    </n-card>

    <n-spin :show="loading">
      <n-data-table
        v-if="documents.length"
        size="small"
        :bordered="true"
        :single-line="false"
        :columns="columns"
        :data="documents"
        :row-key="(row: Knowledge) => row.id"
        :row-props="rowProps"
      />
      <n-empty v-else :description="emptyDescriptionText">
        <template #extra>
          <div class="flex flex-wrap justify-center gap-2">
            <n-button v-if="hasFilters" quaternary @click="clearFilters">{{ i18n.t('knowledge.clearFilters') }}</n-button>
            <n-button v-else type="primary" @click="openCreate">
              <template #icon><div class="i-tabler-plus" /></template>
              {{ i18n.t('knowledge.createKnowledge') }}
            </n-button>
          </div>
        </template>
      </n-empty>
    </n-spin>

    <n-pagination
      v-if="total"
      v-model:page="page"
      v-model:page-size="pageSize"
      :item-count="total"
      show-size-picker
      :page-sizes="pageSizes"
      @update:page="fetchKnowledge"
      @update:page-size="onPageSizeChange"
    />

    <n-modal v-model:show="showEditor" preset="card" title="Add knowledge" class="w-[min(760px,calc(100vw-2rem))]">
      <KnowledgeEditorForm
        :model="form"
        :saving="saving"
        :slug-disabled="false"
        :show-change-summary="false"
        submit-label="Add knowledge"
        hint="Active knowledge is what MCP agents retrieve. Use scope fields only when you want to narrow who or when sees this item."
        :type-options="typeOptions"
        :status-options="statusOptions"
        @update:model="onFormUpdate"
        @submit="saveKnowledge"
        @cancel="showEditor = false"
      />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { useDialog, useMessage, NButton, NTag, type DataTableColumns } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import KnowledgeEditorForm from './components/knowledge/KnowledgeEditorForm.vue'
import { apiFetch, relativeTime, scopeAtTag, type Knowledge, type KnowledgePage } from '@/utils/api'
import {
  emptyKnowledgeForm,
  knowledgePayloadFromForm,
  validateKnowledgeForm,
  type KnowledgeFormModel,
} from '@/utils/knowledgeForm'
import { exportKnowledgeMarkdown, parseExportedMarkdown, slugify } from '@/utils/markdown'
import { useI18nStore } from '@/stores/i18n'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()
const router = useRouter()
const i18n = useI18nStore()
const documents = ref<Knowledge[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const query = ref('')
const typeFilter = ref<string | null>(null)
const statusFilter = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const totalPages = ref(1)
const showEditor = ref(false)
const slugTouched = ref(false)
const importing = ref(false)
const importInput = ref<HTMLInputElement | null>(null)

const form = reactive<KnowledgeFormModel>(emptyKnowledgeForm())

const typeOptions = ['context', 'rule', 'spec', 'workflow', 'runbook', 'decision', 'reference', 'prompt', 'skill', 'template'].map((value) => ({ label: value, value }))
const statusOptions = computed(() => [
  { label: i18n.t('knowledge.statusActive'), value: 'active' },
  { label: i18n.t('knowledge.statusInactive'), value: 'inactive' },
])
const statusFilterOptions = computed(() => [
  { label: i18n.t('proposals.statAll'), value: '' },
  ...statusOptions.value,
])
const pageSizes = [
  { label: '10/page', value: 10 },
  { label: '20/page', value: 20 },
  { label: '50/page', value: 50 },
]
const hasFilters = computed(() => Boolean(query.value.trim() || typeFilter.value || statusFilter.value))

const countSummaryText = computed(() => {
  if (i18n.locale === 'zh') {
    const statusText = statusFilter.value === 'active' ? '有效' : statusFilter.value === 'inactive' ? '非活跃' : ''
    return `${total.value} 条知识条目${statusText ? `（状态：${statusText}）` : ''}`
  }
  return `${total.value} knowledge items${statusFilter.value ? ` with status ${statusFilter.value}` : ''}`
})

const emptyDescriptionText = computed(() => {
  if (i18n.locale === 'zh') {
    return hasFilters.value ? '没有符合筛选条件的知识条目' : '暂无知识条目'
  }
  return hasFilters.value ? 'No knowledge matches these filters' : 'No knowledge items yet'
})

function statusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (status === 'active') return 'success'
  if (status === 'inactive') return 'warning'
  return 'default'
}

const columns = computed<DataTableColumns<Knowledge>>(() => [
  {
    title: i18n.t('common.title'),
    key: 'title',
    ellipsis: { tooltip: true },
    render: (row) =>
      h('div', { class: 'flex min-w-0 flex-wrap items-center gap-2' }, [
        h('span', { class: 'truncate font-medium text-gray-900 dark:text-white' }, row.title),
        h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => scopeAtTag(row) }),
        h(NTag, { size: 'small', bordered: false }, { default: () => row.type }),
        h(NTag, { size: 'small', type: statusType(row.status), bordered: false }, { default: () => row.status }),
      ]),
  },
  {
    title: i18n.t('knowledge.version'),
    key: 'version',
    width: 64,
    render: (row) => `v${row.version}`,
  },
  {
    title: i18n.t('knowledge.updated'),
    key: 'updatedAt',
    width: 100,
    render: (row) => h('span', { class: 'text-xs text-gray-500 dark:text-dark-400' }, relativeTime(row.updatedAt)),
  },
  {
    title: i18n.t('common.actions'),
    key: 'actions',
    width: 128,
    render: (row) => {
      const inactive = row.status === 'inactive'
      return h('div', { class: 'flex gap-1' }, [
        h(
          NButton,
          {
            size: 'small',
            quaternary: true,
            circle: true,
            title: i18n.t('knowledge.export'),
            onClick: (e: MouseEvent) => {
              e.stopPropagation()
              exportKnowledgeMarkdown(row)
              message.success(`Exported ${row.slug}.md`)
            },
          },
          { icon: () => h('div', { class: 'i-tabler-download' }) },
        ),
        h(
          NButton,
          {
            size: 'small',
            quaternary: true,
            circle: true,
            type: inactive ? 'success' : 'warning',
            title: inactive ? i18n.t('knowledge.setActive') : i18n.t('knowledge.setInactive'),
            onClick: (e: MouseEvent) => {
              e.stopPropagation()
              setKnowledgeStatus(row, inactive ? 'active' : 'inactive')
            },
          },
          { icon: () => h('div', { class: inactive ? 'i-tabler-player-play' : 'i-tabler-player-pause' }) },
        ),
        h(
          NButton,
          {
            size: 'small',
            quaternary: true,
            circle: true,
            type: 'error',
            title: i18n.t('common.delete'),
            onClick: (e: MouseEvent) => {
              e.stopPropagation()
              deleteKnowledge(row)
            },
          },
          { icon: () => h('div', { class: 'i-tabler-trash' }) },
        ),
      ])
    },
  },
])

function rowProps(row: Knowledge) {
  return {
    style: 'cursor: pointer',
    onClick: () => router.push({ name: 'portal-knowledge-detail', params: { slug: row.slug } }),
  }
}

function clearFilters() {
  query.value = ''
  typeFilter.value = null
  statusFilter.value = null
  page.value = 1
  fetchKnowledge()
}

function submitSearch() {
  page.value = 1
  fetchKnowledge()
}

function openCreate() {
  slugTouched.value = false
  Object.assign(form, emptyKnowledgeForm())
  showEditor.value = true
}

function onFormUpdate(next: KnowledgeFormModel) {
  const titleChanged = next.title !== form.title
  const slugChanged = next.slug !== form.slug
  if (slugChanged) slugTouched.value = true
  Object.assign(form, next)
  if (titleChanged && !slugTouched.value) {
    form.slug = slugify(form.title)
  }
}

async function fetchKnowledge() {
  loading.value = true
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
  if (query.value.trim()) params.set('q', query.value.trim())
  if (typeFilter.value) params.set('type', typeFilter.value)
  if (statusFilter.value) params.set('status', statusFilter.value)
  try {
    const data = await apiFetch<KnowledgePage>(`/v1/knowledge?${params.toString()}`)
    documents.value = data.knowledge ?? []
    total.value = data.total ?? 0
    page.value = data.page ?? 1
    pageSize.value = data.pageSize ?? pageSize.value
    totalPages.value = data.totalPages ?? 1
    error.value = ''
  } catch (err) {
    error.value = `Failed to load knowledge: ${err instanceof Error ? err.message : 'unknown error'}`
  } finally {
    loading.value = false
  }
}

async function saveKnowledge() {
  const invalid = validateKnowledgeForm(form)
  if (invalid) {
    message.error(invalid)
    return
  }
  saving.value = true
  try {
    await apiFetch('/v1/knowledge', { method: 'POST', body: JSON.stringify(knowledgePayloadFromForm(form)) })
    message.success('Knowledge added')
    showEditor.value = false
    await fetchKnowledge()
    router.push({ name: 'portal-knowledge-detail', params: { slug: form.slug.trim() } })
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Failed to save knowledge')
  } finally {
    saving.value = false
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function onImportFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return

  importing.value = true
  let ok = 0
  const failures: string[] = []
  try {
    let currentUserLabel = ''
    try {
      const session = await apiFetch<{ user: { name?: string; email?: string; id?: number } }>('/auth/session')
      currentUserLabel =
        session.user?.name?.trim()
        || session.user?.email?.trim()
        || (session.user?.id != null ? String(session.user.id) : '')
    } catch {
      currentUserLabel = ''
    }

    for (const file of files) {
      try {
        const text = await file.text()
        const parsed = parseExportedMarkdown(text, file.name)
        if (!parsed.slug || !parsed.title || !parsed.summary || !parsed.content.trim()) {
          throw new Error('Missing slug, title, summary, or content')
        }
        const createdBy = parsed.createdBy?.trim() || currentUserLabel
        await apiFetch('/v1/knowledge', {
          method: 'POST',
          body: JSON.stringify({
            slug: parsed.slug,
            title: parsed.title,
            summary: parsed.summary,
            type: parsed.type,
            status: parsed.status,
            content: parsed.content,
            scope: parsed.scope,
            changeSummary: `Imported from ${file.name}`,
            ...(createdBy ? { createdBy } : {}),
          }),
        })
        ok += 1
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'import failed'}`)
      }
    }
    if (ok) {
      message.success(ok === 1 ? 'Imported 1 knowledge item' : `Imported ${ok} knowledge items`)
      await fetchKnowledge()
    }
    if (failures.length) {
      error.value = `Import issues:\n${failures.join('\n')}`
      message.warning(failures.length === 1 ? failures[0]! : `${failures.length} files failed to import`)
    }
  } finally {
    importing.value = false
  }
}

function setKnowledgeStatus(knowledge: Knowledge, status: 'active' | 'inactive') {
  const makingInactive = status === 'inactive'
  dialog.warning({
    title: makingInactive ? 'Set inactive' : 'Set active',
    content: makingInactive
      ? `Set "${knowledge.title}" to inactive? MCP agents will no longer retrieve it.`
      : `Restore "${knowledge.title}" to active? MCP agents will retrieve it again.`,
    positiveText: makingInactive ? 'Set inactive' : 'Set active',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await apiFetch('/v1/knowledge', {
          method: 'POST',
          body: JSON.stringify({
            slug: knowledge.slug,
            title: knowledge.title,
            summary: knowledge.summary,
            type: knowledge.type,
            status,
            content: knowledge.content,
            scope: knowledge.scope ?? {},
            changeSummary: makingInactive ? 'Marked inactive' : 'Restored to active',
          }),
        })
        message.success(makingInactive ? 'Knowledge set to inactive' : 'Knowledge set to active')
        await fetchKnowledge()
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to update status')
        throw err
      }
    },
  })
}

function deleteKnowledge(knowledge: Knowledge) {
  dialog.warning({
    title: 'Delete knowledge',
    content: `Delete "${knowledge.title}"? This removes its version history too.`,
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await apiFetch(`/v1/knowledge/${encodeURIComponent(knowledge.slug)}`, { method: 'DELETE' })
        message.success('Knowledge deleted')
        await fetchKnowledge()
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to delete knowledge')
        throw err
      }
    },
  })
}

function onPageSizeChange() {
  page.value = 1
  fetchKnowledge()
}

watch([typeFilter, statusFilter], () => {
  page.value = 1
  fetchKnowledge()
})

onMounted(() => {
  fetchKnowledge()
  if (route.query.create === 'true') {
    openCreate()
    const nextQuery = { ...route.query }
    delete nextQuery.create
    router.replace({ path: route.path, query: nextQuery })
  }
})
</script>
