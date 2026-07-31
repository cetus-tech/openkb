<template>
  <div class="flex h-screen bg-gray-50 dark:bg-dark-950 overflow-hidden relative">
    <div class="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary-50/30 via-transparent to-blue-50/20 dark:from-primary-950/10 dark:via-transparent dark:to-blue-950/10" />

    <n-layout has-sider class="bg-transparent" position="absolute">
      <!-- Sidebar: full width on desktop, collapsed to 0 on mobile (drawer replaces it) -->
      <n-layout-sider
        bordered
        :collapsed-width="siderCollapsedWidth"
        :width="216"
        :show-trigger="false"
        :collapsed="siderCollapsed"
        :native-scrollbar="false"
        class="bg-white dark:bg-dark-900 z-10"
        @update:collapsed="(value: boolean) => { if (isDesktop && value !== sidebarCollapsed) appStore.toggleSidebar() }"
      >
        <router-link
          to="/"
          class="flex h-14 items-center gap-3 border-b border-gray-100 px-4 dark:border-dark-800 transition-colors hover:bg-gray-50 dark:hover:bg-dark-800/50"
          :class="{ 'justify-center px-2': siderCollapsed }"
        >
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white shadow-glow">
            <div class="i-heroicons-outline-globe-alt text-base" />
          </div>
          <div v-show="!siderCollapsed" class="flex min-w-0 flex-1 flex-col">
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-base font-semibold tracking-tight text-gray-900 dark:text-white">OpenKB</span>
              <n-tag
                v-if="versionStore.version"
                size="tiny"
                round
                :bordered="false"
                class="shrink-0"
                >v{{ versionStore.version }}</n-tag
              >
            </div>
            <span class="text-[11px] text-gray-500 dark:text-dark-400">Knowledge for agents</span>
          </div>
        </router-link>
        <n-menu
          :collapsed-width="72"
          :collapsed-icon-size="22"
          :collapsed="siderCollapsed"
          :value="activeKey"
          :options="menuOptions"
          @update:value="handleMenuSelect"
        />
      </n-layout-sider>

      <!-- Main Content -->
      <div class="flex flex-1 flex-col min-w-0 h-screen z-10 bg-transparent">
        <AppHeader class="shrink-0" />
        <div class="flex-1 overflow-y-auto">
          <div class="flex min-h-full flex-col">
            <div class="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8 flex-1">
              <router-view />
            </div>
            <AppFooter class="shrink-0 mt-auto" />
          </div>
        </div>
      </div>
    </n-layout>

    <!-- Mobile drawer navigation -->
    <n-drawer
      v-model:show="mobileOpen"
      :width="280"
      placement="left"
      :trap-focus="false"
      to="body"
    >
      <n-drawer-content
        :native-scrollbar="false"
        body-content-style="padding: 0;"
        header-style="padding: 0;"
      >
        <template #header>
          <router-link to="/" class="flex h-14 w-full items-center gap-3 border-b border-gray-100 px-4 dark:border-dark-800 transition-colors hover:bg-gray-50 dark:hover:bg-dark-800/50">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white shadow-glow">
              <div class="i-heroicons-outline-globe-alt text-base" />
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-base font-semibold tracking-tight text-gray-900 dark:text-white">OpenKB</span>
              <span class="text-[11px] text-gray-500 dark:text-dark-400">Knowledge for agents</span>
            </div>
          </router-link>
        </template>
        <n-menu
          :value="activeKey"
          :options="menuOptions"
          @update:value="handleMenuSelect"
        />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MenuOption } from 'naive-ui'
import { NIcon } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { useI18nStore } from '@/stores/i18n'
import { useVersionStore } from '@/stores/version'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const versionStore = useVersionStore()

const isDesktop = ref(true)
let mediaQuery: MediaQueryList | null = null

function syncViewport() {
  isDesktop.value = mediaQuery?.matches ?? true
  if (isDesktop.value) appStore.setMobileOpen(false)
}

onMounted(() => {
  void versionStore.loadVersion()
  mediaQuery = window.matchMedia('(min-width: 1024px)')
  syncViewport()
  mediaQuery.addEventListener('change', syncViewport)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', syncViewport)
})

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const siderCollapsed = computed(() => (!isDesktop.value ? true : sidebarCollapsed.value))
const siderCollapsedWidth = computed(() => (isDesktop.value ? 72 : 0))
const mobileOpen = computed({
  get: () => appStore.mobileOpen,
  set: (value: boolean) => appStore.setMobileOpen(value),
})

const activeKey = computed(() => {
  if (route.path === '/dashboard' || route.path === '/dashboard/') return 'dashboard'
  if (route.path.startsWith('/dashboard/knowledge')) return 'knowledge'
  if (route.path.startsWith('/dashboard/proposals')) return 'proposals'
  if (route.path.startsWith('/dashboard/agents')) return 'agents'
  if (route.path.startsWith('/dashboard/users')) return 'users'
  if (route.path.startsWith('/dashboard/settings')) return 'settings'
  return ''
})

const renderIcon = (iconClass: string) => {
  return () => h(NIcon, null, { default: () => h('div', { class: iconClass }) })
}

const i18n = useI18nStore()

const menuOptions = computed<MenuOption[]>(() => [
  {
    key: 'dashboard',
    label: i18n.t('nav.dashboard'),
    icon: renderIcon('i-mdi-view-dashboard text-lg'),
  },
  {
    key: 'knowledge',
    label: i18n.t('nav.knowledge'),
    icon: renderIcon('i-mdi-database text-lg'),
  },
  {
    key: 'proposals',
    label: i18n.t('nav.proposals'),
    icon: renderIcon('i-mdi-source-pull text-lg'),
  },
  {
    key: 'agents',
    label: i18n.t('nav.agents'),
    icon: renderIcon('i-mdi-robot text-lg'),
  },
  {
    key: 'users',
    label: i18n.t('nav.users'),
    icon: renderIcon('i-mdi-account-group text-lg'),
  },
  {
    key: 'settings',
    label: i18n.t('nav.settings'),
    icon: renderIcon('i-mdi-cog text-lg'),
  },
])

const routeByKey: Record<string, string> = {
  dashboard: '/dashboard',
  knowledge: '/dashboard/knowledge',
  proposals: '/dashboard/proposals',
  agents: '/dashboard/agents',
  users: '/dashboard/users',
  settings: '/dashboard/settings',
}

function handleMenuSelect(key: string) {
  const path = routeByKey[key]
  if (path) router.push(path)
  appStore.setMobileOpen(false)
}

watch(
  () => route.fullPath,
  () => {
    if (appStore.mobileOpen) appStore.setMobileOpen(false)
  },
)
</script>
