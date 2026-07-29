import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import naive, { NConfigProvider } from 'naive-ui'
import ProposalDetailView from '../src/views/portal/ProposalDetailView.vue'

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual('naive-ui')
  return {
    ...actual as any,
    useMessage: () => ({
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    }),
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
  history: createMemoryHistory('/dashboard/proposals/1'),
  routes: [
    { path: '/dashboard/proposals', name: 'portal-proposals', component: { template: '<div>Proposals</div>' } },
    { path: '/dashboard/proposals/:id', name: 'portal-proposal-detail', component: ProposalDetailView },
    { path: '/dashboard/knowledge', name: 'portal-knowledge', component: { template: '<div>Knowledge</div>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div>Fallback</div>' } },
  ],
})

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

function factory() {
  return mount(
    {
      components: { NConfigProvider, ProposalDetailView },
      template: '<n-config-provider><ProposalDetailView /></n-config-provider>',
    },
    {
      global: {
        plugins: [router, createPinia(), naive],
      },
    }
  )
}

describe('ProposalDetailView', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    mockFetch.mockResolvedValue(jsonResponse({ proposals: [] }))
    await router.push('/dashboard/proposals/1')
    await router.isReady()
  })

  it('fetches and displays proposal details with review guidance', async () => {
    localStorage.setItem('openkb_session', 'active')
    mockFetch.mockResolvedValueOnce(jsonResponse({
      proposal: {
        id: 1,
        title: 'New Skill',
        summary: 'Add python skill',
        status: 'open',
        type: 'skill',
        slug: 'python-skill',
        proposedContentMarkdown: 'skill content',
        scope: { projectSlug: 'openkb' },
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    })).mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, false, 404))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).toContain('New Skill')
    expect(wrapper.text()).toContain('skill content')
    expect(wrapper.text()).toContain('open')
    expect(wrapper.text()).toContain('creates')
    expect(wrapper.text()).toContain('python-skill')
    expect(wrapper.text()).toContain('@openkb')
    expect(wrapper.text()).toContain('Project')
  })

  it('shows action buttons for open proposals', async () => {
    localStorage.setItem('openkb_session', 'active')
    mockFetch.mockResolvedValueOnce(jsonResponse({
      proposal: { id: 1, title: 'P', status: 'open', slug: 'p', proposedContentMarkdown: '...', scope: {} },
    })).mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, false, 404))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).toContain('Approve')
    expect(wrapper.text()).toContain('Reject')
  })

  it('approves proposals with session credentials via apiFetch', async () => {
    localStorage.setItem('openkb_session', 'active')
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: { id: 1, title: 'P', status: 'open', slug: 'p', proposedContentMarkdown: '...', scope: {} },
      }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, false, 404))
      .mockResolvedValueOnce(jsonResponse({ proposal: { id: 1, status: 'approved' } }))
      .mockResolvedValueOnce(jsonResponse({
        proposal: { id: 1, title: 'P', status: 'approved', slug: 'p', proposedContentMarkdown: '...', scope: {} },
      }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, false, 404))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 100))
    const approve = wrapper.findAll('button').find((button) => button.text().includes('Approve'))
    expect(approve).toBeTruthy()
    await approve!.trigger('click')
    await new Promise((r) => setTimeout(r, 50))

    const patchCall = mockFetch.mock.calls.find((call) => String(call[0]).includes('/v1/proposals/1') && call[1]?.method === 'PATCH')
    expect(patchCall).toBeTruthy()
    expect(patchCall?.[1]?.credentials).toBe('include')
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ status: 'approved' })
  })

  it('allows editing an open proposal before approval', async () => {
    localStorage.setItem('openkb_session', 'active')
    mockFetch.mockResolvedValueOnce(jsonResponse({
      proposal: { id: 1, title: 'Old Title', summary: 'Old Summary', status: 'open', slug: 'p', proposedContentMarkdown: 'Old Markdown', scope: {} },
    })).mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, false, 404))

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 100))

    const editBtn = wrapper.findAll('button').find((button) => button.text().includes('Edit'))
    expect(editBtn).toBeTruthy()
    await editBtn!.trigger('click')
    await new Promise((r) => setTimeout(r, 20))

    expect(wrapper.text()).toContain('Editing mode')
    expect(wrapper.text()).toContain('Save edits')
    expect(wrapper.text()).toContain('Approve with edits')
  })
})
