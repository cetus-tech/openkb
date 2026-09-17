<template>
  <n-card title="Technologies">
    <p class="mt-0 text-sm text-gray-500">Manage the names agents can send and authors can select. Each framework version has its own entry. Changes take effect on the next request.</p>
    <n-alert v-if="error" type="error" class="mb-3" :bordered="false">{{ error }}</n-alert>
    <template #header-extra>
      <n-button v-if="session.isAdmin" type="primary" size="small" @click="add">Add technology</n-button>
    </template>
    <n-data-table :columns="columns" :data="technologies" :loading="loading"
      :row-key="(row: Technology) => row.facet" :pagination="{ pageSize: 10 }" :scroll-x="700" />
  <n-modal :show="editing && session.isAdmin" preset="card" :title="existingFacet ? 'Edit technology' : 'Add technology'"
    class="w-[calc(100vw-2rem)] max-w-2xl" :closable="!saving" :mask-closable="!saving" :close-on-esc="!saving"
    @update:show="closeModal">
    <n-alert v-if="formError" type="error" class="mb-3" :bordered="false">{{ formError }}</n-alert>
    <n-form label-placement="top" :disabled="saving" @submit.prevent="save">
      <div class="grid gap-x-4 sm:grid-cols-2">
        <n-form-item label="Display name" required><n-input v-model:value="label" placeholder="e.g. Vue 3" /></n-form-item>
        <n-form-item label="Category"><n-select v-model:value="category" :disabled="Boolean(existingFacet)" :options="categories" /></n-form-item>
        <n-form-item label="Stable identifier" required feedback="Lower-case name. It cannot change after creation."><n-input v-model:value="identifier" :disabled="Boolean(existingFacet)" placeholder="e.g. vue" /></n-form-item>
        <n-form-item v-if="category === 'framework'" label="Major version" required><n-input v-model:value="major" :disabled="Boolean(existingFacet)" placeholder="e.g. 3" /></n-form-item>
      </div>
      <n-form-item label="Aliases" feedback="Comma-separated alternatives agents may send. Names and aliases must be unique across technologies."><n-input v-model:value="aliases" placeholder="e.g. vue3, vue@3, vue:3" /></n-form-item>
      <p class="mt-0 text-xs text-gray-500">Canonical ID: {{ facet }}. The display name is also accepted as an alias.</p>
      <n-space justify="end">
        <n-button :disabled="saving" @click="closeModal(false)">Cancel</n-button>
        <n-button type="primary" attr-type="submit" :loading="saving">Save technology</n-button>
      </n-space>
    </n-form>
  </n-modal>
  </n-card>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, type DataTableColumns } from 'naive-ui'
import { apiFetch, type Technology } from '@/utils/api'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const technologies = ref<Technology[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const editing = ref(false)
const existingFacet = ref('')
const label = ref('')
const category = ref('framework')
const identifier = ref('')
const major = ref('')
const aliases = ref('')
const categories = [{ label: 'Language', value: 'language' }, { label: 'Framework', value: 'framework' }]
const facet = computed(() => existingFacet.value || `${category.value}:${identifier.value.trim()}${category.value === 'framework' ? `:${major.value.trim()}` : ''}`)

const columns = computed<DataTableColumns<Technology>>(() => [
  { title: 'Name', key: 'label', sorter: (a, b) => a.label.localeCompare(b.label), minWidth: 150 },
  { title: 'Canonical ID', key: 'facet', minWidth: 220 },
  { title: 'Aliases', key: 'aliases', minWidth: 200, render: row => row.aliases.join(', ') || 'None' },
  ...(session.isAdmin ? [{
    title: 'Actions', key: 'actions', width: 90,
    render: (row: Technology) => h(NButton, { size: 'small', onClick: () => edit(row) }, { default: () => 'Edit' }),
  }] : []),
])
function closeModal(show: boolean) {
  if (!saving.value) editing.value = show
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    technologies.value = (await apiFetch<{ technologies: Technology[] }>('/v1/technologies')).technologies
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load technologies'
  } finally {
    loading.value = false
  }
}
function add() {
  existingFacet.value = label.value = identifier.value = major.value = aliases.value = ''
  category.value = 'framework'
  formError.value = ''
  editing.value = true
}
function edit(item: Technology) {
  existingFacet.value = item.facet
  const parts = item.facet.split(':')
  category.value = parts[0]!
  identifier.value = parts[1]!
  major.value = parts[2] ?? ''
  label.value = item.label
  aliases.value = item.aliases.join(', ')
  formError.value = ''
  editing.value = true
}
async function save() {
  if (saving.value) return
  saving.value = true
  formError.value = ''
  try {
    await apiFetch(`/v1/technologies/${encodeURIComponent(facet.value)}`, {
      method: 'PUT',
      body: JSON.stringify({ label: label.value, aliases: aliases.value.split(',').map(value => value.trim()).filter(Boolean) }),
    })
    editing.value = false
    await load()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Could not save technology'
  } finally {
    saving.value = false
  }
}
onMounted(() => { void session.loadSession(); void load() })
</script>
