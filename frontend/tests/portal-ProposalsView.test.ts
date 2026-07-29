import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import naive, { NConfigProvider } from 'naive-ui'
import ProposalsView from '../src/views/portal/ProposalsView.vue'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const router = createRouter({
  history: createMemoryHistory('/dashboard/proposals'),
  routes: [
    { path: '/dashboard/proposals', name: 'portal-proposals', component: ProposalsView },
    { path: '/dashboard/proposals/:id', name: 'portal-proposal-detail', component: { template: '<div></div>' } as any },
    { path: '/dashboard/knowledge', name: 'portal-knowledge', component: { template: '<div></div>' } as any },
    { path: '/dashboard/agents', name: 'portal-agents', component: { template: '<div></div>' } as any },
    { path: '/:pathMatch(.*)*', component: { template: '<div>Fallback</div>' } },
  ],
})

function factory() {
  return mount(
    {
      components: { NConfigProvider, ProposalsView },
      template: '<n-config-provider><ProposalsView /></n-config-provider>',
    },
    {
      global: {
        plugins: [router, createPinia(), naive],
      },
    }
  )
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

function makeProposal(id: number, overrides = {}) {
  return {
    id,
    title: `Proposal ${id}`,
    summary: 'A sample proposal',
    status: 'open',
    slug: `slug-${id}`,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ProposalsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders heading and description', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('Proposals')
    expect(wrapper.text()).toContain('Review agent memories')
  })

  it('shows an authentication error when no browser session is available', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Not authenticated' }, false, 401))
    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('Not authenticated')
  })

  it('shows empty state when no proposals with token', async () => {
    localStorage.setItem('openkb_token', 'test-token')
    mockFetch.mockResolvedValueOnce(jsonResponse({
      proposals: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      counts: { all: 0, open: 0, approved: 0, rejected: 0 },
    }))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('No agent changes waiting for approval')
  })

  it('renders open proposals from the paginated API', async () => {
    localStorage.setItem('openkb_token', 'test-token')
    mockFetch.mockResolvedValueOnce(jsonResponse({
      proposals: [makeProposal(1)],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      counts: { all: 2, open: 1, approved: 1, rejected: 0 },
    }))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 30))
    expect(wrapper.text()).toContain('Proposal 1')
    expect(wrapper.text()).toContain('1 proposals')
  })

  it('shows error on API failure', async () => {
    localStorage.setItem('openkb_token', 'test-token')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '',
      json: async () => ({}),
    })

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.text()).toContain('Forbidden')
  })
})
