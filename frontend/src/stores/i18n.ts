import { defineStore } from 'pinia'
import { ref } from 'vue'
import en from '@/locales/en'
import zh from '@/locales/zh'

export type Locale = 'en' | 'zh'

const STORAGE_KEY = 'openkb_locale'

export const messages = { en, zh }

export const useI18nStore = defineStore('i18n', () => {
  const storedLocale = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Locale | null
  const locale = ref<Locale>(storedLocale || 'en')

  function setLocale(newLocale: Locale) {
    locale.value = newLocale
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newLocale)
    }
  }

  function toggleLocale() {
    setLocale(locale.value === 'en' ? 'zh' : 'en')
  }

  function t(path: string): string {
    const keys = path.split('.')
    let current: any = messages[locale.value]
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        let fallback: any = messages.en
        for (const k of keys) {
          if (fallback && typeof fallback === 'object' && k in fallback) {
            fallback = fallback[k]
          } else {
            return path
          }
        }
        return typeof fallback === 'string' ? fallback : path
      }
    }
    return typeof current === 'string' ? current : path
  }

  return {
    locale,
    setLocale,
    toggleLocale,
    t,
  }
})
