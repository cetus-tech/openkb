<template>
  <div class="w-full">
    <n-select :value="modelValue" :options="options" multiple filterable :filter="filterTechnology" :loading="loading"
      placeholder="Select technologies" @update:value="emit('update:modelValue', $event)" />
    <p v-if="error" class="mt-1 text-xs text-red-600">{{ error }} <n-button text size="tiny" @click="load">Retry</n-button></p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SelectOption } from 'naive-ui'
import { apiFetch, type Technology } from '@/utils/api'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const technologies = ref<Technology[]>([])
const loading = ref(false)
const error = ref('')
const options = computed(() => {
  const known = technologies.value.map(item => ({ label: item.label, value: item.facet }))
  return [...known, ...props.modelValue.filter(value => !known.some(item => item.value === value)).map(value => ({ label: `${value} (not in catalog)`, value }))]
})
function filterTechnology(pattern: string, option: SelectOption) {
  const item = technologies.value.find(technology => technology.facet === option.value)
  return [option.label, option.value, ...(item?.aliases ?? [])].join(' ').toLowerCase().includes(pattern.toLowerCase())
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
onMounted(load)
</script>
