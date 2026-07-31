<template>
  <n-form :model="model" label-placement="top" @submit.prevent="$emit('submit')">
    <n-alert v-if="hint" type="info" :bordered="false" class="mb-4">
      {{ hint }}
    </n-alert>

    <div class="flex flex-col gap-4">
      <div class="grid gap-4 md:grid-cols-2">
        <n-form-item label="Title" required :show-feedback="false">
          <n-input
            :value="model.title"
            placeholder="A clear name agents can recognize"
            @update:value="patch('title', $event)"
          />
        </n-form-item>
        <n-form-item label="Slug" required :show-feedback="false">
          <n-input
            :value="model.slug"
            :disabled="slugDisabled"
            placeholder="stable-knowledge-slug"
            @update:value="patch('slug', $event)"
          />
        </n-form-item>
      </div>

      <n-form-item label="Summary" required :show-feedback="false">
        <n-input
          :value="model.summary"
          placeholder="One sentence agents see in search and context lists"
          @update:value="patch('summary', $event)"
        />
      </n-form-item>

      <n-form-item v-if="showChangeSummary" label="Change note" :show-feedback="false">
        <n-input
          :value="model.changeSummary"
          placeholder="Optional: what changed in this version"
          @update:value="patch('changeSummary', $event)"
        />
      </n-form-item>

      <div class="grid gap-4 md:grid-cols-2">
        <n-form-item label="Type" :show-feedback="false">
          <n-select :value="model.type" :options="typeOptions" @update:value="patch('type', $event)" />
        </n-form-item>
        <n-form-item label="Status" :show-feedback="false">
          <n-select :value="model.status" :options="statusOptions" @update:value="patch('status', $event)" />
        </n-form-item>
      </div>

      <n-form-item
        label="Project slug"
        feedback="Leave blank for global knowledge used across projects."
      >
        <n-input
          :value="model.projectSlug"
          placeholder="e.g. openkb"
          @update:value="patch('projectSlug', $event)"
        />
      </n-form-item>

      <n-form-item label="Path patterns" feedback="Comma-separated globs.">
        <n-input
          :value="model.pathPatterns"
          placeholder="backend/**, docs/**"
          @update:value="patch('pathPatterns', $event)"
        />
      </n-form-item>

      <n-form-item label="Markdown content" required :show-feedback="false">
        <MarkdownPane
          class="w-full"
          :model-value="model.content"
          editable
          default-mode="raw"
          placeholder="Write durable knowledge in Markdown."
          :autosize="{ minRows: 12, maxRows: 28 }"
          @update:model-value="patch('content', $event)"
        />
      </n-form-item>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <n-button @click="$emit('cancel')">Cancel</n-button>
      <n-button type="primary" attr-type="submit" :loading="saving">
        {{ submitLabel }}
      </n-button>
    </div>
  </n-form>
</template>

<script setup lang="ts">
import MarkdownPane from './MarkdownPane.vue'
import type { KnowledgeFormModel } from '@/utils/knowledgeForm'

export type { KnowledgeFormModel }

const props = withDefaults(
  defineProps<{
    model: KnowledgeFormModel
    saving?: boolean
    slugDisabled?: boolean
    showChangeSummary?: boolean
    submitLabel?: string
    hint?: string
    typeOptions: { label: string; value: string }[]
    statusOptions: { label: string; value: string }[]
  }>(),
  {
    saving: false,
    slugDisabled: false,
    showChangeSummary: false,
    submitLabel: 'Save',
    hint: '',
  },
)

const emit = defineEmits<{
  'update:model': [value: KnowledgeFormModel]
  submit: []
  cancel: []
}>()

function patch<K extends keyof KnowledgeFormModel>(key: K, value: KnowledgeFormModel[K]) {
  emit('update:model', { ...props.model, [key]: value })
}
</script>
