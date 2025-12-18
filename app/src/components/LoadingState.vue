<template>
  <div class="flex items-center justify-center" :class="fullScreen ? 'min-h-screen' : 'py-16'">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p class="text-muted-foreground">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  message?: string
  fullScreen?: boolean
}

withDefaults(defineProps<Props>(), {
  message: 'Loading...',
  fullScreen: false
})
</script>
