<template>
  <aside
    class="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-gray-200/60 bg-white transition-all duration-300 dark:border-dark-700/60 dark:bg-dark-900"
    :class="[sidebarCollapsed ? 'w-[72px]' : 'w-64', { '-translate-x-full lg:translate-x-0': !mobileOpen }]"
  >
    <!-- Logo -->
    <div class="flex h-16 items-center gap-3 border-b border-gray-100 px-4 dark:border-dark-800" :class="{ 'justify-center': sidebarCollapsed }">
      <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-glow">
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      </div>
      <div v-show="!sidebarCollapsed" class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-lg font-bold text-gray-900 dark:text-white">OpenKB</span>
        <span class="text-xs text-gray-500 dark:text-dark-400">v0.1.0</span>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
      <div class="space-y-1">
        <router-link
          to="/"
          class="sidebar-link"
          :class="{ 'sidebar-link-active': route.path === '/' }"
          @click="handleNavClick"
        >
          <!-- Home icon -->
          <svg class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span v-show="!sidebarCollapsed">Home</span>
        </router-link>
      </div>
    </nav>

    <!-- Bottom section -->
    <div class="border-t border-gray-100 p-3 dark:border-dark-800">
      <button
        class="sidebar-link w-full"
        :class="{ 'justify-center': sidebarCollapsed }"
        @click="toggleSidebar"
        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg v-if="!sidebarCollapsed" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
        </svg>
        <svg v-else class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span v-show="!sidebarCollapsed">Collapse</span>
      </button>
    </div>
  </aside>

  <!-- Mobile overlay -->
  <transition name="fade">
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-30 bg-black/50 lg:hidden"
      @click="closeMobile"
    />
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const mobileOpen = computed(() => appStore.mobileOpen)

function toggleSidebar() {
  appStore.toggleSidebar()
}

function closeMobile() {
  appStore.setMobileOpen(false)
}

function handleNavClick() {
  if (mobileOpen.value) {
    setTimeout(() => appStore.setMobileOpen(false), 150)
  }
}
</script>

<style scoped>
.sidebar-link {
  @apply flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium;
  @apply text-gray-600 transition-all duration-200 hover:(bg-gray-100 text-gray-900);
  @apply dark:text-dark-300 dark:hover:(bg-dark-800 text-white);
}

.sidebar-link-active {
  @apply bg-primary-50 text-primary-700 hover:bg-primary-100;
  @apply dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/30;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
