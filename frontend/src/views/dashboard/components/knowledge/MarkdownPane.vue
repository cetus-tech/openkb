<template>
  <div class="flex min-h-0 flex-col">
    <div v-if="label" class="mb-2 text-sm font-medium text-gray-700 dark:text-dark-200">{{ label }}</div>
    <n-tabs v-model:value="mode" type="line" size="small" animated>
      <n-tab-pane name="rendered" tab="Rendered" display-directive="show">
        <div
          class="markdown-pane-surface min-h-0 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/80"
          :class="surfaceClass"
        >
          <div v-if="html" class="prose max-w-none" v-html="html" />
          <n-empty v-else description="No content" size="small" class="py-8" />
        </div>
      </n-tab-pane>
      <n-tab-pane name="raw" tab="Raw" display-directive="show">
        <n-input
          :value="modelValue"
          type="textarea"
          :readonly="!editable"
          :placeholder="placeholder"
          :autosize="autosize"
          class="markdown-pane-raw font-mono text-xs"
          :class="surfaceClass"
          @update:value="onRawUpdate"
        />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(
  defineProps<{
    modelValue: string
    editable?: boolean
    label?: string
    placeholder?: string
    /** Prefer rendered or raw when the pane mounts / content source changes. */
    defaultMode?: 'rendered' | 'raw'
    surfaceClass?: string
    autosize?: boolean | { minRows?: number; maxRows?: number }
  }>(),
  {
    editable: false,
    label: '',
    placeholder: 'Markdown content',
    defaultMode: 'rendered',
    surfaceClass: '',
    autosize: () => ({ minRows: 12, maxRows: 28 }),
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const mode = ref<'rendered' | 'raw'>(props.defaultMode)

watch(
  () => props.defaultMode,
  (value) => {
    mode.value = value
  },
)

watch(
  () => props.editable,
  (editable) => {
    if (editable && props.defaultMode === 'raw') mode.value = 'raw'
  },
  { immediate: true },
)

const html = ref('')
watchEffect(async () => {
  html.value = await renderMarkdown(props.modelValue)
})

function onRawUpdate(value: string) {
  if (!props.editable) return
  emit('update:modelValue', value)
}
</script>
