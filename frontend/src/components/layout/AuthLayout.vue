<template>
  <div class="no-scrollbar relative flex min-h-screen flex-col overflow-y-auto bg-gray-50 dark:bg-dark-950">
    <!-- Background -->
    <div class="absolute inset-0 bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950" />

    <!-- Decorative orbs -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary-400/20 blur-3xl" />
      <div class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary-500/15 blur-3xl" />
      <div class="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-300/10 blur-3xl" />
    </div>

    <!-- Content Area -->
    <div class="flex flex-1 items-center justify-center p-4">
      <div class="auth-card-shell relative z-10 w-full max-w-md">
        <!-- Logo -->
        <div class="mb-8 text-center">
          <div class="mb-4 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-500/30">
            <div class="i-heroicons-outline-globe-alt h-8 w-8" />
          </div>
          <h1 class="bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-3xl font-bold text-transparent">
            OpenKB
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">
            Agent Knowledge Base
          </p>
        </div>

        <!-- Card -->
        <n-card :content-style="{ padding: '32px' }" class="shadow-glass mx-auto">
          <router-view />
        </n-card>
      </div>
    </div>

    <!-- Footer -->
    <div class="relative z-10 mt-auto">
      <AppFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppFooter from './AppFooter.vue';
</script>

<style scoped>
.no-scrollbar {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
.no-scrollbar::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}
</style>
