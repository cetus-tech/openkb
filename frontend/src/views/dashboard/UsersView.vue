<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-bold leading-tight text-gray-900 dark:text-white">{{ i18n.t('users.title') }}</h1>
        <p class="mt-4 mb-0 max-w-4xl text-sm text-gray-500 dark:text-dark-400">
          {{ i18n.t('users.subtitle') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <n-button quaternary :loading="loading" title="Refresh users" @click="fetchUsers">
          <template #icon><div class="i-tabler-refresh" /></template>
          {{ i18n.t('common.refresh') }}
        </n-button>
        <n-button v-if="isOwner" type="primary" @click="openCreate">
          <template #icon><div class="i-tabler-user-plus" /></template>
          {{ i18n.t('users.addUser') }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="error" type="error" :bordered="false" closable @close="error = ''">
      {{ error }}
    </n-alert>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <n-card v-for="stat in stats" :key="stat.label" size="small" :bordered="true">
        <n-statistic :label="stat.label" :value="stat.value" />
      </n-card>
    </div>

    <n-spin v-if="loading && !users.length" size="large" class="flex justify-center py-20" />

    <n-card v-else size="small" :bordered="true">
      <n-data-table size="small" :bordered="false" :single-line="false" :columns="columns" :data="users" :row-key="(r: DashboardUser) => r.id" />
    </n-card>

    <n-modal v-model:show="showCreate" preset="card" :title="i18n.t('users.addUser')" class="w-[min(440px,calc(100vw-2rem))]">
      <n-form :model="createForm" @submit.prevent="createUser">
        <n-form-item :label="i18n.t('users.displayName')" required>
          <n-input v-model:value="createForm.name" :placeholder="i18n.t('users.displayName')" maxlength="120" />
        </n-form-item>
        <n-form-item :label="i18n.t('users.email')" required>
          <n-input v-model:value="createForm.email" type="email" placeholder="jane@example.com" maxlength="255" />
        </n-form-item>
        <n-form-item :label="i18n.t('users.initialPassword')" required>
          <n-input v-model:value="createForm.password" type="password" show-password-on="click" :placeholder="i18n.t('settings.newPassword')" />
        </n-form-item>
        <n-form-item :label="i18n.t('users.role')">
          <n-select v-model:value="createForm.role" :options="roleOptions" />
        </n-form-item>
        <div class="flex justify-end gap-2">
          <n-button @click="showCreate = false">{{ i18n.t('common.cancel') }}</n-button>
          <n-button type="primary" attr-type="submit" :loading="creating">{{ i18n.t('common.create') }}</n-button>
        </div>
      </n-form>
    </n-modal>

    <n-modal v-model:show="showEditName" preset="card" :title="i18n.t('users.editNameTitle')" class="w-[min(440px,calc(100vw-2rem))]">
      <n-form @submit.prevent="saveName">
        <p class="mb-3 text-sm text-gray-500 dark:text-dark-400">
          {{ i18n.t('users.displayNameFor') }} <strong>{{ nameTarget?.email }}</strong>.
        </p>
        <n-form-item :label="i18n.t('users.displayName')" required>
          <n-input v-model:value="nameForm.name" :placeholder="i18n.t('users.displayName')" maxlength="120" />
        </n-form-item>
        <div class="flex justify-end gap-2">
          <n-button @click="showEditName = false">{{ i18n.t('common.cancel') }}</n-button>
          <n-button type="primary" attr-type="submit" :loading="savingName">{{ i18n.t('common.save') }}</n-button>
        </div>
      </n-form>
    </n-modal>

    <n-modal v-model:show="showPassword" preset="card" :title="i18n.t('settings.changePassword')" class="w-[min(440px,calc(100vw-2rem))]">
      <n-form @submit.prevent="savePassword">
        <p class="mb-3 text-sm text-gray-500 dark:text-dark-400">
          {{ i18n.t('users.setNewPasswordFor') }} <strong>{{ passwordTarget?.name || passwordTarget?.email }}</strong>.
        </p>
        <n-form-item :label="i18n.t('settings.changePassword')" required>
          <n-input v-model:value="passwordForm.password" type="password" show-password-on="click" :placeholder="i18n.t('settings.newPassword')" />
        </n-form-item>
        <div class="flex justify-end gap-2">
          <n-button @click="showPassword = false">{{ i18n.t('common.cancel') }}</n-button>
          <n-button type="primary" attr-type="submit" :loading="savingPassword">{{ i18n.t('common.save') }}</n-button>
        </div>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useDialog, useMessage, NButton, NSelect, NTag, type DataTableColumns, type SelectOption } from 'naive-ui'
import { apiFetch, relativeTime } from '@/utils/api'
import { useI18nStore } from '@/stores/i18n'

interface DashboardUser {
  id: number
  email: string
  name: string
  role: string
  createdAt: string
  updatedAt?: string
}

const message = useMessage()
const dialog = useDialog()
const i18n = useI18nStore()
const loading = ref(true)
const error = ref('')
const users = ref<DashboardUser[]>([])
const currentUserId = ref<number | null>(null)
const currentUserRole = ref('')
const showCreate = ref(false)
const creating = ref(false)
const showPassword = ref(false)
const savingPassword = ref(false)
const passwordTarget = ref<DashboardUser | null>(null)

const createForm = reactive({
  name: '',
  email: '',
  password: '',
  role: 'member',
})
const passwordForm = reactive({ password: '' })
const showEditName = ref(false)
const savingName = ref(false)
const nameTarget = ref<DashboardUser | null>(null)
const nameForm = reactive({ name: '' })

const roleOptions = computed<SelectOption[]>(() => [
  { label: i18n.t('users.member'), value: 'member' },
  { label: i18n.t('users.admin'), value: 'owner' },
])

const isOwner = computed(() => currentUserRole.value === 'owner')

const stats = computed(() => [
  { label: i18n.t('users.statTotalUsers'), value: users.value.length },
  { label: i18n.t('users.statOwners'), value: users.value.filter((u) => u.role === 'owner').length },
  { label: i18n.t('users.statMembers'), value: users.value.filter((u) => u.role === 'member').length },
])

function roleType(role: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (role === 'owner') return 'error'
  return 'info'
}

const columns = computed<DataTableColumns<DashboardUser>>(() => {
  const cols: DataTableColumns<DashboardUser> = [
    {
      title: i18n.t('users.displayName'),
      key: 'name',
      ellipsis: { tooltip: true },
      render: (row) =>
        h('div', { class: 'flex min-w-0 flex-wrap items-center gap-2' }, [
          h('span', { class: 'truncate font-medium text-gray-900 dark:text-white' }, row.name || '—'),
          row.id === currentUserId.value
            ? h(NTag, { size: 'small', type: 'success', bordered: false }, { default: () => i18n.t('users.you') })
            : null,
        ]),
    },
    {
      title: i18n.t('users.email'),
      key: 'email',
      ellipsis: { tooltip: true },
      render: (row) => h('span', { class: 'truncate text-gray-700 dark:text-dark-200' }, row.email),
    },
    {
      title: i18n.t('users.role'),
      key: 'role',
      width: 160,
      render: (row) => {
        if (!isOwner.value || row.id === currentUserId.value) {
          const roleLabel = row.role === 'owner' ? i18n.t('users.admin') : i18n.t('users.member')
          return h(NTag, { size: 'small', type: roleType(row.role), bordered: false }, { default: () => roleLabel })
        }
        return h(NSelect, {
          value: row.role,
          options: roleOptions.value,
          size: 'small',
          class: 'w-32',
          onUpdateValue: (value: string) => updateRole(row, value),
        })
      },
    },
    {
      title: i18n.t('agents.created'),
      key: 'createdAt',
      width: 110,
      render: (row) => h('span', { class: 'text-xs text-gray-500 dark:text-dark-400' }, relativeTime(row.createdAt)),
    },
  ]

  cols.push({
    title: i18n.t('common.actions'),
    key: 'actions',
    width: isOwner.value ? 220 : 100,
    render: (row) => {
      const canEdit = isOwner.value || row.id === currentUserId.value
      return h('div', { class: 'flex gap-1' }, [
        canEdit
          ? h(
              NButton,
              {
                size: 'small',
                quaternary: true,
                title: i18n.t('users.editNameTitle'),
                onClick: () => openEditName(row),
              },
              { default: () => i18n.t('common.edit'), icon: () => h('div', { class: 'i-tabler-user' }) },
            )
          : null,
        isOwner.value
          ? h(
              NButton,
              {
                size: 'small',
                quaternary: true,
                title: i18n.t('settings.changePassword'),
                onClick: () => openPassword(row),
              },
              { default: () => i18n.t('settings.changePassword'), icon: () => h('div', { class: 'i-tabler-key' }) },
            )
          : null,
        isOwner.value && row.id !== currentUserId.value
          ? h(
              NButton,
              {
                size: 'small',
                quaternary: true,
                type: 'error',
                title: i18n.t('common.delete'),
                onClick: () => deleteUser(row),
              },
              { icon: () => h('div', { class: 'i-tabler-trash' }) },
            )
          : null,
      ])
    },
  })

  return cols
})

function openCreate() {
  createForm.name = ''
  createForm.email = ''
  createForm.password = ''
  createForm.role = 'member'
  showCreate.value = true
}

function openEditName(user: DashboardUser) {
  nameTarget.value = user
  nameForm.name = user.name || ''
  showEditName.value = true
}

function openPassword(user: DashboardUser) {
  passwordTarget.value = user
  passwordForm.password = ''
  showPassword.value = true
}

async function fetchUsers() {
  loading.value = true
  try {
    const [session, data] = await Promise.all([
      apiFetch<{ user: { id: number; role: string } }>('/auth/session'),
      apiFetch<{ users: DashboardUser[]; currentUserId: number }>('/v1/users'),
    ])
    currentUserId.value = session.user.id
    currentUserRole.value = session.user.role
    users.value = data.users ?? []
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function createUser() {
  const email = createForm.email.trim()
  const password = createForm.password
  const name = createForm.name.trim()
  if (!email || !password) {
    message.error('Email and password are required')
    return
  }
  creating.value = true
  try {
    await apiFetch('/v1/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, role: createForm.role, ...(name ? { name } : {}) }),
    })
    message.success('User created')
    showCreate.value = false
    await fetchUsers()
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Failed to create user')
  } finally {
    creating.value = false
  }
}

async function saveName() {
  if (!nameTarget.value) return
  const name = nameForm.name.trim()
  if (!name) {
    message.error('Name cannot be empty')
    return
  }
  savingName.value = true
  try {
    await apiFetch(`/v1/users/${nameTarget.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
    message.success('Name updated')
    showEditName.value = false
    nameTarget.value = null
    await fetchUsers()
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Failed to update name')
  } finally {
    savingName.value = false
  }
}

async function updateRole(user: DashboardUser, role: string) {
  if (role === user.role) return
  const previous = user.role
  user.role = role
  try {
    await apiFetch(`/v1/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    message.success('Role updated')
    await fetchUsers()
  } catch (err) {
    user.role = previous
    message.error(err instanceof Error ? err.message : 'Failed to update role')
  }
}

async function savePassword() {
  if (!passwordTarget.value) return
  const password = passwordForm.password
  if (password.length < 6) {
    message.error('Password must be at least 6 characters')
    return
  }
  savingPassword.value = true
  try {
    await apiFetch(`/v1/users/${passwordTarget.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    })
    message.success('Password updated')
    showPassword.value = false
    passwordTarget.value = null
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Failed to update password')
  } finally {
    savingPassword.value = false
  }
}

function deleteUser(user: DashboardUser) {
  dialog.warning({
    title: i18n.t('users.deleteUserTitle'),
    content: i18n.t('users.deleteUserConfirm').replace('{email}', user.email),
    positiveText: i18n.t('common.delete'),
    negativeText: i18n.t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await apiFetch(`/v1/users/${user.id}`, { method: 'DELETE' })
        message.success('User deleted')
        await fetchUsers()
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to delete user')
        throw err
      }
    },
  })
}

onMounted(fetchUsers)
</script>
