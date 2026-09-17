<template>
  <n-card size="small" :bordered="true">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="m-0 text-sm font-semibold text-gray-900 dark:text-white">Context preview</h2>
        <p class="mt-1 mb-0 text-xs text-gray-500 dark:text-dark-400">
          Inspect the same applicability, path, and budget decisions an agent receives.
        </p>
      </div>
      <n-button size="small" type="primary" secondary :loading="loading" @click="preview">
        <template #icon><div class="i-tabler-adjustments-horizontal" /></template>
        Preview retrieval
      </n-button>
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <n-input v-model:value="projectSlug" placeholder="Project slug (optional)" />
      <n-input v-model:value="path" placeholder="Project-relative file path" />
      <TechnologySelect v-model="stacks" />
      <n-input-number v-model:value="maxTokens" :min="1" :max="12000" class="w-full" placeholder="Token budget" />
    </div>
    <p class="mt-2 mb-0 text-xs text-gray-500 dark:text-dark-400">
      Choose the technologies declared by the agent. Leave them empty to test requests with an unknown stack.
    </p>

    <n-alert v-if="error" class="mt-3" type="error" :bordered="false">
      {{ error }}
    </n-alert>

    <template v-if="result">
      <div class="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-dark-400">
        <n-tag size="small" :bordered="false">{{ result.returnedCount }}/{{ result.eligibleCount }} returned</n-tag>
        <n-tag size="small" :bordered="false">{{ result.estimatedTokens }} / {{ result.maxTokens }} estimated tokens</n-tag>
        <n-tag v-if="result.omittedCount" size="small" type="warning" :bordered="false">
          {{ result.omittedCount }} omitted
        </n-tag>
        <n-tag v-if="result.nextCursor" size="small" type="info" :bordered="false">
          more available via cursor
        </n-tag>
      </div>

      <n-alert v-if="result.diagnostics.missingStack || result.incompleteRequiredContext" class="mt-3" type="warning" :bordered="false">
        <template v-if="result.incompleteRequiredContext">
          Fetch full knowledge: {{ result.requiredFetch.join(', ') || 'Continue with the next cursor to retrieve remaining knowledge' }}.
        </template>
        <template v-else>
          Stack-specific knowledge was omitted because the stack is missing or unresolved.
        </template>
      </n-alert>

      <div v-if="result.entries.length" class="mt-3 divide-y divide-gray-100 rounded border border-gray-100 dark:divide-dark-800 dark:border-dark-700">
        <div v-for="entry in result.entries" :key="entry.slug" class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <span class="font-mono text-gray-700 dark:text-dark-200">{{ entry.slug }}</span>
          <span class="text-gray-500 dark:text-dark-400">{{ entry.delivery }} · {{ entry.reason }}</span>
        </div>
      </div>
      <n-empty v-else class="py-4" description="No eligible knowledge for this context" />
    </template>
  </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TechnologySelect from './TechnologySelect.vue'
import { apiFetch, type ContextResponse } from '@/utils/api'

const projectSlug = ref('')
const path = ref('')
const stacks = ref<string[]>([])
const maxTokens = ref<number | null>(4000)
const loading = ref(false)
const error = ref('')
const result = ref<ContextResponse | null>(null)

async function preview() {
  loading.value = true
  error.value = ''
  const query = new URLSearchParams()
  if (projectSlug.value.trim()) query.set('projectSlug', projectSlug.value.trim())
  if (path.value.trim()) query.set('path', path.value.trim())
  if (stacks.value.length) query.set('stack', stacks.value.join(','))
  if (maxTokens.value != null) query.set('maxTokens', String(maxTokens.value))
  try {
    result.value = await apiFetch<ContextResponse>(`/v1/context?${query.toString()}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to preview context'
  } finally {
    loading.value = false
  }
}
</script>
