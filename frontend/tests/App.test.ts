import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import naive, { NDialogProvider, NMessageProvider } from 'naive-ui'
import App from '../src/App.vue'
import router from '../src/router'

globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ hideDashboard: false, hidePortal: false, signupEnabled: false }),
})

describe('App providers', () => {
  it('provides Naive UI messages and dialogs to routed views', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [router, createPinia(), naive],
      },
    })

    expect(wrapper.findComponent(NDialogProvider).exists()).toBe(true)
    expect(wrapper.findComponent(NMessageProvider).exists()).toBe(true)
  })
})
