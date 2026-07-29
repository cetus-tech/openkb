<template>
    <div class="w-full">
        <n-h2
            class="mb-2 text-center text-xl font-bold text-gray-900 dark:text-white">
            Create Account
        </n-h2>
        <n-p class="mb-6 text-center text-sm text-gray-500 dark:text-dark-400">
            Sign up for a new OpenKB account.
        </n-p>

        <template v-if="config.signupEnabled">
            <form
                @submit.prevent="handleRegister"
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
                        >Name</label
                    >
                    <n-input
                        v-model:value="name"
                        type="text"
                        placeholder="Your name"
                        maxlength="120"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-400" />
                </div>

                <div>
                    <label
                        class="mb-1 block text-sm font-medium text-gray-700 dark:text-dark-300"
                        >Email</label
                    >
                    <n-input
                        v-model:value="email"
                        type="email"
                        required
                        placeholder="you@example.com"
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
                        minlength="6"
                        placeholder="At least 6 characters"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-400" />
                </div>

                <div>
                    <label
                        class="mb-1 block text-sm font-medium text-gray-700 dark:text-dark-300"
                        >Confirm Password</label
                    >
                    <n-input
                        v-model:value="confirmPassword"
                        type="password"
                        required
                        placeholder="Repeat password"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-400" />
                </div>

                <n-button
                    type="primary"
                    attr-type="submit"
                    :loading="loading"
                    block
                    size="large">
                    {{ loading ? 'Creating account...' : 'Create Account' }}
                </n-button>
            </form>

            <n-p
                class="mt-6 text-center text-sm text-gray-500 dark:text-dark-500">
                Already have an account?
                <router-link
                    to="/auth/login"
                    class="text-primary-600 hover:underline dark:text-primary-400"
                    >Sign in</router-link
                >.
            </n-p>
        </template>
        <n-alert
            v-else
            type="warning"
            :bordered="false">
            Registration is currently disabled by the administrator.
        </n-alert>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { useConfigStore } from '@/stores/config';

const config = useConfigStore();

const router = useRouter();
const name = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

onMounted(async () => {
    await config.loadConfig();
});

async function handleRegister() {
    error.value = '';

    if (password.value !== confirmPassword.value) {
        error.value = 'Passwords do not match';
        return;
    }

    loading.value = true;
    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name: name.value.trim() || undefined,
                email: email.value,
                password: password.value,
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            error.value = data.message || 'Registration failed';
            return;
        }
        const data = await res.json();
        localStorage.setItem('openkb_session', 'active');
        const roleLabel = data.user.role === 'owner' ? 'admin' : 'member';
        console.log(`Registered as ${email.value} (${roleLabel})`);
        router.push('/dashboard');
    } catch {
        error.value = 'Failed to connect to server.';
    } finally {
        loading.value = false;
    }
}
</script>
