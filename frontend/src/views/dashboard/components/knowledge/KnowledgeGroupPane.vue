<template>
    <div class="flex flex-col">
        <div class="mb-2 flex items-center justify-between gap-2">
            <div
                class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-400">
                {{ i18n.t('knowledge.groups') }}
            </div>
            <n-button
                v-if="isAdmin"
                size="tiny"
                quaternary
                circle
                :title="i18n.t('knowledge.newGroup')"
                @click="startCreate(null)">
                <template #icon><div class="i-tabler-folder-plus" /></template>
            </n-button>
        </div>

        <div class="max-h-[60vh] overflow-y-auto">
            <n-spin
                :show="loading"
                size="small">
                <n-tree
                    block-line
                    selectable
                    expand-on-click
                    :draggable="isAdmin"
                    :data="treeOptions"
                    :selected-keys="selectedKeys"
                    :node-props="nodeProps"
                    :render-label="renderLabel"
                    :render-suffix="renderSuffix"
                    :render-prefix="renderPrefix"
                    :allow-drop="allowDrop"
                    :default-expand-all="true"
                    @update:selected-keys="onTreeSelect"
                    @drop="onTreeDrop" />
                <div
                    v-if="!loading && !tree.length"
                    class="px-1 pt-1 text-xs text-gray-400 dark:text-dark-500">
                    {{ i18n.t('knowledge.noGroups') }}
                </div>
            </n-spin>
        </div>

        <n-modal
            v-model:show="showNameModal"
            preset="card"
            :title="
                nameModalMode === 'create'
                    ? i18n.t('knowledge.newGroup')
                    : i18n.t('knowledge.renameGroup')
            "
            class="w-[min(400px,calc(100vw-2rem))]">
            <n-input
                v-model:value="nameDraft"
                autofocus
                :placeholder="i18n.t('knowledge.groupNamePlaceholder')"
                @keyup.enter="submitNameModal" />
            <template #footer>
                <div class="flex justify-end gap-2">
                    <n-button @click="showNameModal = false">{{
                        i18n.t('common.cancel')
                    }}</n-button>
                    <n-button
                        type="primary"
                        :loading="saving"
                        :disabled="!nameDraft.trim()"
                        @click="submitNameModal">
                        {{
                            nameModalMode === 'create'
                                ? i18n.t('common.create')
                                : i18n.t('common.save')
                        }}
                    </n-button>
                </div>
            </template>
        </n-modal>
    </div>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue';
import {
    NButton,
    NDropdown,
    useDialog,
    useMessage,
    type DropdownOption,
    type TreeDropInfo,
    type TreeOption,
} from 'naive-ui';
import {
    apiFetch,
    type KnowledgeGroupTreeNode,
    type KnowledgeGroupsPayload,
} from '@/utils/api';
import { useI18nStore } from '@/stores/i18n';

export type GroupSelection = 'all' | 'ungrouped' | number;

const ALL_KEY = '__all__';
const UNGROUPED_KEY = '__ungrouped__';

const props = defineProps<{
    selection: GroupSelection;
    isAdmin: boolean;
}>();

const emit = defineEmits<{
    'select': [selection: GroupSelection];
    'changed': [];
    'knowledge-moved': [];
}>();

const i18n = useI18nStore();
const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const saving = ref(false);
const tree = ref<KnowledgeGroupTreeNode[]>([]);
const ungroupedCount = ref(0);
const totalCount = ref(0);
const dragOverKey = ref<string | number | null>(null);

const showNameModal = ref(false);
const nameModalMode = ref<'create' | 'rename'>('create');
const nameDraft = ref('');
const createParentId = ref<number | null>(null);
const renameGroupId = ref<number | null>(null);

const KNOWLEDGE_MIME = 'application/x-openkb-knowledge';

const selectedKeys = computed(() => {
    if (props.selection === 'all') return [ALL_KEY];
    if (props.selection === 'ungrouped') return [UNGROUPED_KEY];
    return [props.selection];
});

/** All / Ungrouped / root groups share one top-level tree list. */
const treeOptions = computed<TreeOption[]>(() => [
    {
        key: ALL_KEY,
        label: i18n.t('knowledge.allKnowledge'),
        knowledgeCount: totalCount.value,
        isLeaf: true,
        isVirtual: true,
        virtualKind: 'all',
    },
    {
        key: UNGROUPED_KEY,
        label: i18n.t('knowledge.ungrouped'),
        knowledgeCount: ungroupedCount.value,
        isLeaf: true,
        isVirtual: true,
        virtualKind: 'ungrouped',
    },
    ...tree.value.map(toTreeOption),
]);

