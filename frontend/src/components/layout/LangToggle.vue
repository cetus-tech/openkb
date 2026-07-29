<template>
  <n-dropdown
    trigger="click"
    :options="langOptions"
    @select="handleSelect"
  >
    <n-button
      quaternary
      size="small"
      class="flex items-center gap-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
    >
      <template #icon>
        <div class="i-heroicons-outline-globe-alt text-sm" />
      </template>
      <span>{{ currentLabel }}</span>
    </n-button>
  </n-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore, type Locale } from '@/stores/i18n'

const i18n = useI18nStore()

const currentLabel = computed(() => (i18n.locale === 'en' ? 'EN' : '中文'))

const langOptions = computed(() => [
  {
    label: 'English',
    key: 'en',
  },
  {
    label: '简体中文',
    key: 'zh',
  },
])

function handleSelect(key: string) {
  i18n.setLocale(key as Locale)
}
</script>
