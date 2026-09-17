import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import naive, { NRadioGroup } from 'naive-ui'
import KnowledgeApplicabilityFields from '../src/views/dashboard/components/knowledge/KnowledgeApplicabilityFields.vue'
import { emptyKnowledgeForm, formFromKnowledge, knowledgePayloadFromForm, validateKnowledgeForm, type KnowledgeFormModel } from '../src/utils/knowledgeForm'
import type { Knowledge } from '../src/utils/api'

const doc = { slug: 'ci4', title: 'CI4', summary: 'Controllers', content: 'Guidance', type: 'skill', status: 'active', scope: {} } as Knowledge

describe('knowledge applicability authoring', () => {
  it('treats an empty scope as global', () => {
    const model = formFromKnowledge(doc, doc.content)
    const wrapper = mount(KnowledgeApplicabilityFields, { props: { model }, global: { plugins: [naive] } })
    expect(wrapper.findComponent(NRadioGroup).props('value')).toBe('any')
    expect(knowledgePayloadFromForm({ ...model, title: 'Updated' }).scope).toEqual({})
  })

  it('maps standing instructions to required context without stack restrictions', () => {
    const wrapper = mount(KnowledgeApplicabilityFields, { props: { model: emptyKnowledgeForm() }, global: { plugins: [naive] } })
    wrapper.findComponent(NRadioGroup).vm.$emit('update:value', 'any')
    const model = wrapper.emitted('update:model')![0]![0] as KnowledgeFormModel
    expect(knowledgePayloadFromForm(model).scope).toEqual({})
  })

  it('rejects empty technology requirements and preserves specified requirements', () => {
    const model = { ...formFromKnowledge(doc, doc.content), applicabilityMode: 'selected' as const }
    expect(validateKnowledgeForm(model)).toBe('Enter at least one required technology')
    expect(() => knowledgePayloadFromForm(model)).toThrow('Enter at least one required technology')
    expect(knowledgePayloadFromForm({ ...model, stacks: 'framework:codeigniter:4, language:php' }).scope)
      .toEqual({ stacks: ['framework:codeigniter:4', 'language:php'] })
  })
})
