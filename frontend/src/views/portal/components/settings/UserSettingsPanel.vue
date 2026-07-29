<template>
    <n-card
        size="small"
        :bordered="true"
        class="user-settings-panel">
        <template #header>
            <div>
                <h2 class="font-semibold text-gray-900 dark:text-white">
                    {{ i18n.t('settings.accountSettings') }}
                </h2>
                <p
                    class="mt-1 text-xs font-normal text-gray-500 dark:text-dark-400">
                    {{ i18n.t('settings.subtitle') }}
                </p>
            </div>
        </template>
        <div class="space-y-6 py-4">
            <!-- Display name -->
            <div>
                <label
                    class="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1"
                    >{{ i18n.t('users.displayName') }}</label
                >
                <n-input
                    v-model:value="userName"
                    :placeholder="i18n.t('users.displayName')" />
                <n-button
                    type="primary"
                    size="small"
                    @click="saveUserName"
                    :loading="userLoading"
                    class="mt-2"
                    >{{ i18n.t('common.save') }}</n-button
                >
            </div>

            <!-- Password change -->
            <div>
                <label
                    class="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1"
                    >{{ i18n.t('settings.changePassword') }}</label
                >
                <n-input
                    v-model:value="newPassword"
                    type="password"
                    :placeholder="i18n.t('settings.newPassword')"
                    class="mb-2" />
                <n-input
                    v-model:value="confirmPassword"
                    type="password"
                    :placeholder="i18n.t('settings.confirmPassword')"
                    class="mb-3" />
                <n-button
                    type="primary"
                    size="small"
                    @click="changePassword"
                    :loading="changingPassword"
                    >{{ i18n.t('settings.updatePassword') }}</n-button
                >
            </div>

            <!-- Signup toggle removed as it is now managed via docker environment variables -->

            <n-alert
                v-if="userError"
                type="error"
                :bordered="false"
                closable
                @close="userError = ''">
                {{ userError }}
            </n-alert>
        </div>
    </n-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiFetch } from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';

const i18n = useI18nStore();

const user = ref<{
    id: number;
    email: string;
    name: string;
    role: string;
    signup_enabled?: boolean;
} | null>(null);
const isOwner = ref(false);
const userName = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const userLoading = ref(true);
const userError = ref('');
const changingPassword = ref(false);

async function fetchUser() {
    try {
        user.value = await apiFetch('/v1/me');
        if (user.value) {
            userName.value = user.value.name;
            isOwner.value = user.value.role === 'owner';
        }
        userError.value = '';
    } catch (err) {
        userError.value = `Failed to load user: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        userLoading.value = false;
    }
}

async function saveUserName() {
    const currentUser = user.value!;
    if (currentUser == null) {
        userError.value = 'User not loaded.';
        return;
    }
    const name = userName.value.trim();
    if (!name) {
        userError.value = 'Name cannot be empty.';
        return;
    }
    try {
        await apiFetch(`/v1/users/${currentUser.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        });
        userError.value = '';
    } catch (err) {
        userError.value = `Failed to update name: ${err instanceof Error ? err.message : 'unknown error'}`;
    }
}

async function changePassword() {
    const currentUser = user.value!;
    if (currentUser == null) {
        userError.value = 'User not loaded.';
        return;
    }
    const newPass = newPassword.value.trim();
    const confirm = confirmPassword.value.trim();
    if (!newPass || !confirm) {
        userError.value = 'Both password fields are required.';
        return;
    }
    if (newPass !== confirm) {
        userError.value = 'Passwords do not match.';
        return;
    }
    if (newPass.length < 6) {
        userError.value = 'Password must be at least 6 characters.';
        return;
    }
    changingPassword.value = true;
    try {
        await apiFetch(`/v1/users/${currentUser.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ password: newPass }),
        });
        newPassword.value = '';
        confirmPassword.value = '';
        userError.value = '';
    } catch (err) {
        userError.value = `Failed to change password: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        changingPassword.value = false;
    }
}

onMounted(async () => {
    await fetchUser();
});
</script>
