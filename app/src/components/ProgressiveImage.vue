<template>
  <div class="relative overflow-hidden" :class="wrapperClass">
    <img
      v-if="!error"
      ref="imgEl"
      v-bind="$attrs"
      :src="src"
      :srcset="srcset"
      :sizes="sizes"
      :alt="alt"
      :class="[
        'block w-full h-full object-cover will-change-transform will-change-opacity',
        loaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-105 blur-md'
      ]"
      @load="onLoad"
      @error="onError"
      decoding="async"
      loading="lazy"
    />
    <div v-if="!loaded && !error" class="absolute inset-0 bg-black/5 dark:bg-white/5" />
    <!-- Error state -->
    <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-muted">
      <div class="text-center text-muted-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-8 w-8 mx-auto mb-1 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span class="text-xs">Failed to load</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  src: string
  srcset?: string
  sizes?: string
  alt: string
  wrapperClass?: string
}>()

const loaded = ref(false)
const error = ref(false)
const imgEl = ref<HTMLImageElement | null>(null)

function onLoad() {
  loaded.value = true
  error.value = false
}

function onError(e: Event) {
  error.value = true
  loaded.value = false
  console.error('[ProgressiveImage] Failed to load image:', props.src, e)
}
</script>

<style scoped>
.blur-md {
  filter: blur(12px);
}
</style>
