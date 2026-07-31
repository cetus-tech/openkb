<template>
    <div class="space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
                <n-button
                    quaternary
                    size="small"
                    class="-ml-2 mb-2"
                    @click="router.push({ name: 'dashboard-proposals' })">
                    <template #icon>
                        <div class="i-tabler-arrow-left" />
                    </template>
                    Proposals
                </n-button>
                <div
                    v-if="proposal"
                    class="flex flex-wrap items-center gap-2">
                    <span
                        class="truncate text-xl font-bold leading-none text-gray-900 dark:text-white sm:text-2xl">
                        {{ proposal.title }}
                    </span>
                    <n-tag
                        size="small"
                        :type="statusType(proposal.status)"
                        :bordered="false"
                        >{{ proposal.status }}</n-tag
                    >
                    <n-tag
                        v-if="proposal.type"
                        size="small"
                        :bordered="false"
                        >{{ proposal.type }}</n-tag
                    >
                    <n-tag
                        size="small"
                        type="info"
                        :bordered="false"
                        >{{ scopeTag }}</n-tag
                    >
                </div>
                <h1
                    v-else
                    class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">
                    Loading...
                </h1>
                <div
                    v-if="proposal"
                    class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-dark-400">
                    <span class="font-mono">
                        {{ proposal.knowledgeId ? 'updates' : 'creates' }}
                        {{ proposal.slug }}
                    </span>
                    <span v-if="proposal.createdBy"
                        >by {{ proposal.createdBy }}</span
                    >
                    <span v-if="proposal.createdAt">{{
                        relativeTime(proposal.createdAt)
                    }}</span>
                </div>
            </div>
        </div>

        <n-alert
            v-if="error"
            type="error"
            :bordered="false"
            closable
            @close="error = ''">
            {{ error }}
        </n-alert>

        <n-alert
            v-if="isEditing"
            type="warning"
            :bordered="false">
            {{ i18n.t('proposals.editNotice') }}
        </n-alert>

        <n-spin
            v-if="loading"
            size="large"
            class="flex justify-center py-20" />

        <div
            v-else-if="proposal"
            class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div class="space-y-4">
                <n-alert
                    v-if="!isEditing"
                    type="info"
                    :bordered="false">
                    {{
                        proposal.knowledgeId
                            ? i18n.t('proposals.noticeUpdate').replace('{slug}', proposal.slug)
                            : i18n.t('proposals.noticeCreate').replace('{slug}', proposal.slug)
                    }}
                </n-alert>

                <!-- Two panel layout -->
                <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <!-- Left Panel: Proposed Content (reflecting in-place edits) -->
                    <n-card
                        size="small"
                        :bordered="true">
                        <template #header>
                            <div
                                class="flex items-center justify-between gap-2">
                                <span class="font-medium"
                                    >{{ i18n.t('proposals.proposedContent') }}</span
                                >
                                <div class="flex items-center gap-1.5">
                                    <n-tag
                                        size="small"
                                        :bordered="false"
                                        >{{ proposal.type }}</n-tag
                                    >
                                    <n-tag
                                        size="small"
                                        type="warning"
                                        :bordered="false">
                                        Proposed
                                    </n-tag>
                                </div>
                            </div>
                        </template>

                        <!-- Left Panel Metadata Box -->
                        <div
                            class="mb-3 rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-1.5 text-sm dark:border-dark-700 dark:bg-dark-800/50">
                            <div
                                class="flex flex-wrap items-center justify-between gap-2 font-mono">
                                <span
                                    class="font-semibold text-gray-700 dark:text-dark-200">
                                    slug: {{ proposal.slug }}
                                </span>
                                <span
                                    v-if="proposal.createdBy"
                                    class="text-gray-400">
                                    by {{ proposal.createdBy }}
                                </span>
                            </div>
                            <div
                                class="font-semibold text-sm text-gray-900 dark:text-white">
                                {{ proposal.title }}
                            </div>
                            <p class="text-gray-600 dark:text-dark-300">
                                {{ proposal.summary }}
                            </p>
                        </div>

                        <MarkdownPane
                            :model-value="
                                proposal.proposedContentMarkdown || ''
                            "
                            default-mode="rendered"
                            surface-class="max-h-[55vh] bg-amber-50/40 dark:bg-amber-950/10" />
                    </n-card>

                    <!-- Right Panel: Edit panel when isEditing -->
                    <n-card
                        v-if="proposal.status === 'open' && isEditing"
                        size="small"
                        :bordered="true">
                        <template #header>
                            <div
                                class="flex items-center justify-between gap-2">
                                <span class="font-medium">Edit Proposal</span>
                                <n-tag
                                    size="small"
                                    type="primary"
                                    :bordered="false"
                                    >Editing</n-tag
                                >
                            </div>
                        </template>
                        <div class="space-y-3">
                            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label
                                        class="mb-1 block text-xs font-semibold text-gray-500 dark:text-dark-300"
                                        >Slug</label
                                    >
                                    <div
                                        class="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-xs text-gray-700 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-200">
                                        {{ proposal.slug }}
                                    </div>
                                </div>
                                <div>
                                    <label
                                        class="mb-1 block text-xs font-semibold text-gray-500 dark:text-dark-300"
                                        >Type</label
                                    >
                                    <n-select
                                        v-model:value="editType"
                                        :options="typeOptions"
                                        size="small" />
                                </div>
                            </div>
                            <div>
                                <label
                                    class="mb-1 block text-xs font-semibold text-gray-500 dark:text-dark-300"
                                    >Scope</label
                                >
                                <n-radio-group
                                    v-model:value="editScopeMode"
                                    size="small"
                                    class="mb-2 flex gap-1">
                                    <n-radio-button value="global"
                                        >Global (@global)</n-radio-button
                                    >
                                    <n-radio-button value="project"
                                        >Project-specific</n-radio-button
                                    >
                                </n-radio-group>
                                <div
                                    v-if="editScopeMode === 'project'"
                                    class="mt-2 space-y-2 rounded border border-gray-100 bg-gray-50 p-2.5 dark:border-dark-700 dark:bg-dark-800">
                                    <div>
                                        <label
                                            class="mb-0.5 block text-[11px] text-gray-500 dark:text-dark-300"
                                            >Project Slug</label
                                        >
                                        <n-input
                                            v-model:value="editProjectSlug"
                                            placeholder="e.g. openkb"
                                            size="small" />
                                    </div>
                                    <div>
                                        <label
                                            class="mb-0.5 block text-[11px] text-gray-500 dark:text-dark-300"
                                            >Path Patterns
                                            (comma-separated)</label
                                        >
                                        <n-input
                                            v-model:value="editPathPatterns"
                                            placeholder="e.g. src/**, docs/**"
                                            size="small" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label
                                    class="mb-1 block text-xs font-semibold text-gray-500 dark:text-dark-300"
                                    >Title</label
                                >
                                <n-input
                                    v-model:value="editTitle"
                                    placeholder="Proposal title"
                                    size="small" />
                            </div>
                            <div>
                                <label
                                    class="mb-1 block text-xs font-semibold text-gray-500 dark:text-dark-300"
                                    >Summary</label
                                >
                                <n-input
                                    v-model:value="editSummary"
                                    type="textarea"
                                    placeholder="Proposal summary"
                                    :autosize="{ minRows: 2, maxRows: 4 }" />
                            </div>
                            <div>
                                <label
                                    class="mb-1 block text-xs font-semibold text-gray-500 dark:text-dark-300"
                                    >Content (Markdown)</label
                                >
                                <MarkdownPane
                                    v-model="editContent"
                                    :editable="true"
                                    default-mode="raw"
                                    surface-class="max-h-[45vh]" />
                            </div>
                        </div>
                    </n-card>

                    <!-- Right Panel when NOT editing: Current Active Knowledge or Empty -->
                    <n-card
                        v-else
                        size="small"
                        :bordered="true">
                        <template #header>
                            <div
                                class="flex items-center justify-between gap-2">
                                <span class="font-medium">
                                    {{
                                        currentKnowledge
                                            ? `${i18n.t('proposals.activeVersion')} (v${currentKnowledge.version})`
                                            : i18n.t('proposals.activeVersion')
                                    }}
                                </span>
                                <n-tag
                                    v-if="currentKnowledge"
                                    size="small"
                                    type="success"
                                    :bordered="false"
                                    >Active</n-tag
                                >
                            </div>
                        </template>

                        <div
                            v-if="currentKnowledge"
                            class="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-1.5 text-xs dark:border-emerald-900/30 dark:bg-emerald-950/20">
                            <div
                                class="flex flex-wrap items-center justify-between gap-2 font-mono">
                                <span
                                    class="font-semibold text-gray-700 dark:text-dark-200">
                                    slug: {{ currentKnowledge.slug }}
                                </span>
                                <span
                                    class="text-emerald-600 dark:text-emerald-400 font-medium">
                                    Active (v{{ currentKnowledge.version }})
                                </span>
                            </div>
                            <div
                                class="font-semibold text-sm text-gray-900 dark:text-white">
                                {{ currentKnowledge.title }}
                            </div>
                            <p class="text-gray-600 dark:text-dark-300">
                                {{ currentKnowledge.summary }}
                            </p>
                        </div>

                        <MarkdownPane
                            v-if="currentKnowledge"
                            :model-value="currentKnowledge.content"
                            default-mode="rendered"
                            surface-class="max-h-[55vh]" />
                        <n-empty
                            v-else
                            :description="`No active knowledge yet for ${proposal.slug}`"
                            class="py-12" />
                    </n-card>
                </div>
            </div>

            <div class="space-y-4">
                <n-card
                    size="small"
                    :bordered="true"
                    :title="i18n.t('knowledge.summary')">
                    <p class="text-sm text-gray-600 dark:text-dark-300">
                        {{ isEditing ? editSummary : proposal.summary }}
                    </p>
                </n-card>

                <n-card
                    size="small"
                    :bordered="true"
                    :title="i18n.t('knowledge.scope')">
                    <div
                        v-if="hasScope"
                        class="space-y-3 text-sm">
                        <div v-if="proposal.scope?.projectSlug">
                            <p
                                class="text-xs font-medium uppercase tracking-wide text-gray-400">
                                Project
                            </p>
                            <p
                                class="mt-1 font-mono text-gray-700 dark:text-dark-200">
                                @{{ proposal.scope.projectSlug }}
                            </p>
                        </div>
                        <div v-if="proposal.scope?.pathPatterns?.length">
                            <p
                                class="text-xs font-medium uppercase tracking-wide text-gray-400">
                                Path patterns
                            </p>
                            <div class="mt-1 flex flex-wrap gap-1">
                                <n-tag
                                    v-for="pattern in proposal.scope
                                        .pathPatterns"
                                    :key="pattern"
                                    size="small"
                                    :bordered="false"
                                    >{{ pattern }}</n-tag
                                >
                            </div>
                        </div>
                    </div>
                    <p
                        v-else
                        class="text-sm text-gray-500 dark:text-dark-400">
                        @global — no project, path filters.
                    </p>
                </n-card>

                <n-card
                    v-if="proposal.status === 'open'"
                    size="small"
                    :bordered="true"
                    :title="isEditing ? i18n.t('proposals.editProposal') : i18n.t('proposals.review')">
                    <p class="text-sm text-gray-600 dark:text-dark-300">
                        <template v-if="isEditing">
                            Tweak title, type, summary, or content on the right
                            panel. Save edits in-place to resume later or
                            approve directly.
                        </template>
                        <template v-else>
                            Approve to apply proposed content, edit to make
                            minor tweaks, or reject to leave unchanged.
                        </template>
                    </p>
                    <div
                        v-if="isEditing"
                        class="mt-3 flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <n-button
                                secondary
                                class="flex-1"
                                :disabled="savingEdits || approving"
                                @click="cancelEditing">
                                <template #icon>
                                    <div class="i-tabler-x" />
                                </template>
                                {{ i18n.t('common.cancel') }}
                            </n-button>
                            <n-button
                                type="info"
                                secondary
                                class="flex-1"
                                :loading="savingEdits"
                                :disabled="approving"
                                @click="handleSaveEdits">
                                <template #icon>
                                    <div class="i-tabler-device-floppy" />
                                </template>
                                {{ i18n.t('proposals.saveEdits') }}
                            </n-button>
                        </div>
                        <n-button
                            v-if="session.isAdmin"
                            type="primary"
                            class="w-full"
                            :loading="approving"
                            :disabled="savingEdits"
                            @click="handleSaveAndApprove">
                            <template #icon>
                                <div class="i-tabler-check" />
                            </template>
                            {{ i18n.t('proposals.approveWithEdits') }}
                        </n-button>
                    </div>
                    <div
                        v-else
                        class="mt-3 flex flex-wrap gap-2">
                        <n-button
                            v-if="session.isAdmin"
                            type="error"
                            ghost
                            :loading="rejecting"
                            :disabled="approving"
                            @click="handleReject">
                            <template #icon>
                                <div class="i-tabler-x" />
                            </template>
                            {{ i18n.t('proposals.reject') }}
                        </n-button>
                        <n-button
                            secondary
                            :disabled="approving || rejecting"
                            @click="startEditing">
                            <template #icon>
                                <div class="i-tabler-edit" />
                            </template>
                            {{ i18n.t('common.edit') }}
                        </n-button>
                        <n-button
                            v-if="session.isAdmin"
                            type="primary"
                            :loading="approving"
                            :disabled="rejecting"
                            @click="handleApprove">
                            <template #icon>
                                <div class="i-tabler-check" />
                            </template>
                            {{ i18n.t('proposals.approve') }}
                        </n-button>
                    </div>
                </n-card>

                <n-card
                    v-else
                    size="small"
                    :bordered="true"
                    :title="i18n.t('proposals.reviewResult')">
                    <p class="text-sm text-gray-600 dark:text-dark-300">
                        This proposal is <strong>{{ proposal.status }}</strong
                        >.
                        <template v-if="proposal.status === 'approved'">
                            Open the knowledge item to inspect the new version.
                        </template>
                        <template v-else-if="proposal.status === 'rejected'">
                            Reinstate it to put it back in the open review
                            queue.
                        </template>
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <n-button
                            v-if="proposal.status === 'approved'"
                            type="primary"
                            secondary
                            @click="openKnowledge">
                            <template #icon>
                                <div class="i-tabler-external-link" />
                            </template>
                            {{ i18n.t('proposals.openActive') }}
                        </n-button>
                        <n-button
                            v-if="session.isAdmin && proposal.status === 'rejected'"
                            type="primary"
                            secondary
                            :loading="reinstating"
                            @click="handleReinstate">
                            <template #icon>
                                <div class="i-tabler-rotate-clockwise" />
                            </template>
                            {{ i18n.t('proposals.reinstate') }}
                        </n-button>
                    </div>
                </n-card>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDialog, useMessage } from 'naive-ui';