function toTreeOption(node: KnowledgeGroupTreeNode): TreeOption {
    return {
        key: node.id,
        label: node.name,
        knowledgeCount: node.knowledgeCount,
        isVirtual: false,
        children: node.children.length
            ? node.children.map(toTreeOption)
            : undefined,
        isLeaf: node.children.length === 0,
    };
}

function isVirtualKey(key: string | number | undefined | null): boolean {
    return key === ALL_KEY || key === UNGROUPED_KEY;
}

function isRealGroupKey(
    key: string | number | undefined | null,
): key is number {
    return typeof key === 'number' && Number.isFinite(key);
}

function renderPrefix({ option }: { option: TreeOption }) {
    const kind = option.virtualKind as string | undefined;
    const icon =
        kind === 'all'
            ? 'i-tabler-books'
            : kind === 'ungrouped'
              ? 'i-tabler-folder-off'
              : 'i-tabler-folder';
    return h('div', {
        class: [
            icon,
            'text-base opacity-70',
            dragOverKey.value === option.key
                ? 'text-primary-600 dark:text-primary-400'
                : '',
        ],
    });
}

function renderLabel({ option }: { option: TreeOption }) {
    return h(
        'span',
        {
            class: [
                'truncate',
                dragOverKey.value === option.key
                    ? 'text-primary-600 dark:text-primary-400'
                    : '',
            ],
        },
        String(option.label ?? ''),
    );
}

function renderSuffix({ option }: { option: TreeOption }) {
    const count = Number(option.knowledgeCount ?? 0);
    const countEl = h(
        'span',
        {
            class: 'tabular-nums pr-1 text-[11px] text-gray-400 dark:text-dark-500',
        },
        String(count),
    );

    if (!props.isAdmin || option.isVirtual) {
        return h('div', { class: 'flex items-center' }, [countEl]);
    }

    const menu: DropdownOption[] = [
        { label: i18n.t('knowledge.newSubgroup'), key: 'add-child' },
        { label: i18n.t('knowledge.renameGroup'), key: 'rename' },
        { type: 'divider', key: 'd1' },
        { label: i18n.t('common.delete'), key: 'delete' },
    ];
    return h(
        'div',
        {
            class: 'flex items-center gap-1',
            onClick: (e: MouseEvent) => e.stopPropagation(),
        },
        [
            countEl,
            h(
                NDropdown,
                {
                    trigger: 'click',
                    options: menu,
                    onSelect: (key: string | number) =>
                        onMenuSelect(String(key), Number(option.key)),
                },
                {
                    default: () =>
                        h(
                            NButton,
                            {
                                size: 'tiny',
                                quaternary: true,
                                circle: true,
                                title: i18n.t('common.manage'),
                            },
                            {
                                icon: () =>
                                    h('div', { class: 'i-tabler-dots' }),
                            },
                        ),
                },
            ),
        ],
    );
}

function nodeProps({ option }: { option: TreeOption }) {
    return {
        draggable: props.isAdmin && !option.isVirtual,
        class:
            dragOverKey.value === option.key
                ? 'group-tree-drop-target'
                : undefined,
        onDragstart: (e: DragEvent) => {
            // Virtual filter nodes are not reorderable.
            if (option.isVirtual) {
                e.preventDefault();
                e.stopPropagation();
            }
        },
        onDragover: (e: DragEvent) => {
            if (e.dataTransfer?.types.includes(KNOWLEDGE_MIME)) {
                // Knowledge can drop on real groups or Ungrouped (clear group).
                if (option.isVirtual && option.virtualKind !== 'ungrouped')
                    return;
                e.preventDefault();
                e.stopPropagation();
                dragOverKey.value = option.key ?? null;
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            }
        },
        onDragleave: () => {
            if (dragOverKey.value === option.key) dragOverKey.value = null;
        },
        onDrop: (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes(KNOWLEDGE_MIME)) return;
            e.preventDefault();
            e.stopPropagation();
            dragOverKey.value = null;
            const slug = e.dataTransfer.getData(KNOWLEDGE_MIME);
            if (!slug) return;
            if (option.virtualKind === 'ungrouped') {
                void moveKnowledge(slug, null);
                return;
            }
            if (isRealGroupKey(option.key)) {
                void moveKnowledge(slug, option.key);
            }
        },
    };
}

