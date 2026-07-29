<template>
  <div class="text-center">
    <div class="mb-6 text-6xl">🔭</div>
    <n-h1 class="mb-4 text-3xl font-bold text-gray-900 dark:text-white">
      Page Not Found
    </n-h1>
    <n-p class="mb-8 text-gray-600 dark:text-dark-400">
      The page you're looking for doesn't exist or has been moved.
    </n-p>
    <router-link to="/">
      <n-button type="primary" size="large">
        <template #icon>
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </template>
        Back to Home
      </n-button>
    </router-link>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'NotFoundView' })
</script>