import MarkdownPane from './components/knowledge/MarkdownPane.vue';
import {
    apiFetch,
    relativeTime,
    type Knowledge,
    type Proposal,
} from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const i18n = useI18nStore();
const session = useSessionStore();

const loading = ref(true);
const error = ref('');
const proposal = ref<Proposal | null>(null);
const currentKnowledge = ref<Knowledge | null>(null);
const approving = ref(false);
const rejecting = ref(false);
const reinstating = ref(false);

const isEditing = ref(false);
const savingEdits = ref(false);
const editTitle = ref('');
const editSummary = ref('');
const editContent = ref('');
const editType = ref('context');
const editScopeMode = ref<'global' | 'project'>('global');
const editProjectSlug = ref('');
const editPathPatterns = ref('');

const typeOptions = [
    { label: 'Rule', value: 'rule' },
    { label: 'Decision', value: 'decision' },
    { label: 'Skill', value: 'skill' },
    { label: 'Context', value: 'context' },
    { label: 'Project', value: 'project' },
];

function getEditScopePayload() {
    if (editScopeMode.value === 'global') {
        return { projectSlug: undefined, pathPatterns: [] };
    }
    const projectSlug = editProjectSlug.value.trim() || undefined;
    const pathPatterns = editPathPatterns.value
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    return { projectSlug, pathPatterns };
}

