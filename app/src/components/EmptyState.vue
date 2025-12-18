<template>
  <div
    class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl bg-card/50"
  >
    <div
      class="h-14 w-14 bg-muted rounded-full flex items-center justify-center mb-5 text-muted-foreground"
    >
      <slot name="icon">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </slot>
    </div>
    <h2 v-if="title" class="text-xl font-semibold text-foreground mb-2">{{ title }}</h2>
    <p v-if="description" class="text-muted-foreground mb-6">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
  description?: string
}

defineProps<Props>()
</script>
