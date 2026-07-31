<template>
    <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h1
                    class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">
                    {{ i18n.t('proposals.title') }}
                </h1>
                <p
                    class="mt-4 mb-0 max-w-4xl text-sm text-gray-500 dark:text-dark-400">
                    {{ i18n.t('proposals.subtitle') }}
                </p>
            </div>
            <n-button
                quaternary
                :loading="loading"
                title="Refresh proposals"
                @click="fetchProposals">
                <template #icon><div class="i-tabler-refresh" /></template>
                {{ i18n.t('common.refresh') }}
            </n-button>
        </div>

        <n-alert
            v-if="error"
            type="error"
            :bordered="false"
            closable
            @close="error = ''">
            {{ error }}
        </n-alert>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <n-card
                v-for="stat in stats"
                :key="stat.label"
                size="small"
                :bordered="true"
                class="cursor-pointer"
                @click="setStatusFilter(stat.filter)">
                <n-statistic
                    :label="stat.label"
                    :value="stat.value" />
            </n-card>
        </div>

        <n-card
            size="small"
            :bordered="true">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                <n-select
                    :value="statusFilter"
                    :options="statusOptions"
                    class="w-full sm:w-52"
                    @update:value="setStatusFilter" />
                <span
                    class="text-xs text-gray-500 dark:text-dark-400 sm:ml-auto">
                    {{ countSummaryText }}
                </span>
            </div>
        </n-card>

        <n-spin :show="loading">
            <n-data-table
                v-if="proposals.length"
                size="small"
                :bordered="true"
                :single-line="false"
                :columns="columns"
                :data="proposals"
                :row-key="(row: Proposal) => row.id"
                :row-props="rowProps" />
            <n-empty
                v-else-if="counts.all > 0"
                :description="i18n.t('proposals.noMatchFilter')">
                <template #extra>
                    <n-button
                        quaternary
                        @click="setStatusFilter('all')"
                        >{{ i18n.t('proposals.showAll') }}</n-button
                    >
                </template>
            </n-empty>
            <n-empty
                v-else
                :description="i18n.t('proposals.noPendingChanges')">
                <template #extra>
                    <div class="flex flex-wrap justify-center gap-2">
                        <n-button
                            type="primary"
                            @click="router.push('/dashboard/knowledge')">
                            <template #icon
                                ><div class="i-tabler-database"
                            /></template>
                            {{ i18n.t('nav.knowledge') }}
                        </n-button>
                        <n-button
                            quaternary
                            @click="router.push('/dashboard/agents')">
                            <template #icon
                                ><div class="i-tabler-robot"
                            /></template>
                            {{ i18n.t('nav.agents') }}
                        </n-button>
                    </div>
                </template>
            </n-empty>
        </n-spin>

        <n-pagination
            v-if="total"
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="total"
            show-size-picker
            :page-sizes="pageSizes"
            @update:page="fetchProposals"
            @update:page-size="onPageSizeChange" />
    </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NTag, useDialog, type DataTableColumns } from 'naive-ui';
import {
    apiFetch,
    relativeTime,
    type Proposal,
    type ProposalPage,
} from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';

