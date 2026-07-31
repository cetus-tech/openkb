<template>
    <n-card
        size="small"
        :bordered="true"
        class="agents-table">
        <template #header>
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 class="m-0 font-semibold text-gray-900 dark:text-white">
                        {{ i18n.t('agents.title') }}
                    </h2>
                    <p
                        class="mt-1 text-xs font-normal text-gray-500 dark:text-dark-400">
                        {{ i18n.t('agents.subtitle') }}
                    </p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <n-button
                        quaternary
                        :loading="loading"
                        title="Refresh agents"
                        @click="fetchAgents">
                        <template #icon
                            ><div class="i-tabler-refresh"
                        /></template>
                        {{ i18n.t('common.refresh') }}
                    </n-button>
                    <n-button
                        v-if="session.isAdmin"
                        type="primary"
                        @click="showAddModal = true">
                        <template #icon><div class="i-tabler-plus" /></template>
                        {{ i18n.t('agents.registerAgent') }}
                    </n-button>
                </div>
            </div>
        </template>

        <n-alert
            v-if="error"
            type="error"
            :bordered="false"
            closable
            class="mb-4"
            @close="error = ''">
            {{ error }}
        </n-alert>

        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <n-card
                v-for="stat in stats"
                :key="stat.label"
                size="small"
                :bordered="true">
                <n-statistic
                    :label="stat.label"
                    :value="stat.value" />
            </n-card>
        </div>

        <n-spin
            v-if="loading && !agents.length"
            size="large"
            class="flex justify-center py-8" />
        <n-data-table
            v-else-if="agents.length"
            :columns="agentColumns"
            :data="agents"
            :bordered="false" />
        <n-empty
            v-else
            description="No MCP agents registered">
            <template #extra>
                <n-button
                    v-if="session.isAdmin"
                    type="primary"
                    @click="showAddModal = true">
                    <template #icon><div class="i-tabler-plus" /></template>
                    {{ i18n.t('agents.registerAgent') }}
                </n-button>
            </template>
        </n-empty>
    </n-card>

    <n-modal
        v-model:show="showAddModal"
        preset="card"
        title="Register MCP agent"
        class="max-w-md">
        <n-form
            :model="newAgent"
            @submit.prevent="handleRegister">
            <n-form-item
                label="Agent name"
                path="name"
                ><n-input
                    v-model:value="newAgent.name"
                    placeholder="e.g. codex"
            /></n-form-item>
            <n-form-item label="Label"
                ><n-input
                    v-model:value="newAgent.label"
                    placeholder="Optional description"
            /></n-form-item>
            <div class="flex justify-end gap-3">
                <n-button @click="showAddModal = false">{{
                    i18n.t('common.cancel')
                }}</n-button>
                <n-button
                    type="primary"
                    attr-type="submit"
                    :loading="registering"
                    >{{ i18n.t('common.create') }}</n-button
                >
            </div>
        </n-form>
    </n-modal>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
    NButton,
    NSpace,
    NTag,
    useDialog,
    useMessage,
    type DataTableColumns,
} from 'naive-ui';
import { apiFetch, relativeTime, type Agent } from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';
import { useSessionStore } from '@/stores/session';

const loading = ref(true);
const i18n = useI18nStore();
const session = useSessionStore();
const error = ref('');
const agents = ref<Agent[]>([]);
const message = useMessage();
const dialog = useDialog();
const showAddModal = ref(false);
const registering = ref(false);
const newAgent = reactive({ name: '', label: '' });

const stats = computed(() => [
    { label: i18n.t('agents.statRegistered'), value: agents.value.length },
    {
        label: i18n.t('agents.statWriteEnabled'),
        value: agents.value.filter(
            (agent) => agent.lastTokenPermission === 'write',
        ).length,
    },
    {
        label: i18n.t('agents.statSeenRecently'),
        value: agents.value.filter(
            (agent) =>
                agent.lastSeenAt &&
                Date.now() - new Date(agent.lastSeenAt).getTime() < 86400000,
        ).length,
    },
]);

function permissionType(
    permission: string,
): 'default' | 'info' | 'success' | 'warning' | 'error' {
    if (permission === 'write') return 'success';
    if (permission === 'propose') return 'warning';
    return 'default';
}