const hasScope = computed(() => {
    const scope = proposal.value?.scope;
    if (!scope) return false;
    return Boolean(scope.projectSlug || scope.pathPatterns?.length);
});

const scopeTag = computed(() => {
    const project = proposal.value?.scope?.projectSlug?.trim();
    return project ? `@${project}` : '@global';
});

function statusType(
    status: string,
): 'default' | 'info' | 'success' | 'warning' | 'error' {
    if (status === 'open') return 'info';
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'error';
    return 'default';
}

function openKnowledge() {
    if (!proposal.value?.slug) {
        router.push({ name: 'dashboard-knowledge' });
        return;
    }
    router.push({
        name: 'dashboard-knowledge-detail',
        params: { slug: proposal.value.slug },
    });
}

function startEditing() {
    if (!proposal.value || proposal.value.status !== 'open') return;
    editTitle.value = proposal.value.title;
    editSummary.value = proposal.value.summary;
    editContent.value = proposal.value.proposedContentMarkdown || '';
    editType.value = proposal.value.type || 'context';

    const scope = proposal.value.scope;
    if (scope?.projectSlug?.trim() || scope?.pathPatterns?.length) {
        editScopeMode.value = 'project';
        editProjectSlug.value = scope.projectSlug || '';
        editPathPatterns.value = (scope.pathPatterns || []).join(', ');
    } else {
        editScopeMode.value = 'global';
        editProjectSlug.value = '';
        editPathPatterns.value = '';
    }
    isEditing.value = true;
}

