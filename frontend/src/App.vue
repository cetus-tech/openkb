<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-dialog-provider>
      <n-message-provider>
        <n-global-style />
        <router-view />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { darkTheme, useOsTheme } from 'naive-ui'

const osThemeRef = useOsTheme()
const theme = computed(() => (osThemeRef.value === 'dark' ? darkTheme : null))
const themeOverrides = {
  common: {
    primaryColor: '#2563eb',
    primaryColorHover: '#1d4ed8',
    primaryColorPressed: '#1e40af',
    primaryColorSuppl: '#2563eb',
  },
}
</script>