const agentColumns = computed<DataTableColumns<Agent>>(() => [
    {
        title: 'Agent',
        key: 'name',
        render(row) {
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
                            [h('div', { class: 'i-tabler-robot' })],
                        ),
                        h('div', { class: 'min-w-0' }, [
                            h(
                                'span',
                                {
                                    class: 'block max-w-[12rem] truncate font-medium text-gray-900 dark:text-white',
                                },
                                row.name,
                            ),
                            row.label
                                ? h(
                                      'span',
                                      {
                                          class: 'block max-w-[12rem] truncate text-xs text-gray-400 dark:text-dark-500',
                                      },
                                      row.label,
                                  )
                                : null,
                        ]),
                    ],
                },
            );
        },
    },
    {
        title: i18n.t('agents.permission'),
        key: 'permission',
        render(row) {
            if (!row.lastTokenPermission) {
                return h(
                    NTag,
                    { size: 'small', bordered: false },
                    { default: () => 'no token yet' },
                );
            }
            return h(
                NTag,
                {
                    size: 'small',
                    type: permissionType(row.lastTokenPermission),
                    bordered: false,
                },
                { default: () => row.lastTokenPermission },
            );
        },
    },
    {
        title: i18n.t('agents.lastUsed'),
        key: 'lastSeenAt',
        width: 120,
        render(row) {
            return row.lastSeenAt
                ? relativeTime(row.lastSeenAt)
                : 'No requests';
        },
    },
    {
        title: i18n.t('agents.lastToken'),
        key: 'lastToken',
        render(row) {
            if (!row.lastTokenName && !row.lastTokenPrefix) return '—';
            return h(
                'span',
                { class: 'inline-flex items-center gap-1 text-xs' },
                [
                    row.lastTokenName
                        ? h(
                              'span',
                              { class: 'max-w-[8rem] truncate' },
                              row.lastTokenName,
                          )
                        : null,
                    row.lastTokenName && row.lastTokenPrefix
                        ? h('span', { class: 'opacity-50' }, '·')
                        : null,
                    row.lastTokenPrefix
                        ? h(
                              'span',
                              {
                                  class: 'font-mono text-gray-400 dark:text-dark-500',
                              },
                              row.lastTokenPrefix,
                          )
                        : null,
                ],
            );
        },
    },
    {
        title: i18n.t('agents.tokenOwner'),
        key: 'lastUserName',
        render(row) {
            return row.lastUserName ?? '—';
        },
    },
    {
        title: i18n.t('common.actions'),
        key: 'actions',
        align: 'right',
        width: 100,
        render(row) {
            if (!session.isAdmin) return null;
            return h(
                NButton,
                {
                    size: 'small',
                    quaternary: true,
                    type: 'error',
                    title: 'Remove agent',
                    onClick: () => deleteAgent(row),
                },
                {
                    icon: () => h('div', { class: 'i-tabler-trash' }),
                },
            );
        },
    },
]);

async function fetchAgents() {
    loading.value = true;
    try {
        const data = await apiFetch<{ agents: Agent[] }>('/v1/agents');
        agents.value = data.agents ?? [];
        error.value = '';
    } catch (err) {
        error.value = `Failed to load agents: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        loading.value = false;
    }
}

async function handleRegister() {
    if (!newAgent.name.trim()) {
        message.error('Agent name is required');
        return;
    }
    registering.value = true;
    try {
        await apiFetch('/v1/agents', {
            method: 'POST',
            body: JSON.stringify(newAgent),
        });
        message.success('Agent registered');
        Object.assign(newAgent, { name: '', label: '' });
        showAddModal.value = false;
        await fetchAgents();
    } catch (err) {
        message.error(
            err instanceof Error ? err.message : 'Failed to register agent',
        );
    } finally {
        registering.value = false;
    }
}

function deleteAgent(agent: Agent) {
    dialog.warning({
        title: 'Remove agent',
        content: `Remove "${agent.name}"?`,
        positiveText: 'Remove',
        negativeText: 'Cancel',
        onPositiveClick: async () => {
            try {
                await apiFetch(`/v1/agents/${agent.id}`, { method: 'DELETE' });
                message.success('Agent removed');
                await fetchAgents();
            } catch (err) {
                message.error(
                    err instanceof Error
                        ? err.message
                        : 'Failed to remove agent',
                );
                throw err;
            }
        },
    });
}

onMounted(() => {
    void session.loadSession();
    fetchAgents();
});
</script>
