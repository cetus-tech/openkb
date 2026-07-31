<template>
    <div>
        <n-alert
            v-if="tokensError"
            type="error"
            :bordered="false"
            closable
            class="mb-4"
            @close="tokensError = ''">
            {{ tokensError }}
        </n-alert>
        <n-card
            size="small"
            :bordered="true"
            class="tokens-panel">
            <template #header>
                <div
                    class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2
                            class="font-semibold text-gray-900 dark:text-white">
                            {{ i18n.t('agents.tokensTitle') }}
                        </h2>
                        <p
                            class="mt-1 text-xs font-normal text-gray-500 dark:text-dark-400">
                            {{ i18n.t('agents.tokensSubtitle') }}
                        </p>
                    </div>
                    <n-button
                        quaternary
                        :loading="tokensLoading"
                        title="Refresh MCP tokens"
                        @click="fetchTokens">
                        <template #icon
                            ><div class="i-tabler-refresh"
                        /></template>
                        {{ i18n.t('common.refresh') }}
                    </n-button>
                </div>
            </template>

            <div
                class="mb-5 flex flex-col gap-3 rounded-lg border border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-900/10 sm:flex-row sm:items-end">
                <div class="min-w-0 flex-1">
                    <label
                        class="mb-1 block text-xs font-medium uppercase tracking-wide text-primary-700 dark:text-primary-300"
                        >{{ i18n.t('agents.tokenName') }}</label
                    >
                    <n-input
                        v-model:value="tokenName"
                        placeholder="codex, chatgpt, or my-agent"
                        maxlength="80"
                        @keyup.enter="createToken" />
                </div>
                <div class="w-40">
                    <label
                        class="mb-1 block text-xs font-medium uppercase tracking-wide text-primary-700 dark:text-primary-300"
                        >{{ i18n.t('agents.permission') }}</label
                    >
                    <n-select
                        v-model:value="newTokenPermission"
                        :options="availablePermissionOptions" />
                </div>
                <n-button
                    type="primary"
                    :loading="creatingToken"
                    @click="createToken">
                    <template #icon><div class="i-tabler-key" /></template>
                    {{ i18n.t('agents.createToken') }}
                </n-button>
            </div>

            <n-alert
                v-if="newToken"
                type="success"
                :bordered="false"
                class="mb-5">
                <div class="space-y-2">
                    <p class="font-medium">
                        {{ i18n.t('agents.tokenCreated') }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                        <code
                            class="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs text-gray-700 dark:bg-dark-900 dark:text-dark-200"
                            >{{ newToken }}</code
                        >
                        <n-button
                            size="small"
                            quaternary
                            @click="copyNewToken">
                            <template #icon
                                ><div class="i-tabler-copy"
                            /></template>
                            {{ tokenCopied ? i18n.t('common.copied') : i18n.t('common.copy') }}
                        </n-button>
                    </div>
                </div>
            </n-alert>

            <n-spin
                v-if="tokensLoading"
                size="small"
                class="flex justify-center py-8" />
            <div
                v-else-if="tokens.length"
                class="overflow-hidden rounded-lg border border-gray-200/80 dark:border-dark-700/80">
                <n-data-table
                    :columns="tokenColumns"
                    :data="tokens"
                    :bordered="false" />
            </div>
            <n-empty
                v-else
                :description="i18n.t('agents.noTokens')" />
        </n-card>
    </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import {
    NButton,
    NInput,
    NSelect,
    NSpace,
    useDialog,
    type DataTableColumns,
} from 'naive-ui';
import { apiFetch, relativeTime } from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';

interface ApiToken {
    id: number;
    name: string;
    tokenPrefix?: string;
    value?: string | null;
    permissionLevel?: string;
    createdAt: string;
    lastUsedAt?: string;
}

const dialog = useDialog();
const i18n = useI18nStore();
const tokenName = ref('');
const newTokenPermission = ref('propose');
const currentRole = ref<'owner' | 'member'>('member');
const allPermissionOptions = [
    { label: 'Read only', value: 'read' },
    { label: 'Propose changes', value: 'propose' },
    { label: 'Write access', value: 'write' },
];
const availablePermissionOptions = computed(() =>
    currentRole.value === 'owner'
        ? allPermissionOptions
        : allPermissionOptions.filter((option) => option.value === 'read' || option.value === 'propose'),
);
const newToken = ref('');
const tokenCopied = ref(false);
const tokens = ref<ApiToken[]>([]);
const tokensLoading = ref(true);
const creatingToken = ref(false);
const tokensError = ref('');
const copiedTokenId = ref<number | ''>('');
const editingId = ref<number | ''>('');
const editingName = ref('');
const renamingId = ref<number | ''>('');

function tokenPreview(token: ApiToken): string {
    if (token.value)
        return `${token.value.slice(0, 8)}...${token.value.slice(-4)}`;
    return token.tokenPrefix ?? 'okb_...';
}

const tokenColumns = computed<DataTableColumns<ApiToken>>(() => [
    {
        title: i18n.t('agents.tokenName'),
        key: 'name',
        render(row) {
            if (editingId.value === row.id) {
                return h(
                    NSpace,
                    { align: 'center', wrapItem: false },
                    {
                        default: () => [
                            h(NInput, {
                                'value': editingName.value,
                                'onUpdate:value': (v: string) => {
                                    editingName.value = v;
                                },
                                'size': 'small',
                                'style': { maxWidth: '200px' },
                                'onKeyup': (e: KeyboardEvent) => {
                                    if (e.key === 'Enter') saveRename(row);
                                    else if (e.key === 'Escape') cancelRename();
                                },
                            }),
                            h(
                                NButton,
                                {
                                    size: 'small',
                                    type: 'primary',
                                    loading: renamingId.value === row.id,
                                    onClick: () => saveRename(row),
                                },
                                { default: () => i18n.t('common.save') },
                            ),
                            h(
                                NButton,
                                {
                                    size: 'small',
                                    quaternary: true,
                                    onClick: () => cancelRename(),
                                },
                                { default: () => i18n.t('common.cancel') },
                            ),
                        ],
                    },
                );
            }
            return h(
                NSpace,
                { align: 'center', wrapItem: false },
                {
                    default: () => [
                        h(
                            'div',
                            {
                                class: 'flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-dark-800 dark:text-dark-300',
                            },
                            [h('div', { class: 'i-tabler-key' })],
                        ),
                        h(
                            'span',
                            { class: 'font-medium truncate max-w-[150px]' },
                            row.name,
                        ),
                        h(
                            NButton,
                            {
                                size: 'tiny',
                                quaternary: true,
                                onClick: () => startRename(row),
                                title: i18n.t('common.edit'),
                            },
                            {
                                icon: () =>
                                    h('div', { class: 'i-tabler-pencil' }),
                            },
                        ),
                        h(
                            'code',
                            { class: 'font-mono text-xs text-gray-400' },
                            tokenPreview(row),
                        ),
                        h(
                            NButton,
                            {
                                size: 'tiny',
                                quaternary: true,
                                onClick: () => copyToken(row),
                                title:
                                    copiedTokenId.value === row.id
                                        ? i18n.t('common.copied')
                                        : i18n.t('common.copy'),
                            },
                            {
                                icon: () =>
                                    h('div', {
                                        class:
                                            copiedTokenId.value === row.id
                                                ? 'i-tabler-check text-emerald-500'
                                                : 'i-tabler-copy',
                                    }),
                            },
                        ),
                    ],
                },
            );
        },
    },
    {
        title: i18n.t('agents.created'),
        key: 'createdAt',
        width: 120,
        render(row) {
            return relativeTime(row.createdAt);
        },
    },
    {
        title: i18n.t('agents.lastUsed'),
        key: 'lastUsedAt',
        width: 120,
        render(row) {
            return row.lastUsedAt
                ? relativeTime(row.lastUsedAt)
                : i18n.t('agents.notUsedYet');
        },
    },
    {
        title: i18n.t('agents.permission'),
        key: 'permissionLevel',
        width: 140,
        render(row) {
            return h(
                NSelect,
                {
                    value: row.permissionLevel ?? 'propose',
                    options: availablePermissionOptions.value,
                    size: 'small',
                    onUpdateValue: (value: string) => savePermission(row, value),
                },
            );
        },
    },
    {
        title: i18n.t('common.actions'),
        key: 'actions',
        align: 'right',
        width: 100,
        render(row) {
            return h(
                NSpace,
                { justify: 'end', wrapItem: false },
                {
                    default: () => [
                        h(
                            NButton,
                            {
                                size: 'small',
                                quaternary: true,
                                type: 'error',
                                onClick: () => revokeToken(row),
                            },
                            {
                                icon: () => h('div', { class: 'i-tabler-ban' }),
                                default: () => i18n.t('agents.revoke'),
                            },
                        ),
                    ],
                },
            );
        },
    },
]);

async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard copy was rejected');
}

