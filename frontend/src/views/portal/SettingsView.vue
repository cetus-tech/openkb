<template>
    <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h1
                    class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">
                    {{ i18n.t('settings.title') }}
                </h1>
                <p
                    class="mt-4 mb-0 max-w-4xl text-sm text-gray-500 dark:text-dark-400">
                    {{ i18n.t('settings.subtitle') }}
                </p>
            </div>
            <n-button
                type="error"
                secondary
                :loading="loggingOut"
                @click="logout">
                <template #icon><div class="i-tabler-logout" /></template>
                {{ i18n.t('nav.logout') }}
            </n-button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <TokenPanel class="lg:col-span-2" />
            <UserSettingsPanel />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';

const i18n = useI18nStore();
import TokenPanel from './components/settings/TokenPanel.vue';
import UserSettingsPanel from './components/settings/UserSettingsPanel.vue';

const router = useRouter();
const loggingOut = ref(false);

async function logout() {
    loggingOut.value = true;
    try {
        await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
        localStorage.removeItem('openkb_session');
        localStorage.removeItem('openkb_token');
        localStorage.removeItem('openkb_token_values');
        loggingOut.value = false;
        router.push('/auth/login');
    }
}
</script>