function cancelEditing() {
    isEditing.value = false;
}

async function handleSaveEdits() {
    if (!proposal.value) return;
    savingEdits.value = true;
    try {
        await apiFetch(
            `/v1/proposals/${encodeURIComponent(route.params.id as string)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    title: editTitle.value,
                    summary: editSummary.value,
                    proposedContentMarkdown: editContent.value,
                    type: editType.value,
                    scope: getEditScopePayload(),
                }),
            },
        );
        message.success('Proposal edits saved in-place');
        isEditing.value = false;
        await fetchProposal();
    } catch (err) {
        message.error(
            err instanceof Error ? err.message : 'Failed to update proposal',
        );
    } finally {
        savingEdits.value = false;
    }
}

async function handleSaveAndApprove() {
    if (!proposal.value) return;
    dialog.warning({
        title: 'Approve edited proposal',
        content: `Apply edited proposal "${editTitle.value}" as active knowledge?`,
        positiveText: 'Approve & Apply',
        negativeText: 'Cancel',
        onPositiveClick: async () => {
            approving.value = true;
            try {
                await apiFetch(
                    `/v1/proposals/${encodeURIComponent(route.params.id as string)}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            title: editTitle.value,
                            summary: editSummary.value,
                            proposedContentMarkdown: editContent.value,
                            type: editType.value,
                            scope: getEditScopePayload(),
                            status: 'approved',
                        }),
                    },
                );
                message.success(
                    'Proposal edited and approved as active knowledge',
                );
                isEditing.value = false;
                await fetchProposal();
            } catch (err) {
                message.error(
                    err instanceof Error
                        ? err.message
                        : 'Failed to approve proposal',
                );
                throw err;
            } finally {
                approving.value = false;
            }
        },
    });
}

