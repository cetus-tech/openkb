import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '@/utils/api'

export type DashboardRole = 'owner' | 'admin' | 'member'

/**
 * Current dashboard user's role, resolved once from /auth/session.
 * Owner-only actions are hidden until the role resolves; an unknown role is
 * treated as member (the backend still enforces everything anyway).
 */
export const useSessionStore = defineStore('session', () => {
  const role = ref<DashboardRole | null>(null)
  const loaded = ref(false)
  const isOwner = computed(() => role.value === 'owner')
  /** Owner implies admin; both share the admin surface. */
  const isAdmin = computed(() => role.value === 'owner' || role.value === 'admin')

  async function loadSession() {
    if (loaded.value) return
    loaded.value = true
    try {
      const data = await apiFetch<{ user?: { role?: string } }>('/auth/session')
      if (data.user?.role === 'owner' || data.user?.role === 'admin' || data.user?.role === 'member') {
        role.value = data.user.role
      }
    } catch {
      loaded.value = false // retry on a later navigation (e.g. after sign-in)
    }
  }

  return { role, loaded, isOwner, isAdmin, loadSession }
})
