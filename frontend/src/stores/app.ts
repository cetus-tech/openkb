import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const mobileOpen = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function toggleMobileSidebar() {
    mobileOpen.value = !mobileOpen.value
  }

  function setMobileOpen(v: boolean) {
    mobileOpen.value = v
  }

  return {
    sidebarCollapsed,
    mobileOpen,
    toggleSidebar,
    toggleMobileSidebar,
    setMobileOpen,
  }
})