async function copyNewToken() {
    if (!newToken.value) return;
    try {
        await copyText(newToken.value);
        tokenCopied.value = true;
        window.setTimeout(() => {
            tokenCopied.value = false;
        }, 1800);
        tokensError.value = '';
    } catch {
        tokensError.value =
            'Clipboard access is unavailable. Select the token and copy it manually.';
    }
}

async function copyToken(token: ApiToken) {
    const value = token.value?.trim();
    if (!value) {
        tokensError.value = `No stored value for "${token.name}". Revoke it and create a new token (legacy rows may lack a full value until recreated).`;
        return;
    }
    try {
        await copyText(value);
        copiedTokenId.value = token.id;
        window.setTimeout(() => {
            if (copiedTokenId.value === token.id) copiedTokenId.value = '';
        }, 1800);
        tokensError.value = '';
    } catch {
        tokensError.value =
            'Clipboard access is unavailable. Select the token and copy it manually.';
    }
}

function startRename(token: ApiToken) {
    editingId.value = token.id;
    editingName.value = token.name;
}

function cancelRename() {
    editingId.value = '';
    editingName.value = '';
    renamingId.value = '';
}

async function saveRename(token: ApiToken) {
    const name = editingName.value.trim();
    if (!name) {
        tokensError.value = 'Token name cannot be empty.';
        return;
    }
    if (name === token.name) {
        cancelRename();
        return;
    }
    renamingId.value = token.id;
    try {
        const data = await apiFetch<{ token: ApiToken }>(
            `/auth/tokens/${encodeURIComponent(token.id)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ name }),
            },
        );
        tokens.value = tokens.value.map((item) =>
            item.id === token.id ? { ...item, ...data.token } : item,
        );
        tokensError.value = '';
        cancelRename();
    } catch (err) {
        tokensError.value = `Failed to rename token: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        renamingId.value = '';
    }
}

async function savePermission(token: ApiToken, permissionLevel: string) {
    if (permissionLevel === (token.permissionLevel ?? 'propose')) return;
    const previous = token.permissionLevel;
    token.permissionLevel = permissionLevel;
    try {
        const data = await apiFetch<{ token: ApiToken }>(
            `/auth/tokens/${encodeURIComponent(token.id)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ permissionLevel }),
            },
        );
        tokens.value = tokens.value.map((item) =>
            item.id === token.id ? { ...item, ...data.token } : item,
        );
        tokensError.value = '';
    } catch (err) {
        token.permissionLevel = previous;
        tokensError.value = `Failed to update permission: ${err instanceof Error ? err.message : 'unknown error'}`;
    }
}

async function createToken() {
    const name = tokenName.value.trim();
    if (!name) {
        tokensError.value = 'Enter a token name before creating it.';
        return;
    }
    creatingToken.value = true;
    try {
        const data = await apiFetch<{ token: ApiToken & { value: string } }>(
            '/auth/tokens',
            {
                method: 'POST',
                body: JSON.stringify({ name, permissionLevel: newTokenPermission.value }),
            },
        );
        newToken.value = data.token.value;
        newTokenPermission.value = 'propose';
        tokensError.value = '';
        await fetchTokens();
    } catch (err) {
        tokensError.value = `Failed to create token: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        creatingToken.value = false;
    }
}

async function fetchTokens() {
    tokensLoading.value = true;
    try {
        const data = await apiFetch<{ tokens: ApiToken[] }>('/auth/tokens');
        tokens.value = data.tokens ?? [];
        tokensError.value = '';
    } catch (err) {
        tokensError.value = `Failed to load MCP tokens: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        tokensLoading.value = false;
    }
}

function revokeToken(token: ApiToken) {
    dialog.warning({
        title: 'Revoke MCP token',
        content: `Revoke the MCP token "${token.name}"? Any client using it will be disconnected.`,
        positiveText: 'Revoke',
        negativeText: 'Cancel',
        onPositiveClick: async () => {
            try {
                await apiFetch(`/auth/tokens/${encodeURIComponent(token.id)}`, {
                    method: 'DELETE',
                });
                tokens.value = tokens.value.filter(
                    (item) => item.id !== token.id,
                );
                if (editingId.value === token.id) cancelRename();
                tokensError.value = '';
            } catch (err) {
                tokensError.value = `Failed to revoke token: ${err instanceof Error ? err.message : 'unknown error'}`;
                throw err;
            }
        },
    });
}

onMounted(async () => {
    await fetchTokens();
    try {
        const session = await apiFetch<{ user: { role?: string } }>('/auth/session');
        if (session.user?.role === 'owner' || session.user?.role === 'member') {
            currentRole.value = session.user.role;
        }
    } catch {
        // Keep the conservative member default when the session cannot be resolved.
    }
});
</script>
