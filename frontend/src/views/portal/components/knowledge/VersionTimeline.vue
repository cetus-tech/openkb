<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-3 flex items-center justify-between gap-2 px-1">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-400">Versions</h3>
      <span v-if="total" class="text-xs text-gray-400 dark:text-dark-500">{{ total }}</span>
    </div>

    <n-spin :show="loading" class="min-h-0 flex-1">
      <div v-if="versions.length" class="relative">
        <!-- continuous spine behind nodes -->
        <div
          v-if="versions.length > 1"
          class="pointer-events-none absolute bottom-3 left-[0.9375rem] top-3 w-px bg-gray-200 dark:bg-dark-600"
          aria-hidden="true"
        />

        <button
          v-for="version in versions"
          :key="version.id"
          type="button"
          class="group relative flex w-full gap-3 border-0 bg-transparent py-2.5 pl-2 pr-2 text-left outline-none transition-colors focus-visible:bg-primary-50/50 dark:focus-visible:bg-primary-900/20"
          :class="selectedId === version.id
            ? 'bg-primary-50/80 dark:bg-primary-900/25'
            : 'hover:bg-gray-50/80 dark:hover:bg-dark-800/60'"
          @click="$emit('select', version.id)"
        >
          <div class="relative z-10 flex w-4 shrink-0 flex-col items-center pt-1">
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full border-2"
              :class="versionDotClass(version)"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="text-sm font-semibold"
                :class="selectedId === version.id ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white'"
              >
                v{{ version.version }}
              </span>
              <n-tag v-if="version.current" size="tiny" type="success" :bordered="false">Current</n-tag>
            </div>
            <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-dark-400">
              {{ version.changeSummary || 'No change note' }}
            </p>
            <p class="mt-0.5 text-[11px] text-gray-400 dark:text-dark-500">
              {{ relativeTime(version.createdAt) }}
              <span v-if="version.createdBy"> · {{ version.createdBy }}</span>
            </p>
          </div>
        </button>
      </div>
      <n-empty v-else description="No versions" class="py-8" size="small" />
    </n-spin>

    <n-pagination
      v-if="total > pageSize"
      class="mt-3"
      :page="page"
      :page-count="totalPages"
      :page-size="pageSize"
      size="small"
      @update:page="$emit('page-change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { relativeTime, type KnowledgeVersion } from '@/utils/api'

const props = defineProps<{
  versions: KnowledgeVersion[]
  selectedId: number | string
  loading?: boolean
  page: number
  pageSize: number
  total: number
  totalPages: number
}>()

defineEmits<{
  select: [id: number]
  'page-change': [page: number]
}>()

function versionDotClass(version: KnowledgeVersion): string {
  // Always use filled dots so unselected nodes stay visible on light/dark panels
  if (props.selectedId === version.id) {
    return 'border-primary-500 bg-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
  }
  if (version.current) {
    return 'border-emerald-500 bg-emerald-500'
  }
  return 'border-gray-400 bg-gray-400 dark:border-gray-500 dark:bg-gray-500'
}
</script>
