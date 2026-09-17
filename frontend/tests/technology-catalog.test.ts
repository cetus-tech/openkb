import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import naive, { NInput, NSelect, NModal, NDataTable } from 'naive-ui'
import TechnologyPanel from '../src/views/dashboard/components/technologies/TechnologyPanel.vue'
import TechnologySelect from '../src/views/dashboard/components/knowledge/TechnologySelect.vue'
import { useSessionStore } from '../src/stores/session'
import { apiFetch, type Technology } from '../src/utils/api'

vi.mock('../src/utils/api', () => ({ apiFetch: vi.fn() }))
const catalog: Technology[] = [{ facet: 'framework:custom:9', label: 'Custom 9', aliases: ['c9'] }]
beforeEach(() => vi.mocked(apiFetch).mockReset())

function panel(role: 'admin' | 'member') {
  const pinia = createPinia()
  const session = useSessionStore(pinia)
  session.role = role
  session.loaded = true
  return mount(TechnologyPanel, { global: { plugins: [pinia, naive], stubs: { teleport: true } } })
}

describe('technology catalog UI', () => {
  it('lets admins create a technology and refreshes the catalog after saving', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ technologies: catalog })
    const wrapper = panel('admin')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Add technology')!.trigger('click')
    const modal = wrapper.findComponent(NModal)
    expect(modal.props('show')).toBe(true)
    const inputs = modal.findAllComponents(NInput)
    inputs[0]!.vm.$emit('update:value', 'New framework 5')
    inputs[1]!.vm.$emit('update:value', 'new-framework')
    inputs[2]!.vm.$emit('update:value', '5')
    inputs[3]!.vm.$emit('update:value', 'nf5')
    await modal.find('form').trigger('submit')
    await flushPromises()
    expect(apiFetch).toHaveBeenCalledWith('/v1/technologies/framework%3Anew-framework%3A5', {
      method: 'PUT', body: JSON.stringify({ label: 'New framework 5', aliases: ['nf5'] }),
    })
    expect(modal.props('show')).toBe(false)
    expect(wrapper.findComponent(NDataTable).props('data')).toEqual(catalog)
    expect(wrapper.text()).toContain('Custom 9')
  })

  it('opens a populated edit modal and keeps save errors in the modal', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ technologies: catalog })
    const wrapper = panel('admin')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Edit')!.trigger('click')
    const modal = wrapper.findComponent(NModal)
    expect(modal.props('show')).toBe(true)
    expect(modal.props('title')).toBe('Edit technology')
    const inputs = modal.findAllComponents(NInput)
    expect(inputs[0]!.props('value')).toBe('Custom 9')
    expect(inputs[1]!.props('disabled')).toBe(true)
    expect(inputs[2]!.props('disabled')).toBe(true)
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Alias already belongs to another technology'))
    await modal.find('form').trigger('submit')
    await flushPromises()
    expect(modal.props('show')).toBe(true)
    expect(modal.text()).toContain('Alias already belongs')
    await modal.findAll('button').find(button => button.text() === 'Cancel')!.trigger('click')
    expect(modal.props('show')).toBe(false)
  })

  it('shows members the catalog without management controls', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ technologies: catalog })
    const wrapper = panel('member')
    await flushPromises()
    expect(wrapper.text()).toContain('Custom 9')
    expect(wrapper.text()).not.toContain('Add technology')
    expect(wrapper.findAll('button').some(button => button.text() === 'Edit')).toBe(false)
  })

  it('uses managed names and aliases in the picker and retains legacy selections', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ technologies: catalog })
    const wrapper = mount(TechnologySelect, { props: { modelValue: ['framework:legacy:1'] }, global: { plugins: [naive], stubs: { RouterLink: true } } })
    await flushPromises()
    const select = wrapper.findComponent(NSelect)
    expect(select.props('options')).toEqual([
      { label: 'Custom 9', value: 'framework:custom:9' },
      { label: 'framework:legacy:1 (not in catalog)', value: 'framework:legacy:1' },
    ])
    const filter = select.props('filter') as Function
    expect(filter('c9', { value: 'framework:custom:9', label: 'Custom 9' })).toBe(true)
  })
})
