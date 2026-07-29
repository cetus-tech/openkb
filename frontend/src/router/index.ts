import { createRouter, createWebHistory } from 'vue-router';
import PublicLayout from '@/components/layout/PublicLayout.vue';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import AppLayout from '@/components/layout/AppLayout.vue';
import HomeView from '@/views/HomeView.vue';
import DocsView from '@/views/DocsView.vue';
import LoginView from '@/views/LoginView.vue';
import RegisterView from '@/views/RegisterView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import DashboardView from '@/views/portal/DashboardView.vue';
import ProposalsView from '@/views/portal/ProposalsView.vue';
import ProposalDetailView from '@/views/portal/ProposalDetailView.vue';
import SettingsView from '@/views/portal/SettingsView.vue';
import UsersView from '@/views/portal/UsersView.vue';
import AgentsView from '@/views/portal/AgentsView.vue';
import KnowledgeView from '@/views/portal/KnowledgeView.vue';
import KnowledgeDetailView from '@/views/portal/KnowledgeDetailView.vue';
import { useConfigStore } from '@/stores/config';

function authGuard(to: any, from: any, next: (to?: any) => void) {
    const signedIn =
        localStorage.getItem('openkb_session') === 'active' ||
        Boolean(localStorage.getItem('openkb_token'));
    if (!signedIn) {
        next({ name: 'login' });
    } else {
        next();
    }
}

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            component: PublicLayout,
            children: [
                {
                    path: '',
                    name: 'home',
                    component: HomeView,
                    meta: { title: 'Home', description: 'Open Knowledge Base' },
                },
                {
                    path: 'docs/:pathMatch(.*)*',
                    name: 'docs',
                    component: DocsView,
                    meta: { title: 'Documentation' },
                },
                {
                    path: 'not-found',
                    name: 'not-found',
                    component: NotFoundView,
                    meta: { title: 'Not Found' },
                },
            ],
        },
        {
            path: '/auth',
            component: AuthLayout,
            children: [
                {
                    path: 'login',
                    name: 'login',
                    component: LoginView,
                    meta: { title: 'Sign In' },
                },
                {
                    path: 'register',
                    name: 'register',
                    component: RegisterView,
                    meta: { title: 'Create Account' },
                },
            ],
        },
        // Authenticated dashboard with sidebar
        {
            path: '/dashboard',
            component: AppLayout,
            beforeEnter: authGuard,
            children: [
                {
                    path: '',
                    name: 'dashboard',
                    component: DashboardView,
                    meta: { title: 'Dashboard', description: 'Overview' },
                },
                {
                    path: 'knowledge',
                    name: 'portal-knowledge',
                    component: KnowledgeView,
                    meta: {
                        title: 'Knowledge',
                        description: 'Canonical knowledge',
                    },
                },
                {
                    path: 'knowledge/:slug',
                    name: 'portal-knowledge-detail',
                    component: KnowledgeDetailView,
                    meta: {
                        title: 'Knowledge detail',
                        description: 'Version history and edit',
                    },
                },
                {
                    path: 'search',
                    redirect: { name: 'portal-knowledge' },
                },

                {
                    path: 'proposals',
                    name: 'portal-proposals',
                    component: ProposalsView,
                    meta: {
                        title: 'Proposals',
                        description: 'Change proposals',
                    },
                },
                {
                    path: 'proposals/:id',
                    name: 'portal-proposal-detail',
                    component: ProposalDetailView,
                    meta: { title: 'Proposal Detail' },
                },
                {
                    path: 'agents',
                    name: 'portal-agents',
                    component: AgentsView,
                    meta: { title: 'Agents', description: 'Agent identities' },
                },
                {
                    path: 'users',
                    name: 'portal-users',
                    component: UsersView,
                    meta: { title: 'Users', description: 'User accounts' },
                },
                {
                    path: 'settings',
                    name: 'portal-settings',
                    component: SettingsView,
                    meta: {
                        title: 'Settings',
                        description: 'Account settings',
                    },
                },
            ],
        },
        {
            path: '/:pathMatch(.*)*',
            redirect: { name: 'not-found' },
        },
    ],
});

router.beforeEach(async (to, from, next) => {
    const config = useConfigStore();
    await config.loadConfig();

    if (config.hidePortal) {
        if (to.path.startsWith('/dashboard') || to.path.startsWith('/auth')) {
            return next({ name: 'not-found' });
        }
    }
    next();
});

router.afterEach((to) => {
    const title = typeof to.meta.title === 'string' ? to.meta.title : '';
    document.title = title ? `${title} · OpenKB` : 'OpenKB';
});

export default router;
