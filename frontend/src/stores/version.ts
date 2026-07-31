import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '@/utils/api'

/** Server version, loaded once from the public /version endpoint. */
export const useVersionStore = defineStore('version', () => {
  const version = ref('')
  const loaded = ref(false)

  async function loadVersion() {
    if (loaded.value) return
    loaded.value = true
    try {
      const data = await apiFetch<{ version?: string }>('/version')
      if (data.version) version.value = data.version
    } catch {
      loaded.value = false
    }
  }

  return { version, loaded, loadVersion }
})
