<template>
  <div
       class="group relative h-full flex flex-col overflow-hidden rounded-xl bg-card border border-border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
    <router-link :to="`/trip/${trip.slug}`" class="block h-full">
      <!-- Cover Photo -->
      <div class="aspect-video relative bg-muted overflow-hidden">
        <img
             v-if="trip.cover_photo_url"
             :src="coverFallback"
             :srcset="coverSrcset"
             sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
             loading="lazy"
             decoding="async"
             :alt="trip.title"
             class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div
             v-else
             class="w-full h-full flex items-center justify-center text-muted-foreground bg-muted">
          <svg class="w-16 h-16 opacity-20" fill="currentColor" viewBox="0 0 20 20">
            <path
                  fill-rule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clip-rule="evenodd" />
          </svg>
        </div>

        <!-- Overlay Gradient (Subtle) -->
        <div
             class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        </div>
      </div>

      <!-- Content -->
      <div class="flex flex-col flex-1 p-5">
        <div class="flex items-start justify-between mb-2">
          <h3 class="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {{ trip.title }}
          </h3>
        </div>

        <p v-if="trip.description" class="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
          {{ trip.description }}
        </p>

        <!-- Footer Info -->
        <div
             class="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-4 border-t border-border/50">
          <div class="flex items-center gap-2">
            <span
                  class="inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground font-medium">
              {{ trip.photo_count }} photos
            </span>
          </div>
          <span v-if="trip.date_range">
            {{ formatDateRange(trip.date_range) }}
          </span>
        </div>
      </div>
    </router-link>
  </div>
</template>

<script setup lang="ts">
import type { ApiTrip } from '@/utils/database'
import { buildSrcSet, cloudinaryUrlForWidth } from '@/utils/image'

const props = defineProps<{
  trip: ApiTrip & { photo_count: number; date_range: { start: string; end: string } }
}>()

const coverSrcset = props.trip.cover_photo_url ? buildSrcSet(props.trip.cover_photo_url, [320, 480, 640, 768, 960, 1200]) : ''
const coverFallback = props.trip.cover_photo_url ? cloudinaryUrlForWidth(props.trip.cover_photo_url, 960) : ''

function formatDateRange(dateRange: { start: string; end: string }): string {
  if (!dateRange || !dateRange.start) return ''

  const start = new Date(dateRange.start)
  const end = new Date(dateRange.end)

  const startStr = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  if (startStr === endStr) return startStr
  return `${startStr} - ${endStr}`
}
</script>
