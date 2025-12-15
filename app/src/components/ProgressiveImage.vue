<template>
  <div class="relative overflow-hidden" :class="wrapperClass">
    <img
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
      decoding="async"
      loading="lazy"
    />
    <div v-if="!loaded" class="absolute inset-0 bg-black/5 dark:bg-white/5" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps<{
  src: string
  srcset?: string
  sizes?: string
  alt: string
  wrapperClass?: string
}>()

const loaded = ref(false)
const imgEl = ref<HTMLImageElement | null>(null)

function onLoad() {
  loaded.value = true
}
</script>

<style scoped>
.blur-md { filter: blur(12px); }
</style>

