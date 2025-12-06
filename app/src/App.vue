<template>
  <div id="app" class="min-h-screen bg-gray-50 dark:bg-slate-900">
    <RouterView />
    <Toaster />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/toast'
</script>

<style>
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
    'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
