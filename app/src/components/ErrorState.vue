<template>
  <div class="text-center py-16">
    <div
      v-if="showIcon"
      class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4"
    >
      <svg
        class="w-5 h-5 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M12 9v2m0 4h.01M3 15a4 4 0 014-4h1a4 4 0 010 8H7a4 4 0 01-4-4zm18 0a4 4 0 00-4-4h-1a4 4 0 000 8h1a4 4 0 004-4z"
        />
      </svg>
    </div>
    <h2 v-if="title" class="text-2xl font-bold text-foreground mb-2">{{ title }}</h2>
    <p class="text-muted-foreground mb-4">{{ message }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
  message: string
  showIcon?: boolean
}

withDefaults(defineProps<Props>(), {
  showIcon: true
})
</script>
