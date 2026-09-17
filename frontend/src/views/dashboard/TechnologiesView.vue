<template>
  <div class="space-y-6">
    <h1 class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">{{ i18n.t('nav.technologies') }}</h1>
    <TechnologyPanel />
  </div>
</template>

<script setup lang="ts">
import TechnologyPanel from './components/technologies/TechnologyPanel.vue'
import { useI18nStore } from '@/stores/i18n'
const i18n = useI18nStore()
</script>
