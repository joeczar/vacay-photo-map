<template>
  <div
    class="group relative h-full flex flex-col overflow-hidden rounded-xl bg-card border border-border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 card-soft"
    :class="featured ? 'ring-1 ring-primary/20' : ''"
  >
    <router-link :to="cardDestination" class="block h-full">
      <!-- Cover Photo -->
      <div
        class="aspect-video relative bg-muted overflow-hidden"
        :class="featured ? 'sm:aspect-[2/1] lg:aspect-[21/9]' : ''"
      >
        <ProgressiveImage
          v-if="trip.cover_photo_url"
          :src="coverFallback"
          :srcset="coverSrcset"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          :alt="trip.title"
          wrapper-class="w-full h-full"
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-muted-foreground bg-muted"
        >
          <svg class="w-16 h-16 opacity-20" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
              clip-rule="evenodd"
            />
          </svg>
        </div>

        <!-- Role Badge (top-left) -->
        <RoleBadge v-if="userRole" :role="userRole" class="absolute top-2 left-2 z-10" />

        <!-- Draft Badge -->
        <Badge
          v-if="isDraft"
          variant="secondary"
          class="absolute top-2 right-2 z-10 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700"
        >
          Draft
        </Badge>

        <!-- Overlay Gradient (Subtle) -->
        <div
          class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        ></div>
      </div>

      <!-- Content -->
      <div class="flex flex-col flex-1 p-5">
        <!-- Accent hover bar -->
        <span
          class="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          :style="{ background: 'hsl(var(--accent))' }"
        />
        <div class="flex items-start justify-between mb-2">
          <h3
            class="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1"
          >
            {{ trip.title }}
          </h3>
        </div>

        <p v-if="trip.description" class="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
          {{ trip.description }}
        </p>

        <!-- Footer Info -->
        <div
          class="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-4 border-t border-border/50"
        >
          <div class="flex items-center gap-2">
            <span
              class="inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground font-medium"
            >
              {{ trip.photo_count }} photos
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="trip.date_range">
              {{ formatDateRange(trip.date_range) }}
            </span>
            <!-- Edit Button - only for admin/editor -->
            <Button
              v-if="userRole && ['admin', 'editor'].includes(userRole)"
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
              @click.prevent.stop="navigateToEdit"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
                />
              </svg>
            </Button>
            <!-- Darkroom Button - only for admin/editor -->
            <Button
              v-if="userRole && ['admin', 'editor'].includes(userRole)"
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
              @click.prevent.stop="navigateToDarkroom"
              title="Open in darkroom"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z"
                  clip-rule="evenodd"
                />
              </svg>
            </Button>
            <Button
              v-if="onDelete"
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              @click.prevent.stop="handleDelete"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clip-rule="evenodd"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { ApiTrip } from '@/utils/database'
import { getImageUrl, buildSrcset } from '@/utils/image'
import ProgressiveImage from '@/components/ProgressiveImage.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const router = useRouter()

const props = defineProps<{
  trip: ApiTrip & { photo_count: number; date_range: { start: string; end: string } }
  featured?: boolean
  isDraft?: boolean
  onDelete?: () => void
  userRole?: 'admin' | 'editor' | 'viewer'
}>()

const coverSrcset = computed(() => {
  if (!props.trip.cover_photo_url) return ''
  return buildSrcset(props.trip.cover_photo_url, [300, 600, 900])
})

const coverFallback = computed(() =>
  props.trip.cover_photo_url ? getImageUrl(props.trip.cover_photo_url, { width: 600 }) : ''
)

const cardDestination = computed(() => {
  // Draft trips navigate to edit mode in AdminView
  if (props.isDraft) {
    return `/admin?tripId=${props.trip.id}`
  }
  // Published trips navigate to trip view
  return `/trip/${props.trip.slug}`
})

function navigateToEdit() {
  router.push(`/admin/trips?tripId=${props.trip.id}`)
}

function navigateToDarkroom() {
  router.push(`/admin/darkroom/${props.trip.id}`)
}

function handleDelete() {
  if (!props.onDelete) return

  const confirmed = confirm(
    `Are you sure you want to delete "${props.trip.title}"? This action cannot be undone.`
  )

  if (confirmed) {
    props.onDelete()
  }
}

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