async function fetchProposal() {
    const id = String(route.params.id ?? '');
    loading.value = true;
    try {
        const data = await apiFetch<{ proposal: Proposal }>(
            `/v1/proposals/${encodeURIComponent(id)}`,
        );
        proposal.value = data.proposal;
        if (!proposal.value) throw new Error('Proposal not found');
        currentKnowledge.value = null;
        if (proposal.value.slug) {
            try {
                const knowledgeData = await apiFetch<{ knowledge: Knowledge }>(
                    `/v1/knowledge/${encodeURIComponent(proposal.value.slug)}`,
                );
                currentKnowledge.value = knowledgeData.knowledge;
            } catch (err) {
                if (
                    !(
                        err instanceof Error &&
                        'status' in err &&
                        (err as { status?: number }).status === 404
                    )
                )
                    throw err;
            }
        }
        error.value = '';
    } catch (err) {
        error.value =
            err instanceof Error ? err.message : 'Failed to load proposal';
        message.error(error.value);
    } finally {
        loading.value = false;
    }
}

function handleApprove() {
    if (!proposal.value) return;
    const title = proposal.value.title;
    const id = route.params.id as string;
    dialog.warning({
        title: 'Approve proposal',
        content: `Approve "${title}" and apply it as active knowledge?`,
        positiveText: 'Approve',
        negativeText: 'Cancel',
        onPositiveClick: async () => {
            approving.value = true;
            try {
                await apiFetch(`/v1/proposals/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'approved' }),
                });
                message.success(
                    'Proposal approved and applied as active knowledge',
                );
                await fetchProposal();
            } catch (err) {
                message.error(
                    err instanceof Error
                        ? err.message
                        : 'Failed to approve proposal',
                );
                throw err;
            } finally {
                approving.value = false;
            }
        },
    });
}

function handleReject() {
    if (!proposal.value) return;
    const title = proposal.value.title;
    const id = route.params.id as string;
    dialog.warning({
        title: 'Reject proposal',
        content: `Reject "${title}"? Canonical knowledge will stay unchanged.`,
        positiveText: 'Reject',
        negativeText: 'Cancel',
        onPositiveClick: async () => {
            rejecting.value = true;
            try {
                await apiFetch(`/v1/proposals/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'rejected' }),
                });
                message.success('Proposal rejected');
                await fetchProposal();
            } catch (err) {
                message.error(
                    err instanceof Error
                        ? err.message
                        : 'Failed to reject proposal',
                );
                throw err;
            } finally {
                rejecting.value = false;
            }
        },
    });
}

function handleReinstate() {
    if (!proposal.value || proposal.value.status !== 'rejected') return;
    const title = proposal.value.title;
    const id = route.params.id as string;
    dialog.warning({
        title: 'Reinstate proposal',
        content: `Put "${title}" back in the open review queue?`,
        positiveText: 'Reinstate',
        negativeText: 'Cancel',
        onPositiveClick: async () => {
            reinstating.value = true;
            try {
                await apiFetch(`/v1/proposals/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'open' }),
                });
                message.success(
                    'Proposal reinstated — it is open for review again',
                );
                await fetchProposal();
            } catch (err) {
                message.error(
                    err instanceof Error
                        ? err.message
                        : 'Failed to reinstate proposal',
                );
                throw err;
            } finally {
                reinstating.value = false;
            }
        },
    });
}

onMounted(() => {
    void session.loadSession();
    fetchProposal();
});
</script>
