import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import naive, { NConfigProvider } from 'naive-ui'
import DashboardView from '../src/views/dashboard/DashboardView.vue'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const router = createRouter({
  history: createMemoryHistory('/dashboard'),
  routes: [
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/dashboard/knowledge', name: 'dashboard-knowledge', component: { template: '<div>Knowledge</div>' } },
    { path: '/dashboard/knowledge/:slug', name: 'dashboard-knowledge-detail', component: { template: '<div>Detail</div>' } },
    { path: '/auth/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div>Fallback</div>' } },
  ],
})

function factory() {
  return mount(
    {
      components: { NConfigProvider, DashboardView },
      template: '<n-config-provider><DashboardView /></n-config-provider>',
    },
    {
      global: {
        plugins: [router, createPinia(), naive],
        stubs: {
          'router-link': { template: '<a><slot /></a>' },
        },
      },
    }
  )
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockFetch.mockResolvedValue(jsonResponse({ knowledge: [], agents: [], proposals: [], tokens: [], ok: true, total: 0 }))
    localStorage.setItem('openkb_token', 'test-token')
  })

  it('renders dashboard heading, setup guidance, and recent knowledge', async () => {
    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain('Add Knowledge')
    expect(wrapper.text()).toContain('Recent Active Knowledge')
    expect(wrapper.text()).toContain('Getting started')
    expect(wrapper.text()).toContain('Recent Connected Agents')
    expect(wrapper.text()).not.toContain('MCP control center')
    expect(wrapper.text()).not.toContain('Memory workflow')
  })


  it('shows stat cards when data loads', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ knowledge: [{ id: 'd1', title: 'One', summary: 'Summary', slug: 'one', type: 'rule', scope: {}, version: 1 }], total: 1 }))
      .mockResolvedValueOnce(jsonResponse({ agents: [] }))
      .mockResolvedValueOnce(jsonResponse({ proposals: [] }))
      .mockResolvedValueOnce(jsonResponse({ tokens: [{ id: 't1', name: 'codex' }] }))
    localStorage.setItem('openkb_token', 'test-token')

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('1') // knowledge count
    expect(wrapper.text()).toContain('Create MCP token')
  })

  it('allows user to dismiss setup guide and saves to app_settings DB', async () => {
    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('Getting started')

    const dismissBtn = wrapper.find('button[title="Dismiss setup guide"]')
    expect(dismissBtn.exists()).toBe(true)
    await dismissBtn.trigger('click')

    expect(wrapper.text()).not.toContain('Getting started')
    const putCall = mockFetch.mock.calls.find((call) => String(call[0]).includes('/v1/settings/setup_guide_dismissed') && call[1]?.method === 'PUT')
    expect(putCall).toBeTruthy()
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ value: 'true' })
  })

  it('hides setup guide if setup_guide_dismissed is true in app_settings', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ knowledge: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse({ agents: [] }))
      .mockResolvedValueOnce(jsonResponse({ proposals: [] }))
      .mockResolvedValueOnce(jsonResponse({ tokens: [] }))
      .mockResolvedValueOnce(jsonResponse({ key: 'setup_guide_dismissed', value: 'true' }))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 20))
    expect(wrapper.text()).not.toContain('Getting started')
  })

  it('permanently hides setup guide when all steps were completed once', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ knowledge: [{ id: 'k1' }], total: 1 }))
      .mockResolvedValueOnce(jsonResponse({ agents: [{ id: 'a1', name: 'agent' }] }))
      .mockResolvedValueOnce(jsonResponse({ proposals: [], counts: { all: 0, open: 0, approved: 0, rejected: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ tokens: [{ id: 't1' }] }))
      .mockResolvedValueOnce(jsonResponse({ key: 'setup_guide_dismissed', value: 'false' }))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 20))
    const putCall = mockFetch.mock.calls.find((call) => String(call[0]).includes('/v1/settings/setup_guide_dismissed') && call[1]?.method === 'PUT')
    expect(putCall).toBeTruthy()
    expect(wrapper.text()).not.toContain('Getting started')
  })
})
