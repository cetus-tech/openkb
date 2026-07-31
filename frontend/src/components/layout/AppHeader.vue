<template>
    <header
        class="sticky top-0 z-30 border-b border-gray-200/50 bg-white/80 backdrop-blur-lg dark:border-dark-700/50 dark:bg-dark-900/80">
        <div class="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
            <div class="flex min-w-0 items-center gap-3">
                <n-button
                    quaternary
                    circle
                    class="lg:hidden"
                    aria-label="Open navigation"
                    @click="toggleMobile">
                    <template #icon>
                        <div class="i-tabler-menu-2 text-lg" />
                    </template>
                </n-button>
                <router-link
                    to="/"
                    class="flex min-w-0 items-center gap-2 lg:hidden transition-colors hover:opacity-80">
                    <div
                        class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white">
                        <div class="i-heroicons-outline-globe-alt text-sm" />
                    </div>
                    <span
                        class="truncate text-sm font-semibold text-gray-900 dark:text-white"
                        >OpenKB</span
                    >
                    <n-tag
                        v-if="versionStore.version"
                        size="tiny"
                        round
                        :bordered="false"
                        class="shrink-0"
                        >v{{ versionStore.version }}</n-tag
                    >
                </router-link>
            </div>

            <!-- Match public site top nav: Home / Docs / GitHub / LangToggle -->
            <div class="flex items-center gap-4 sm:gap-6">
                <nav class="hidden items-center gap-6 sm:flex">
                    <router-link
                        to="/"
                        class="text-sm font-medium transition-colors"
                        :class="
                            route.path === '/'
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-gray-600 hover:text-gray-900 dark:text-dark-400 dark:hover:text-white'
                        ">
                        {{ i18n.t('nav.home') }}
                    </router-link>
                    <router-link
                        to="/docs/introduction/quickstart"
                        class="text-sm font-medium transition-colors"
                        :class="
                            route.path.startsWith('/docs')
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-gray-600 hover:text-gray-900 dark:text-dark-400 dark:hover:text-white'
                        ">
                        {{ i18n.t('nav.docs') }}
                    </router-link>
                    <a
                        :href="GITHUB_REPO_URL"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white">
                        <div class="i-mdi-github h-4 w-4" />
                        GitHub
                    </a>
                </nav>
                <LangToggle />
            </div>

            <div class="sm:hidden">
                <n-dropdown
                    trigger="click"
                    :options="mobileMenuOptions"
                    @select="handleMobileSelect">
                    <n-button
                        quaternary
                        circle>
                        <template #icon
                            ><div class="i-tabler-dots-vertical text-lg"
                        /></template>
                    </n-button>
                </n-dropdown>
            </div>
        </div>
    </header>
</template>

<script setup lang="ts">
import { h, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NIcon } from 'naive-ui';
import { useAppStore } from '@/stores/app';
import { useI18nStore } from '@/stores/i18n';
import { useVersionStore } from '@/stores/version';
import LangToggle from './LangToggle.vue';
import { GITHUB_REPO_URL } from '@/utils/constants';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const i18n = useI18nStore();
const versionStore = useVersionStore();

onMounted(() => {
    void versionStore.loadVersion();
});

function toggleMobile() {
    appStore.toggleMobileSidebar();
}

const renderIcon = (iconClass: string) => {
    return () =>
        h(NIcon, null, { default: () => h('div', { class: iconClass }) });
};

const mobileMenuOptions = [
    {
        label: 'Home',
        key: '/',
        icon: renderIcon('i-mdi-home text-lg'),
    },
    {
        label: 'Docs',
        key: '/docs/introduction/quickstart',
        icon: renderIcon('i-mdi-book-open-page-variant text-lg'),
    },
    {
        label: 'GitHub',
        key: 'github',
        icon: renderIcon('i-mdi-github text-lg'),
    },
];

function handleMobileSelect(key: string) {
    if (key === 'github') {
        window.open(GITHUB_REPO_URL, '_blank');
    } else {
        router.push(key);
    }
}
</script>
