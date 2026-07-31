import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import naive, { NConfigProvider } from 'naive-ui'
import SettingsView from '../src/views/portal/SettingsView.vue'

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual('naive-ui')
  return {
    ...actual as any,
    useDialog: () => ({
      warning: (opts: { onPositiveClick?: () => unknown }) => {
        void opts.onPositiveClick?.()
      },
      error: (opts: { onPositiveClick?: () => unknown }) => {
        void opts.onPositiveClick?.()
      },
    }),
  }
})

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const router = createRouter({
  history: createMemoryHistory('/dashboard/settings'),
  routes: [
    { path: '/dashboard/settings', name: 'portal-settings', component: SettingsView },
    { path: '/auth/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div>Fallback</div>' } },
  ],
})

function factory() {
  return mount(
    {
      components: { NConfigProvider, SettingsView },
      template: '<n-config-provider><SettingsView /></n-config-provider>',
    },
    {
      global: {
        plugins: [router, createPinia(), naive],
        stubs: { 'router-link': true },
      },
    }
  )
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ tokens: [] }) })
  })

  it('renders heading and MCP token management', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.text()).toContain('Tokens')
    expect(wrapper.text()).toContain('Create Token')
    expect(wrapper.text()).not.toContain('Connect an MCP client')
  })

  it('keeps browser session details out of the settings content', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.text()).not.toContain('Browser session')
    expect(wrapper.text()).not.toContain('Signed in')
    expect(wrapper.text()).not.toContain('Saved in this browser')
  })

  it('does not display the saved bearer token as the browser session', () => {
    localStorage.setItem('openkb_token', 'okb_abcdef1234567890')
    const wrapper = factory()
    expect(wrapper.text()).not.toContain('okb_abcdef1234567890')
  })

  it('renders the browser sign out button', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('Log out')
  })

  it('clears token and redirects on logout', async () => {
    localStorage.setItem('openkb_token', 'okb_testtoken')
    localStorage.setItem('openkb_session', 'active')
    const wrapper = factory()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Log out'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await new Promise((r) => setTimeout(r, 10))

    expect(localStorage.getItem('openkb_token')).toBeNull()
    expect(localStorage.getItem('openkb_session')).toBeNull()
  })

  it('fetches and displays MCP tokens with full values from the server', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        tokens: [
          { id: 'tok_1', name: 'cli', tokenPrefix: 'okb_12345678...', value: 'okb_12345678abcdefgh87654321', createdAt: new Date().toISOString() },
          { id: 'tok_2', name: 'web', tokenPrefix: 'okb_87654321...', value: 'okb_87654321abcdefgh12345678', createdAt: new Date(Date.now() - 86400000).toISOString(), lastUsedAt: new Date().toISOString() },
        ],
      }),
      json: async () => ({
        tokens: [
          { id: 'tok_1', name: 'cli', tokenPrefix: 'okb_12345678...', value: 'okb_12345678abcdefgh87654321', createdAt: new Date().toISOString() },
          { id: 'tok_2', name: 'web', tokenPrefix: 'okb_87654321...', value: 'okb_87654321abcdefgh12345678', createdAt: new Date(Date.now() - 86400000).toISOString(), lastUsedAt: new Date().toISOString() },
        ],
      }),
    })

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('cli')
    expect(wrapper.text()).toContain('web')
    expect(wrapper.text()).toContain('okb_1234...')
    expect(wrapper.text()).toContain('okb_8765...')
    expect(wrapper.text()).not.toContain('admin')
    const copyButtons = wrapper.findAll('button').filter((b) => b.text().includes('Copy') || b.attributes('title')?.includes('Copy'))
    expect(copyButtons.length).toBeGreaterThanOrEqual(2)
    for (const btn of copyButtons) {
      expect(btn.attributes('disabled')).toBeUndefined()
    }
  })

  it('shows error on MCP token API failure', async () => {
    localStorage.setItem('openkb_token', 'test-token')
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('Failed to load MCP tokens')
  })
})