function allowDrop({
    dropPosition,
    node,
}: {
    dropPosition: 'before' | 'inside' | 'after';
    node: TreeOption;
}): boolean {
    if (!props.isAdmin) return false;
    // Never nest under virtual filter nodes; never drop "before" All (keep filters first).
    if (node.isVirtual) {
        if (node.key === ALL_KEY) return false;
        // Allow dropping a group after Ungrouped (becomes first root group) or after All is blocked.
        if (node.key === UNGROUPED_KEY) return dropPosition === 'after';
        return false;
    }
    return (
        dropPosition === 'before' ||
        dropPosition === 'after' ||
        dropPosition === 'inside'
    );
}

function onTreeSelect(keys: Array<string | number>) {
    const key = keys[0];
    if (key === ALL_KEY) {
        emit('select', 'all');
        return;
    }
    if (key === UNGROUPED_KEY) {
        emit('select', 'ungrouped');
        return;
    }
    if (typeof key === 'number') emit('select', key);
    else if (typeof key === 'string' && /^\d+$/.test(key))
        emit('select', Number(key));
}

async function moveKnowledge(slug: string, groupId: number | null) {
    try {
        await apiFetch(`/v1/knowledge/${encodeURIComponent(slug)}/group`, {
            method: 'PATCH',
            body: JSON.stringify({ groupId }),
        });
        message.success(i18n.t('knowledge.movedToGroup'));
        await fetchGroups();
        emit('knowledge-moved');
    } catch (err) {
        message.error(
            err instanceof Error ? err.message : 'Failed to move knowledge',
        );
    }
}

function startCreate(parentId: number | null) {
    nameModalMode.value = 'create';
    createParentId.value = parentId;
    nameDraft.value = '';
    showNameModal.value = true;
}

function startRename(id: number, currentName: string) {
    nameModalMode.value = 'rename';
    renameGroupId.value = id;
    nameDraft.value = currentName;
    showNameModal.value = true;
}

async function submitNameModal() {
    const name = nameDraft.value.trim();
    if (!name) return;
    saving.value = true;
    try {
        if (nameModalMode.value === 'create') {
            await apiFetch('/v1/knowledge-groups', {
                method: 'POST',
                body: JSON.stringify({ name, parentId: createParentId.value }),
            });
            message.success(i18n.t('knowledge.groupCreated'));
        } else if (renameGroupId.value != null) {
            await apiFetch(`/v1/knowledge-groups/${renameGroupId.value}`, {
                method: 'PATCH',
                body: JSON.stringify({ name }),
            });
            message.success(i18n.t('knowledge.groupRenamed'));
        }
        showNameModal.value = false;
        await fetchGroups();
        emit('changed');
    } catch (err) {
        message.error(
            err instanceof Error ? err.message : 'Failed to save group',
        );
    } finally {
        saving.value = false;
    }
}

function onMenuSelect(key: string, groupId: number) {
    if (key === 'add-child') {
        startCreate(groupId);
        return;
    }
    if (key === 'rename') {
        const name = findGroupName(tree.value, groupId) ?? '';
        startRename(groupId, name);
        return;
    }
    if (key === 'delete') {
        dialog.warning({
            title: i18n.t('knowledge.deleteGroup'),
            content: i18n.t('knowledge.deleteGroupConfirm'),
            positiveText: i18n.t('common.delete'),
            negativeText: i18n.t('common.cancel'),
            onPositiveClick: async () => {
                try {
                    await apiFetch(`/v1/knowledge-groups/${groupId}`, {
                        method: 'DELETE',
                    });
                    message.success(i18n.t('knowledge.groupDeleted'));
                    if (props.selection === groupId) emit('select', 'all');
                    await fetchGroups();
                    emit('changed');
                    emit('knowledge-moved');
                } catch (err) {
                    message.error(
                        err instanceof Error
                            ? err.message
                            : 'Failed to delete group',
                    );
                    throw err;
                }
            },
        });
    }
}

function findGroupName(
    nodes: KnowledgeGroupTreeNode[],
    id: number,
): string | undefined {
    for (const node of nodes) {
        if (node.id === id) return node.name;
        const nested = findGroupName(node.children, id);
        if (nested) return nested;
    }
    return undefined;
}

/**
 * Apply an n-tree drop to a deep-cloned real-group tree (virtual nodes excluded).
 */
