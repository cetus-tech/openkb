<template>
    <div class="min-h-screen bg-gray-50 dark:bg-dark-950">
        <!-- Background decoration -->
        <div
            class="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary-50/30 via-transparent to-blue-50/20 dark:from-primary-950/10 dark:via-transparent dark:to-blue-950/10" />

        <!-- Top bar -->
        <header
            class="sticky top-0 z-30 border-b border-gray-200/50 bg-white/80 backdrop-blur-lg dark:border-dark-700/50 dark:bg-dark-900/80">
            <div
                class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
                <router-link
                    to="/"
                    class="flex items-center gap-3">
                    <div
                        class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-glow">
                        <div class="i-heroicons-outline-globe-alt h-5 w-5" />
                    </div>
                    <span
                        class="text-lg font-bold text-gray-900 dark:text-white"
                        >OpenKB</span
                    >
                </router-link>

                <nav class="flex items-center gap-4 md:gap-6">
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
                        <svg
                            class="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 24 24">
                            <path
                                fill-rule="evenodd"
                                clip-rule="evenodd"
                                d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                        </svg>
                        GitHub
                    </a>
                    <LangToggle />
                </nav>
            </div>
        </header>

        <!-- Main content -->
        <main
            class="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12 lg:py-16">
            <router-view />
        </main>

        <!-- Footer -->
        <AppFooter />
    </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppFooter from './AppFooter.vue';
import LangToggle from './LangToggle.vue';
import { useI18nStore } from '@/stores/i18n';
import { GITHUB_REPO_URL } from '@/utils/constants';

const route = useRoute();
const i18n = useI18nStore();
</script>
