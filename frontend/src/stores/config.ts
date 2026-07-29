import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfigStore = defineStore('config', () => {
  // From environment variables (docker-compose.yaml)
  const hidePortal = ref(false)
  const signupEnabled = ref(false)
  const loaded = ref(false)

  async function loadConfig() {
    if (loaded.value) return
    try {
      const res = await fetch('/auth/config')
      if (res.ok) {
        const data = await res.json()
        hidePortal.value = data.hidePortal ?? false
        signupEnabled.value = data.signupEnabled ?? false
        loaded.value = true
      }
    } catch (e) {
      console.error('Failed to load config', e)
    }
  }

  return { hidePortal, signupEnabled, loadConfig, loaded }
})