function applyTreeDrop(
    roots: KnowledgeGroupTreeNode[],
    dragId: number,
    dropId: number,
    dropPosition: 'before' | 'inside' | 'after',
): KnowledgeGroupTreeNode[] | null {
    type Mutable = KnowledgeGroupTreeNode;
    const clone = structuredClone(roots) as Mutable[];

    let dragNode: Mutable | null = null;

    function remove(list: Mutable[], id: number): boolean {
        const idx = list.findIndex((n) => n.id === id);
        if (idx >= 0) {
            dragNode = list.splice(idx, 1)[0] ?? null;
            return true;
        }
        for (const n of list) {
            if (remove(n.children, id)) return true;
        }
        return false;
    }

    function findParentList(list: Mutable[], id: number): Mutable[] | null {
        if (list.some((n) => n.id === id)) return list;
        for (const n of list) {
            const found = findParentList(n.children, id);
            if (found) return found;
        }
        return null;
    }

    function findNode(list: Mutable[], id: number): Mutable | null {
        for (const n of list) {
            if (n.id === id) return n;
            const nested = findNode(n.children, id);
            if (nested) return nested;
        }
        return null;
    }

    if (!remove(clone, dragId) || !dragNode) return null;
    if (dropPosition === 'inside') {
        const target = findNode(clone, dropId);
        if (!target) return null;
        target.children.push(dragNode);
        return clone;
    }
    const siblings = findParentList(clone, dropId);
    if (!siblings) return null;
    const dropIndex = siblings.findIndex((n) => n.id === dropId);
    if (dropIndex < 0) return null;
    const insertAt = dropPosition === 'before' ? dropIndex : dropIndex + 1;
    siblings.splice(insertAt, 0, dragNode);
    return clone;
}

function flattenForReorder(
    roots: KnowledgeGroupTreeNode[],
    parentId: number | null = null,
): Array<{ id: number; parentId: number | null; sortOrder: number }> {
    const items: Array<{
        id: number;
        parentId: number | null;
        sortOrder: number;
    }> = [];
    roots.forEach((node, index) => {
        items.push({ id: node.id, parentId, sortOrder: index });
        items.push(...flattenForReorder(node.children, node.id));
    });
    return items;
}

async function onTreeDrop({ node, dragNode, dropPosition }: TreeDropInfo) {
    if (!props.isAdmin) return;
    if (isVirtualKey(dragNode.key)) return;

    const dragId = Number(dragNode.key);
    if (!Number.isFinite(dragId)) return;

    let next: KnowledgeGroupTreeNode[] | null = null;

    // Drop after Ungrouped → first root-level group.
    if (node.key === UNGROUPED_KEY && dropPosition === 'after') {
        const clone = structuredClone(tree.value) as KnowledgeGroupTreeNode[];
        // Remove drag node from wherever it is, then unshift to root.
        const strip = (
            list: KnowledgeGroupTreeNode[],
        ): KnowledgeGroupTreeNode | null => {
            const idx = list.findIndex((n) => n.id === dragId);
            if (idx >= 0) return list.splice(idx, 1)[0] ?? null;
            for (const n of list) {
                const found = strip(n.children);
                if (found) return found;
            }
            return null;
        };
        const moved = strip(clone);
        if (!moved) return;
        clone.unshift(moved);
        next = clone;
    } else if (isRealGroupKey(node.key)) {
        next = applyTreeDrop(tree.value, dragId, node.key, dropPosition);
    } else {
        return;
    }

    if (!next) return;
    const items = flattenForReorder(next);
    try {
        const data = await apiFetch<KnowledgeGroupsPayload>(
            '/v1/knowledge-groups/reorder',
            {
                method: 'PUT',
                body: JSON.stringify({ items }),
            },
        );
        tree.value = data.tree;
        ungroupedCount.value = data.ungroupedCount;
        totalCount.value = data.totalCount;
        emit('changed');
    } catch (err) {
        message.error(
            err instanceof Error ? err.message : 'Failed to reorder groups',
        );
        await fetchGroups();
    }
}

async function fetchGroups() {
    loading.value = true;
    try {
        const data = await apiFetch<KnowledgeGroupsPayload>(
            '/v1/knowledge-groups',
        );
        tree.value = data.tree ?? [];
        ungroupedCount.value = data.ungroupedCount ?? 0;
        totalCount.value = data.totalCount ?? 0;
    } catch (err) {
        message.error(
            err instanceof Error ? err.message : 'Failed to load groups',
        );
    } finally {
        loading.value = false;
    }
}

defineExpose({ refresh: fetchGroups });

fetchGroups();
</script>

<style scoped>
:deep(.group-tree-drop-target) {
    background: rgba(59, 130, 246, 0.12);
    border-radius: 0.375rem;
}
</style>
