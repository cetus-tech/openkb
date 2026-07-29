<template>
    <div class="flex flex-col gap-16">
        <!-- Hero -->
        <div class="relative">
            <!-- Dashboard button top right -->
            <div
                class="absolute right-0 top-0"
                v-if="!config.hidePortal">
                <router-link to="/dashboard">
                    <n-button
                        type="primary"
                        size="large">
                        <template #icon>
                            <i class="i-heroicons-outline:view-grid h-6 w-6" />
                        </template>
                        {{ i18n.t('nav.dashboard') }}
                    </n-button>
                </router-link>
            </div>

            <div class="text-left">
                <h1
                    class="mb-4 text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Open<span class="text-primary-600">KB</span>
                </h1>
                <p
                    class="mb-8 max-w-2xl text-lg text-gray-700 dark:text-dark-300">
                    {{ i18n.t('hero.subtitle') }}
                </p>
                <div class="flex flex-wrap items-center gap-4">
                    <router-link to="/docs/introduction/quickstart">
                        <n-button
                            type="primary"
                            size="large">
                            <template #icon>
                                <i
                                    class="i-heroicons-outline:book-open h-6 w-6" />
                            </template>
                            {{ i18n.t('hero.getStarted') }}
                        </n-button>
                    </router-link>
                    <n-button
                        ghost
                        size="large"
                        tag="a"
                        :href="GITHUB_REPO_URL"
                        target="_blank">
                        <template #icon>
                            <i class="i-mdi:github h-6 w-6" />
                        </template>
                        {{ i18n.t('hero.viewGithub') }}
                    </n-button>
                </div>
            </div>
        </div>

        <!-- Features -->
        <n-grid
            cols="1 m:3 l:3 xl:3"
            responsive="screen"
            :x-gap="24"
            :y-gap="24">
            <n-grid-item
                v-for="(feature, i) in features"
                :key="i">
                <n-card
                    :bordered="true"
                    size="small"
                    class="h-full">
                    <div
                        class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                        <span class="text-2xl font-bold">{{
                            ['✏️', '📋', '🔄'][i]
                        }}</span>
                    </div>
                    <h3
                        class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                        {{ feature.title }}
                    </h3>
                    <p class="text-base text-gray-700 dark:text-dark-300">
                        {{ feature.desc }}
                    </p>
                </n-card>
            </n-grid-item>
        </n-grid>

        <!-- Supported Agents -->
        <div>
            <div class="mb-8 text-center">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
                    {{ i18n.t('agents.title') }}
                </h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-dark-300">
                    {{ i18n.t('agents.subtitle') }}
                </p>
            </div>

            <n-grid
                cols="2 s:2 m:4 l:4 xl:4"
                responsive="screen"
                :x-gap="12"
                :y-gap="12">
                <n-grid-item
                    v-for="agent in agents"
                    :key="agent.id">
                    <n-card
                        :bordered="true"
                        size="small"
                        class="agent-card h-full">
                        <div class="flex items-center gap-3 py-1">
                            <!-- Agent icon -->
                            <div
                                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
                                :style="{
                                    backgroundColor: agent.color + '20',
                                    color: agent.color,
                                }">
                                <div :class="[agent.icon, 'text-xl']" />
                            </div>
                            <!-- Agent name -->
                            <div class="min-w-0 text-left flex-1">
                                <h4
                                    class="truncate font-semibold text-gray-900 dark:text-white mx-2">
                                    {{ agent.name }}
                                </h4>
                            </div>
                        </div>
                    </n-card>
                </n-grid-item>
            </n-grid>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useConfigStore } from '@/stores/config';
import { useI18nStore } from '@/stores/i18n';
import { GITHUB_REPO_URL } from '@/utils/constants';

defineOptions({ name: 'HomeView' });

const config = useConfigStore();
config.loadConfig();

const i18n = useI18nStore();

const features = computed(() => [
    {
        title: i18n.t('features.writeOnceTitle'),
        desc: i18n.t('features.writeOnceDesc'),
    },
    {
        title: i18n.t('features.retrieveTitle'),
        desc: i18n.t('features.retrieveDesc'),
    },
    {
        title: i18n.t('features.controlTitle'),
        desc: i18n.t('features.controlDesc'),
    },
]);

interface AgentInfo {
    id: string;
    name: string;
    icon: string;
    color: string;
}

const agents: AgentInfo[] = [
    {
        id: 'antigravity',
        name: 'Antigravity',
        icon: 'i-simple-icons-google',
        color: '#7c3aed',
    },
    {
        id: 'claude',
        name: 'Claude Code',
        icon: 'i-simple-icons-anthropic',
        color: '#d97706',
    },
    {
        id: 'cline',
        name: 'Cline',
        icon: 'i-tabler-robot',
        color: '#0284c7',
    },
    {
        id: 'codex',
        name: 'Codex CLI',
        icon: 'i-simple-icons-openai',
        color: '#dc2626',
    },
    {
        id: 'cursor',
        name: 'Cursor',
        icon: 'i-simple-icons-cursor',
        color: '#059669',
    },
    {
        id: 'copilot',
        name: 'GitHub Copilot',
        icon: 'i-simple-icons-githubcopilot',
        color: '#6e40c9',
    },
    {
        id: 'grok',
        name: 'Grok',
        icon: 'i-simple-icons-x',
        color: '#000000',
    },
    {
        id: 'windsurf',
        name: 'Windsurf',
        icon: 'i-simple-icons-codeium',
        color: '#0d9488',
    },
];
</script>

<style scoped>
.agent-card {
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
}
.agent-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
</style>
