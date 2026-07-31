import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import naive, { NConfigProvider } from 'naive-ui';
import ProposalsView from '../src/views/dashboard/ProposalsView.vue';

vi.mock('naive-ui', async () => {
    const actual = await vi.importActual('naive-ui');
    return {
        ...(actual as any),
        useDialog: () => ({
            warning: (opts: { onPositiveClick?: () => unknown }) => {
                void opts.onPositiveClick?.();
            },
        }),
    };
});

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const router = createRouter({
    history: createMemoryHistory('/dashboard/proposals'),
    routes: [
        {
            path: '/dashboard/proposals',
            name: 'dashboard-proposals',
            component: ProposalsView,
        },
        {
            path: '/dashboard/proposals/:id',
            name: 'dashboard-proposal-detail',
            component: { template: '<div></div>' } as any,
        },
        {
            path: '/dashboard/knowledge',
            name: 'dashboard-knowledge',
            component: { template: '<div></div>' } as any,
        },
        {
            path: '/dashboard/agents',
            name: 'dashboard-agents',
            component: { template: '<div></div>' } as any,
        },
        {
            path: '/:pathMatch(.*)*',
            component: { template: '<div>Fallback</div>' },
        },
    ],
});

function factory() {
    return mount(
        {
            components: { NConfigProvider, ProposalsView },
            template:
                '<n-config-provider><ProposalsView /></n-config-provider>',
        },
        {
            global: {
                plugins: [router, createPinia(), naive],
            },
        },
    );
}

function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
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
    };
}

describe('ProposalsView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders heading and description', () => {
        const wrapper = factory();
        expect(wrapper.text()).toContain('Proposals');
        expect(wrapper.text()).toContain('Review and approve proposed changes');
    });

    it('shows an authentication error when no browser session is available', async () => {
        mockFetch.mockResolvedValueOnce(
            jsonResponse({ message: 'Not authenticated' }, false, 401),
        );
        const wrapper = factory();
        await new Promise((r) => setTimeout(r, 10));
        expect(wrapper.text()).toContain('Not authenticated');
    });

    it('shows empty state when no proposals with token', async () => {
        localStorage.setItem('openkb_token', 'test-token');
        mockFetch.mockResolvedValueOnce(
            jsonResponse({
                proposals: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 1,
                counts: { all: 0, open: 0, approved: 0, rejected: 0 },
            }),
        );

        const wrapper = factory();
        await new Promise((r) => setTimeout(r, 10));
        expect(wrapper.text()).toContain(
            'No agent changes waiting for approval',
        );
    });

    it('renders open proposals from the paginated API', async () => {
        localStorage.setItem('openkb_token', 'test-token');
        mockFetch.mockResolvedValueOnce(
            jsonResponse({
                proposals: [makeProposal(1)],
                total: 1,
                page: 1,
                pageSize: 20,
                totalPages: 1,
                counts: { all: 2, open: 1, approved: 1, rejected: 0 },
            }),
        );

        const wrapper = factory();
        await new Promise((r) => setTimeout(r, 30));
        expect(wrapper.text()).toContain('Proposal 1');
        expect(wrapper.text()).toContain('1 proposals');
    });

    it('shows error on API failure', async () => {
        localStorage.setItem('openkb_token', 'test-token');
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            text: async () => '',
            json: async () => ({}),
        });

        const wrapper = factory();
        await new Promise((r) => setTimeout(r, 10));
        expect(wrapper.text()).toContain('Forbidden');
    });

    it('renders delete button for rejected proposals and handles deletion', async () => {
        localStorage.setItem('openkb_token', 'test-token');
        const rejectedProp = makeProposal(10, {
            status: 'rejected',
            title: 'Rejected Item',
        });
        mockFetch.mockResolvedValueOnce(
            jsonResponse({
                proposals: [rejectedProp],
                total: 1,
                page: 1,
                pageSize: 20,
                totalPages: 1,
                counts: { all: 1, open: 0, approved: 0, rejected: 1 },
            }),
        );

        const wrapper = factory();
        await new Promise((r) => setTimeout(r, 30));
        expect(wrapper.text()).toContain('Rejected Item');

        const deleteBtn = wrapper
            .findAll('button')
            .find(
                (b) =>
                    b.attributes('title') === 'Delete' ||
                    b.text().includes('Delete'),
            );
        expect(deleteBtn).toBeTruthy();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 204,
            text: async () => '',
            json: async () => ({}),
        });
        mockFetch.mockResolvedValueOnce(
            jsonResponse({
                proposals: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 1,
                counts: { all: 0, open: 0, approved: 0, rejected: 0 },
            }),
        );

        await deleteBtn!.trigger('click');
        await new Promise((r) => setTimeout(r, 30));

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/v1/proposals/10'),
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});
