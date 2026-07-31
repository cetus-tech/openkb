<template>
  <div class="flex h-[calc(100vh-8rem)] flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <n-button quaternary size="small" class="mb-2 -ml-2" @click="$emit('cancel')">
          <template #icon><div class="i-tabler-arrow-left" /></template>
          {{ i18n.t('knowledge.backToReview') }}
        </n-button>
        <h1 class="m-0 truncate text-xl font-bold leading-tight text-gray-900 dark:text-white sm:text-2xl">
          {{ headingText }}
        </h1>
        <p v-if="subtitleText" class="mt-1 mb-0 text-xs text-gray-500 dark:text-dark-400">
          {{ subtitleText }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <n-button @click="$emit('cancel')">{{ i18n.t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="$emit('submit')">
          {{ submitLabelText }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="hint" type="info" :bordered="false">
      {{ hint }}
    </n-alert>

    <div
      class="flex min-h-[32rem] flex-1 gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900"
    >
      <!-- Left: live rendered preview -->
      <aside class="flex min-h-0 flex-1 flex-col border-b border-gray-100 dark:border-dark-700 lg:border-b-0 lg:border-r">
        <div class="shrink-0 border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 dark:border-dark-700 dark:text-dark-200">
          Preview
        </div>
        <n-scrollbar class="flex-1 min-h-0" :native-scrollbar="false" style="height: 100%">
          <div class="bg-gray-50 p-4 dark:bg-dark-800/80 min-h-full">
            <div v-if="previewHtml" class="prose max-w-none" v-html="previewHtml" />
            <n-empty v-else description="Start writing Markdown on the right to preview" size="small" class="py-12" />
          </div>
        </n-scrollbar>
      </aside>

      <!-- Right: metadata + raw markdown -->
      <section class="flex min-h-0 flex-1 flex-col">
        <div class="shrink-0 border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 dark:border-dark-700 dark:text-dark-200">
          Edit
        </div>
        <n-scrollbar class="flex-1 min-h-0" :native-scrollbar="false" style="height: 100%">
          <div class="p-4 sm:p-5 min-h-full">
            <n-form :model="model" label-placement="top" @submit.prevent="$emit('submit')">
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
                  <n-input
                    :value="model.content"
                    type="textarea"
                    placeholder="Write durable knowledge in Markdown."
                    :autosize="{ minRows: 16, maxRows: 40 }"
                    class="font-mono text-xs"
                    @update:value="patch('content', $event)"
                  />
                </n-form-item>
              </div>
            </n-form>
          </div>
        </n-scrollbar>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { KnowledgeFormModel } from '@/utils/knowledgeForm'
import { renderMarkdown } from '@/utils/markdown'
import { useI18nStore } from '@/stores/i18n'

const i18n = useI18nStore()

const props = withDefaults(
  defineProps<{
    model: KnowledgeFormModel
    saving?: boolean
    slugDisabled?: boolean
    showChangeSummary?: boolean
    submitLabel?: string
    heading?: string
    subtitle?: string
    hint?: string
    typeOptions: { label: string; value: string }[]
    statusOptions: { label: string; value: string }[]
  }>(),
  {
    saving: false,
    slugDisabled: true,
    showChangeSummary: true,
    hint: '',
  },
)

const headingText = computed(() => props.heading ?? i18n.t('knowledge.editKnowledge'))
const subtitleText = computed(() => props.subtitle ?? i18n.t('knowledge.editDefaultSubtitle'))
const submitLabelText = computed(() => props.submitLabel ?? i18n.t('knowledge.saveVersion'))

const emit = defineEmits<{
  'update:model': [value: KnowledgeFormModel]
  submit: []
  cancel: []
}>()

const previewHtml = ref('')
watchEffect(async () => {
  previewHtml.value = await renderMarkdown(props.model.content)
})

function patch<K extends keyof KnowledgeFormModel>(key: K, value: KnowledgeFormModel[K]) {
  emit('update:model', { ...props.model, [key]: value })
}
</script>
