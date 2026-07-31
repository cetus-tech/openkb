<template>
    <div class="w-full">
        <n-h2
            class="mb-2 text-center text-xl font-bold text-gray-900 dark:text-white">
            Sign In
        </n-h2>
        <n-p class="mb-6 text-center text-sm text-gray-500 dark:text-dark-400">
            Log in to your OpenKB account.
        </n-p>

        <form
            @submit.prevent="handleLogin"
            class="space-y-4">
            <n-alert
                v-if="error"
                type="error"
                :bordered="false"
                closable>
                {{ error }}
            </n-alert>

            <div>
                <label
                    class="mb-1 block text-sm font-medium text-gray-700 dark:text-dark-300"
                    >Email</label
                >
                <n-input
                    v-model:value="email"
                    type="email"
                    required
                    placeholder="Email"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-400" />
            </div>

            <div>
                <label
                    class="mb-1 block text-sm font-medium text-gray-700 dark:text-dark-300"
                    >Password</label
                >
                <n-input
                    v-model:value="password"
                    type="password"
                    required
                    placeholder="Password"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-400" />
            </div>

            <n-button
                type="primary"
                attr-type="submit"
                :loading="loading"
                block
                size="large">
                {{ loading ? 'Signing in...' : 'Sign In' }}
            </n-button>
        </form>

        <n-p
            v-if="config.signupEnabled"
            class="mt-6 text-center text-sm text-gray-500 dark:text-dark-500">
            <p>
                Don't have an account?
                <router-link
                    to="/auth/register"
                    class="text-primary-600 hover:underline dark:text-primary-400">
                    Create one </router-link
                >.
            </p>
            <p>The first account becomes the owner automatically.</p>
        </n-p>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
import { useConfigStore } from '@/stores/config';

const config = useConfigStore();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

onMounted(async () => {
    await config.loadConfig();
});

async function handleLogin() {
    error.value = '';
    loading.value = true;
    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: email.value,
                password: password.value,
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            error.value = data.message || 'Login failed';
            return;
        }
        await res.json();
        localStorage.setItem('openkb_session', 'active');
        router.push('/dashboard');
    } catch {
        error.value = 'Failed to connect to server.';
    } finally {
        loading.value = false;
    }
}
</script>
