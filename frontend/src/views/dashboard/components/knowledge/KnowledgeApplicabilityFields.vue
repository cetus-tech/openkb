<template>
  <n-form-item label="Knowledge applicability" :feedback="hint">
    <n-radio-group :value="model.applicabilityMode" @update:value="selectApplicability">
      <n-space vertical>
        <n-radio value="any">Global</n-radio>
        <n-radio value="selected">Technology-specific</n-radio>
      </n-space>
    </n-radio-group>
  </n-form-item>
  <n-form-item v-if="model.applicabilityMode === 'selected'" label="Required technologies"
    feedback="The agent's request must match every selected technology. Select the framework for framework-specific guidance.">
    <TechnologySelect :model-value="selectedTechnologies" @update:model-value="emit('update:model', { ...model, stacks: $event.join(', ') })" />
  </n-form-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeFormModel } from '@/utils/knowledgeForm'
import TechnologySelect from './TechnologySelect.vue'

const props = defineProps<{ model: KnowledgeFormModel }>()
const emit = defineEmits<{ 'update:model': [value: KnowledgeFormModel] }>()
const selectedTechnologies = computed(() => props.model.stacks.split(',').map(value => value.trim()).filter(Boolean))
const hint = computed(() => {
  if (props.model.applicabilityMode === 'selected') return 'Included whenever the request matches every selected technology. Project and path restrictions still apply.'
  return 'Included regardless of technology stack. Leave project and paths blank to apply everywhere.'
})
function selectApplicability(value: 'any' | 'selected') {
  emit('update:model', { ...props.model, applicabilityMode: value })
}
</script>
