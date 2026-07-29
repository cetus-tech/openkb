<template>
  <nav class="sticky top-24">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
      {{ i18n.t('docs.title') }}
    </h3>

    <ul class="space-y-0.5">
      <li v-for="doc in docs" :key="doc.path">
        <router-link
          :to="`/docs/${doc.path}`"
          class="block rounded-lg px-3 py-1.5 text-sm transition-colors"
          :class="doc.path === currentPath
            ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white'
          "
        >
          {{ doc.title }}
        </router-link>
      </li>
    </ul>

    <p v-if="!docs.length" class="text-sm text-gray-400 dark:text-dark-500">
      {{ i18n.t('docs.noDocs') }}
    </p>
  </nav>
</template>

<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'

const i18n = useI18nStore()

defineProps<{
  docs: { path: string; title: string }[]
  currentPath: string
}>()
</script>