const route = useRoute();
const router = useRouter();
const i18n = useI18nStore();
const dialog = useDialog();
const loading = ref(true);
const error = ref('');
const proposals = ref<Proposal[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const counts = ref({ all: 0, open: 0, approved: 0, rejected: 0 });
const statusOptions = computed(() => [
    { label: i18n.t('proposals.filterOpen'), value: 'open' },
    { label: i18n.t('proposals.filterAll'), value: 'all' },
    { label: i18n.t('proposals.filterApproved'), value: 'approved' },
    { label: i18n.t('proposals.filterRejected'), value: 'rejected' },
]);

const countSummaryText = computed(() => {
    const base = i18n.t('proposals.totalCount').replace('{count}', String(total.value));
    if (statusFilter.value !== 'all') {
        const opt = statusOptions.value.find((o) => o.value === statusFilter.value);
        const label = opt ? opt.label : statusFilter.value;
        return `${base} · ${label}`;
    }
    return base;
});

const pageSizes = [
    { label: '10/page', value: 10 },
    { label: '20/page', value: 20 },
    { label: '50/page', value: 50 },
];

function parseStatusQuery(value: unknown): string {
    const status = String(value ?? '').trim();
    if (
        status === 'open' ||
        status === 'approved' ||
        status === 'rejected' ||
        status === 'all'
    )
        return status;
    return 'open';
}

const statusFilter = ref(parseStatusQuery(route.query.status));

const stats = computed(() => [
    {
        label: i18n.t('proposals.statAll'),
        value: counts.value.all,
        filter: 'all',
    },
    {
        label: i18n.t('proposals.statOpen'),
        value: counts.value.open,
        filter: 'open',
    },
    {
        label: i18n.t('proposals.statApproved'),
        value: counts.value.approved,
        filter: 'approved',
    },
    {
        label: i18n.t('proposals.statRejected'),
        value: counts.value.rejected,
        filter: 'rejected',
    },
]);

function setStatusFilter(filter: string) {
    statusFilter.value = filter;
    page.value = 1;
    router.replace({
        name: 'dashboard-proposals',
        query: {
            ...(filter === 'open' ? {} : { status: filter }),
            ...(pageSize.value !== 20
                ? { pageSize: String(pageSize.value) }
                : {}),
        },
    });
    fetchProposals();
}

function onPageSizeChange() {
    page.value = 1;
    fetchProposals();
}

watch(
    () => route.query.status,
    (value) => {
        const next = parseStatusQuery(value);
        if (statusFilter.value !== next) {
            statusFilter.value = next;
            page.value = 1;
            fetchProposals();
        }
    },
);

function statusType(
    status: string,
): 'default' | 'info' | 'success' | 'warning' | 'error' {
    if (status === 'open') return 'info';
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'error';
    return 'default';
}

function scopeTag(proposal: Proposal): string {
    const project = proposal.scope?.projectSlug?.trim();
    return project ? `@${project}` : '@global';
}

function actionLabel(proposal: Proposal): string {
    return proposal.knowledgeId ? 'updates' : 'creates';
}

const columns = computed<DataTableColumns<Proposal>>(() => [
    {
        title: 'Proposal',
        key: 'title',
        ellipsis: { tooltip: true },
        render: (row) =>
            h('div', { class: 'flex min-w-0 flex-wrap items-center gap-2' }, [
                h(
                    'span',
                    {
                        class: 'truncate font-medium text-gray-900 dark:text-white',
                    },
                    row.title,
                ),
                h(
                    NTag,
                    {
                        size: 'small',
                        type: statusType(row.status),
                        bordered: false,
                    },
                    { default: () => row.status },
                ),
                row.type
                    ? h(
                          NTag,
                          { size: 'small', bordered: false },
                          { default: () => row.type },
                      )
                    : null,
                h(
                    NTag,
                    { size: 'small', type: 'info', bordered: false },
                    { default: () => scopeTag(row) },
                ),
            ]),
    },
    {
        title: 'Slug',
        key: 'slug',
        width: 200,
        ellipsis: { tooltip: true },
        render: (row) =>
            h(
                'span',
                { class: 'font-mono text-xs text-gray-500 dark:text-dark-400' },
                [
                    h(
                        'span',
                        { class: 'mr-1 text-gray-400' },
                        actionLabel(row),
                    ),
                    row.slug,
                ],
            ),
    },
    {
        title: 'By',
        key: 'createdBy',
        width: 140,
        ellipsis: { tooltip: true },
        render: (row) => row.createdBy || '—',
    },
    {
        title: 'When',
        key: 'createdAt',
        width: 100,
        render: (row) =>
            h(
                'span',
                { class: 'text-xs text-gray-500 dark:text-dark-400' },
                relativeTime(row.createdAt),
            ),
    },
    {
        title: i18n.t('common.actions'),
        key: 'actions',
        width: 80,
        render: (row) => {
            if (row.status !== 'rejected') return null;
            return h(
                NButton,
                {
                    size: 'small',
                    quaternary: true,
                    circle: true,
                    type: 'error',
                    title: i18n.t('common.delete'),
                    onClick: (e: MouseEvent) => {
                        e.stopPropagation();
                        confirmDeleteProposal(row);
                    },
                },
                {
                    icon: () => h('div', { class: 'i-tabler-trash' }),
                },
            );
        },
    },
]);

function confirmDeleteProposal(proposal: Proposal) {
    dialog.warning({
        title: 'Delete Proposal',
        content: `Are you sure you want to delete the rejected proposal "${proposal.title}"?`,
        positiveText: i18n.t('common.delete'),
        negativeText: i18n.t('common.cancel'),
        onPositiveClick: async () => {
            try {
                await apiFetch(`/v1/proposals/${proposal.id}`, {
                    method: 'DELETE',
                });
                await fetchProposals();
            } catch (err) {
                error.value = `Failed to delete proposal: ${err instanceof Error ? err.message : 'unknown error'}`;
            }
        },
    });
}

function rowProps(row: Proposal) {
    return {
        style: 'cursor: pointer',
        onClick: () =>
            router.push({
                name: 'dashboard-proposal-detail',
                params: { id: String(row.id) },
            }),
    };
}

async function fetchProposals() {
    loading.value = true;
    try {
        const params = new URLSearchParams({
            page: String(page.value),
            pageSize: String(pageSize.value),
            status: statusFilter.value,
        });
        const data = await apiFetch<ProposalPage>(
            `/v1/proposals?${params.toString()}`,
        );
        proposals.value = data.proposals ?? [];
        total.value = data.total ?? 0;
        page.value = data.page ?? 1;
        pageSize.value = data.pageSize ?? pageSize.value;
        counts.value = data.counts ?? {
            all: 0,
            open: 0,
            approved: 0,
            rejected: 0,
        };
        error.value = '';
    } catch (err) {
        error.value = `Failed to load proposals: ${err instanceof Error ? err.message : 'unknown error'}`;
    } finally {
        loading.value = false;
    }
}

onMounted(fetchProposals);
</script>
