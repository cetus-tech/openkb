<template>
  <div class="flex gap-8">
    <!-- Doc sidebar -->
    <aside class="hidden w-64 flex-shrink-0 lg:block">
      <DocSidebar :docs="docList" :current-path="currentDoc" />
    </aside>

    <!-- Content -->
    <article class="min-w-0 flex-1">
      <div v-if="loading" class="flex items-center justify-center py-20">
        <n-spin size="large" />
      </div>

      <n-card v-else-if="error" :bordered="true" size="small">
        <div class="text-center">
          <div class="mb-2 text-4xl">📄</div>
          <n-p class="text-gray-600 dark:text-dark-400">{{ error }}</n-p>
          <router-link to="/docs/introduction/quickstart">
            <n-button type="primary" class="mt-4">
              {{ i18n.t('docs.viewQuickstart') }}
            </n-button>
          </router-link>
        </div>
      </n-card>

      <div v-else class="prose" v-html="renderedContent" />
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DocSidebar from '@/components/docs/DocSidebar.vue'
import { renderMarkdown } from '@/utils/markdown'
import { useI18nStore } from '@/stores/i18n'

interface DocEntry {
  path: string
  title: string
}

const route = useRoute()
const i18n = useI18nStore()
const loading = ref(true)
const error = ref('')
const content = ref('')
const docList = ref<DocEntry[]>([])

const currentDoc = computed(() => {
  const parts = route.params.pathMatch as string[]
  return parts?.length ? parts.join('/') : 'introduction/quickstart'
})

const renderedContent = ref('')
watch(content, async (val) => {
  renderedContent.value = await renderMarkdown(val)
}, { immediate: true })

async function fetchDoc(path: string) {
  loading.value = true
  error.value = ''

  try {
    const res = await fetch(`/v1/docs/${path}?lang=${i18n.locale}`)
    if (!res.ok) {
      if (res.status === 404) {
        error.value = i18n.t('docs.notFound')
      } else {
        error.value = `Error: ${res.statusText}`
      }
      return
    }
    content.value = await res.text()
  } catch (e) {
    error.value = i18n.t('docs.failedLoad')
  } finally {
    loading.value = false
  }
}

async function fetchDocList() {
  try {
    const res = await fetch(`/v1/docs?lang=${i18n.locale}`)
    if (res.ok) {
      const data = await res.json()
      docList.value = data.docs || []
    }
  } catch {
    // Silently fail — sidebar just stays empty
  }
}

watch(
  [() => currentDoc.value, () => i18n.locale],
  ([path]) => {
    if (path) fetchDoc(path)
    fetchDocList()
  },
  { immediate: true }
)
</script>
