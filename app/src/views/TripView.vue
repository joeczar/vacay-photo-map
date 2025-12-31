<template>
  <TripLayout>
    <template #actions>
      <!-- Admin-only actions -->
      <template v-if="isAuthenticated">
        <Button
          variant="destructive"
          class="w-full justify-start"
          @click="deleteDialogOpen = true"
          v-ripple
        >
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          Delete Trip
        </Button>
      </template>
    </template>

    <!-- Loading State -->
    <LoadingState v-if="loading" message="Loading trip..." :full-screen="true" />

    <!-- Error State -->
    <ErrorState v-else-if="error" title="Trip Not Found" :message="error">
      <Button as-child>
        <router-link to="/">← Back to Home</router-link>
      </Button>
    </ErrorState>

    <!-- Trip Content -->
    <div v-else-if="trip">
      <!-- Hero Section -->
      <div class="relative border-b bg-card transition-colors">
        <div class="hero-accent-bar" aria-hidden="true"></div>
        <!-- Match global 7xl width for desktop alignment -->
        <div class="max-w-7xl mx-auto w-full py-8 px-4 relative">
          <h1 class="text-4xl font-bold mb-2 text-accent-gradient">{{ trip.title }}</h1>
          <p v-if="trip.description" class="text-muted-foreground mb-4">{{ trip.description }}</p>
          <div class="flex gap-4">
            <Badge variant="secondary">
              <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clip-rule="evenodd"
                />
              </svg>
              {{ total }} photos
            </Badge>
            <Badge v-if="dateRange" variant="outline">{{ dateRange }}</Badge>
            <Badge v-if="photosWithLocation" variant="outline"
              >{{ photosWithLocation }} locations</Badge
            >
          </div>
        </div>
      </div>

      <!-- Map/Photos Controls (mobile) -->
      <div class="max-w-7xl mx-auto w-full px-4 pt-4 md:hidden">
        <div
          role="tablist"
          aria-label="View switch"
          class="inline-flex rounded-lg border border-border p-1 bg-card"
        >
          <button
            role="tab"
            :aria-selected="viewMode === 'map'"
            class="px-4 py-2 text-sm rounded-md transition-colors"
            :class="
              viewMode === 'map'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="viewMode = 'map'"
            @keydown.right.prevent="viewMode = 'photos'"
          >
            Map
          </button>
          <button
            role="tab"
            :aria-selected="viewMode === 'photos'"
            class="px-4 py-2 text-sm rounded-md transition-colors"
            :class="
              viewMode === 'photos'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="viewMode = 'photos'"
            @keydown.left.prevent="viewMode = 'map'"
          >
            Photos
          </button>
        </div>
      </div>

      <!-- Map Section -->
      <div class="max-w-7xl mx-auto w-full py-8 px-4">
        <Card class="overflow-hidden">
          <div
            v-if="isDesktop || viewMode === 'map'"
            class="relative z-0 h-[50vh] sm:h-[60vh] md:h-[600px] xl:h-[720px] 2xl:h-[800px]"
          >
            <l-map
              ref="map"
              v-model:zoom="zoom"
              :center="mapCenter as [number, number]"
              :options="{ scrollWheelZoom: true }"
              @ready="onMapReady"
            >
              <l-tile-layer :url="tileLayerUrl" :attribution="tileLayerAttribution" />

              <!-- Photo Markers -->
              <l-marker
                v-for="photo in photosWithCoordinates"
                :key="photo.id"
                :lat-lng="[photo.latitude!, photo.longitude!]"
                @click="selectPhoto(photo)"
              >
                <l-icon :icon-size="[40, 40]" :icon-anchor="[20, 40]">
                  <div class="relative">
                    <div
                      class="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden cursor-pointer hover:scale-110 transition-transform marker-glow"
                      :class="selectedPhoto?.id === photo.id ? 'border-primary border-4' : ''"
                    >
                      <img
                        :src="
                          getImageUrl(photo.thumbnail_url, { width: 80, rotation: photo.rotation })
                        "
                        :alt="photo.caption || 'Photo'"
                        class="w-full h-full object-cover"
                        :style="{ transform: `rotate(${photo.rotation}deg)` }"
                      />
                    </div>
                  </div>
                </l-icon>

                <l-popup :options="{ maxWidth: 300 }">
                  <div class="p-2">
                    <div :style="{ transform: `rotate(${photo.rotation}deg)` }">
                      <ProgressiveImage
                        :src="popupFallback(photo)"
                        :srcset="popupSrcset(photo)"
                        sizes="300px"
                        :alt="photo.caption || 'Photo'"
                        wrapper-class="w-full h-48 rounded mb-2"
                        class="w-full h-48 object-cover rounded"
                      />
                    </div>
                    <p v-if="photo.caption" class="text-sm font-medium mb-1">{{ photo.caption }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatDate(photo.taken_at) }}</p>
                  </div>
                </l-popup>
              </l-marker>

              <!-- Route Line -->
              <l-polyline
                v-if="routeCoordinates.length > 0"
                :lat-lngs="routeCoordinates as [number, number][]"
                :weight="3"
                color="#3B82F6"
              />
            </l-map>
          </div>

          <!-- Photo Grid Below Map -->
          <Separator />
          <CardContent
            class="p-6 content-auto"
            :class="viewMode === 'map' && !isDesktop ? 'hidden' : ''"
          >
            <h3 class="text-lg font-semibold mb-4">All Photos</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Card
                v-for="photo in photos"
                :key="photo.id"
                class="relative aspect-square cursor-pointer overflow-hidden group hover:ring-2 hover:ring-primary transition-all"
                :class="selectedPhoto?.id === photo.id ? 'ring-2 ring-primary' : ''"
                @click="selectPhoto(photo)"
              >
                <div :style="{ transform: `rotate(${photo.rotation}deg)` }" class="w-full h-full">
                  <ProgressiveImage
                    :src="gridFallback(photo)"
                    :srcset="gridSrcset(photo)"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    :alt="photo.caption || 'Photo'"
                    wrapper-class="w-full h-full"
                    class="w-full h-full object-cover"
                  />
                </div>
                <div
                  v-if="!photo.latitude || !photo.longitude"
                  class="absolute top-1 right-1 bg-rose-500 rounded-full p-1"
                  title="No location data"
                >
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
              </Card>

              <!-- Infinite scroll sentinel -->
              <div
                v-if="hasMore"
                ref="sentinelRef"
                class="col-span-full flex items-center justify-center py-8"
              >
                <div v-if="loadingMore" class="flex gap-3">
                  <Skeleton class="w-24 h-24 rounded" />
                  <Skeleton class="w-24 h-24 rounded" />
                  <Skeleton class="w-24 h-24 rounded" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Delete Confirmation Dialog -->
      <Dialog v-model:open="deleteDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Trip?</DialogTitle>
            <DialogDescription>
              This will permanently delete "{{ trip.title }}" and all {{ total }} photos. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" @click="deleteDialogOpen = false" v-ripple>Cancel</Button>
            <Button variant="destructive" @click="confirmDelete" :disabled="isDeleting" v-ripple>
              {{ isDeleting ? 'Deleting...' : 'Delete' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Lightbox -->
      <div
        v-if="selectedPhoto"
        class="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
        @click="closePhoto"
      >
        <div class="relative max-w-6xl w-full" @click.stop>
          <Button
            variant="ghost"
            size="icon"
            @click="closePhoto"
            aria-label="Close lightbox"
            class="absolute -top-12 right-0 text-white hover:text-white/80"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>

          <!-- Lightbox image with touch gestures -->
          <div
            ref="lightboxContainer"
            class="w-full h-auto rounded-lg shadow-2xl overflow-hidden touch-none select-none"
            :style="{
              transform: `translate(${dragX}px, ${dragY}px) scale(${scale})`,
              transition: dragging ? 'none' : 'transform 200ms ease-out',
              opacity: dragging && scale === 1 ? 1 - Math.min(Math.abs(dragX) / 600, 0.15) : 1
            }"
            @touchstart.passive="onTouchStart"
            @touchmove.prevent="onTouchMove"
            @touchend="onTouchEnd"
            @pointerdown.prevent="onPointerStart"
            @pointermove.prevent="onPointerMove"
            @pointerup="onPointerEnd"
          >
            <img
              :src="lightboxFallback(selectedPhoto)"
              :srcset="lightboxSrcset(selectedPhoto)"
              sizes="100vw"
              decoding="async"
              :alt="selectedPhoto.caption || 'Photo'"
              class="w-full h-auto block"
              draggable="false"
              :style="{ transform: `rotate(${selectedPhoto.rotation}deg)` }"
            />
          </div>

          <div class="mt-4 text-white">
            <p v-if="selectedPhoto.caption" class="text-lg font-medium mb-2">
              {{ selectedPhoto.caption }}
            </p>
            <p class="text-sm text-gray-300">{{ formatDate(selectedPhoto.taken_at) }}</p>
          </div>

          <!-- Navigation -->
          <Button
            v-if="currentPhotoIndex > 0"
            variant="ghost"
            size="icon"
            @click.stop="previousPhoto"
            aria-label="Previous photo"
            class="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-white/80"
          >
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <Button
            v-if="currentPhotoIndex < photos.length - 1"
            variant="ghost"
            size="icon"
            @click.stop="nextPhoto"
            aria-label="Next photo"
            class="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-white/80"
          >
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Button>

          <!-- Edge hint gradients (subtle) -->
          <div
            class="pointer-events-none absolute inset-y-0 left-0 w-24"
            :style="{
              opacity: scale === 1 ? Math.max(0, Math.min(-dragX / 200, 0.15)) : 0,
              background: 'linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,0))'
            }"
          ></div>
          <div
            class="pointer-events-none absolute inset-y-0 right-0 w-24"
            :style="{
              opacity: scale === 1 ? Math.max(0, Math.min(dragX / 200, 0.15)) : 0,
              background: 'linear-gradient(270deg, rgba(0,0,0,.35), rgba(0,0,0,0))'
            }"
          ></div>
        </div>
      </div>
    </div>
  </TripLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { LMap, LTileLayer, LMarker, LIcon, LPopup, LPolyline } from '@vue-leaflet/vue-leaflet'
import { deleteTrip } from '@/utils/database'
import { useAuth } from '@/composables/useAuth'
import { useDarkMode } from '@/composables/useDarkMode'
import type { Database } from '@/lib/database.types'
import TripLayout from '@/layouts/TripLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getImageUrl, buildSrcset } from '@/utils/image'
import { useAccentColor } from '@/composables/useAccentColor'
import { useInfinitePhotos } from '@/composables/useInfinitePhotos'
import ProgressiveImage from '@/components/ProgressiveImage.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import { Skeleton } from '@/components/ui/skeleton'

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href
})

type Photo = Database['public']['Tables']['photos']['Row']

const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string

// Auth & Theme
const { isAuthenticated } = useAuth()
const { isDark } = useDarkMode()
const { setAccentFromImage } = useAccentColor()

// Sentinel element ref for infinite scroll (must be created before composable)
const sentinelRef = ref<HTMLElement | null>(null)

// Infinite scroll composable
const {
  photos,
  tripMetadata: trip,
  loading,
  loadingMore,
  hasMore,
  total,
  error
} = useInfinitePhotos(slug, sentinelRef)

const selectedPhoto = ref<Photo | null>(null)
const zoom = ref(12)
// Vue-leaflet map component ref with leafletObject accessor
const map = ref<{ leafletObject: L.Map } | null>(null)
const isDeleting = ref(false)
const deleteDialogOpen = ref(false)

// Mobile view mode: map or photos
const viewMode = ref<'map' | 'photos'>('map')
const isDesktop = ref(false)

// Lightbox gesture state
const lightboxContainer = ref<HTMLElement | null>(null)
const startX = ref(0)
const startY = ref(0)
const dragX = ref(0)
const dragY = ref(0)
const dragging = ref(false)
const scale = ref(1)
let lastTapTime = 0

// Pinch zoom state
let pinchStartDistance = 0
let pinchStartScale = 1

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    const [a, b] = [e.touches[0], e.touches[1]]
    pinchStartDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    pinchStartScale = scale.value
    dragging.value = false
    return
  }
  if (e.touches.length !== 1) return
  const t = e.touches[0]
  const now = Date.now()
  const timeSince = now - lastTapTime
  startX.value = t.clientX
  startY.value = t.clientY
  dragX.value = 0
  dragY.value = 0
  dragging.value = true

  // Double-tap to toggle zoom
  if (timeSince < 300) {
    scale.value = scale.value > 1 ? 1 : 2
  }
  lastTapTime = now
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 2) {
    const [a, b] = [e.touches[0], e.touches[1]]
    const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    const factor = dist / (pinchStartDistance || dist)
    const next = Math.max(1, Math.min(3, pinchStartScale * factor))
    scale.value = next
    return
  }
  if (!dragging.value || e.touches.length !== 1) return
  const t = e.touches[0]
  const dx = t.clientX - startX.value
  const dy = t.clientY - startY.value

  // When zoomed, pan image; when not zoomed, track drag for swipe/close
  if (scale.value > 1) {
    dragX.value += dx
    dragY.value += dy
    startX.value = t.clientX
    startY.value = t.clientY
  } else {
    dragX.value = dx
    dragY.value = dy
  }
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false

  const thresholdX = 60
  const thresholdY = 120
  const dx = dragX.value
  const dy = dragY.value

  // Vertical swipe down to close (when not zoomed)
  if (scale.value === 1 && Math.abs(dy) > thresholdY && Math.abs(dx) < 50) {
    dragX.value = 0
    dragY.value = 0
    closePhoto()
    return
  }

  // Horizontal swipe to navigate (when not zoomed)
  if (scale.value === 1) {
    if (dx > thresholdX) {
      previousPhoto()
    } else if (dx < -thresholdX) {
      nextPhoto()
    }
  }

  // Reset transform after gesture
  if (scale.value === 1) {
    dragX.value = 0
    dragY.value = 0
  }
}

// Pointer event fallback (for non-touch testing and broader support)
function onPointerStart(e: PointerEvent) {
  if (e.pointerType === 'mouse') return
  startX.value = e.clientX
  startY.value = e.clientY
  dragX.value = 0
  dragY.value = 0
  dragging.value = true

  const now = Date.now()
  const timeSince = now - lastTapTime
  if (timeSince < 300) {
    scale.value = scale.value > 1 ? 1 : 2
  }
  lastTapTime = now
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'mouse' || !dragging.value) return
  const dx = e.clientX - startX.value
  const dy = e.clientY - startY.value
  if (scale.value === 1) {
    dragX.value = dx
    dragY.value = dy
  }
}

function onPointerEnd(e: PointerEvent) {
  if (e.pointerType === 'mouse' || !dragging.value) return
  dragging.value = false
  const thresholdX = 60
  const thresholdY = 120
  const dx = dragX.value
  const dy = dragY.value
  if (scale.value === 1 && Math.abs(dy) > thresholdY && Math.abs(dx) < 50) {
    dragX.value = 0
    dragY.value = 0
    closePhoto()
    return
  }
  if (scale.value === 1) {
    if (dx > thresholdX) previousPhoto()
    else if (dx < -thresholdX) nextPhoto()
  }
  dragX.value = 0
  dragY.value = 0
}

// Watch for trip metadata to set accent color
watch(
  trip,
  tripData => {
    if (!tripData) return
    const cover = tripData.cover_photo_url || photos.value[0]?.url
    if (cover) {
      setAccentFromImage(cover)
    }
  },
  { immediate: true }
)

// Load trip data
onMounted(async () => {
  // Determine initial layout mode for mobile/desktop
  const mq = window.matchMedia('(min-width: 768px)')
  const updateDesktop = () => {
    isDesktop.value = mq.matches
    if (!isDesktop.value) {
      // On mobile, default to Photos for faster first paint
      viewMode.value = 'photos'
    }
  }
  updateDesktop()
  mq.addEventListener?.('change', updateDesktop)
})

// Computed properties
const photosWithCoordinates = computed(() => {
  return photos.value.filter(p => p.latitude !== null && p.longitude !== null)
})

const photosWithLocation = computed(() => photosWithCoordinates.value.length)

const mapCenter = computed(() => {
  if (photosWithCoordinates.value.length === 0) {
    return [40.7128, -74.006] // Default to NYC
  }

  // Calculate center of all photos
  const lats = photosWithCoordinates.value.map(p => p.latitude!)
  const lngs = photosWithCoordinates.value.map(p => p.longitude!)

  const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length
  const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length

  return [avgLat, avgLng]
})

const routeCoordinates = computed(() => {
  return photosWithCoordinates.value.map(p => [p.latitude!, p.longitude!])
})

const dateRange = computed(() => {
  if (photos.value.length === 0) return ''

  const dates = photos.value
    .map(p => new Date(p.taken_at))
    .sort((a, b) => a.getTime() - b.getTime())
  const start = dates[0]
  const end = dates[dates.length - 1]

  if (start.toDateString() === end.toDateString()) {
    return formatDate(start.toISOString())
  }

  return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`
})

const currentPhotoIndex = computed(() => {
  if (!selectedPhoto.value) return -1
  return photos.value.findIndex(p => p.id === selectedPhoto.value!.id)
})

const tileLayerUrl = computed(() => {
  return isDark.value
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
})

const tileLayerAttribution = computed(() => {
  return '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
})

// Methods
function onMapReady() {
  // Fit map to show all markers
  if (map.value && photosWithCoordinates.value.length > 0) {
    const bounds = photosWithCoordinates.value.map(p => [
      p.latitude!,
      p.longitude!
    ]) as L.LatLngBoundsExpression
    map.value.leafletObject.fitBounds(bounds, { padding: [50, 50] })
  }
}

// Image URL helpers with responsive srcset
function gridSrcset(p: Photo) {
  return buildSrcset(p.url, [200, 400, 600, 800], p.rotation)
}
function gridFallback(p: Photo) {
  return getImageUrl(p.url, { width: 400, rotation: p.rotation })
}
function popupSrcset(p: Photo) {
  return buildSrcset(p.url, [300, 600], p.rotation)
}
function popupFallback(p: Photo) {
  return getImageUrl(p.url, { width: 600, rotation: p.rotation })
}
function lightboxSrcset(p: Photo | null) {
  if (!p) return ''
  return buildSrcset(p.url, [800, 1200, 1600, 1920], p.rotation)
}
function lightboxFallback(p: Photo | null) {
  if (!p) return ''
  return getImageUrl(p.url, { width: 1200, rotation: p.rotation })
}

function selectPhoto(photo: Photo) {
  selectedPhoto.value = photo

  // Pan map to photo location if it has coordinates
  if (photo.latitude && photo.longitude && map.value) {
    map.value.leafletObject.panTo([photo.latitude, photo.longitude])
  }
}

function closePhoto() {
  selectedPhoto.value = null
}

function nextPhoto() {
  if (currentPhotoIndex.value >= photos.value.length - 1) return
  selectedPhoto.value = photos.value[currentPhotoIndex.value + 1]
}

function previousPhoto() {
  if (currentPhotoIndex.value <= 0) return
  selectedPhoto.value = photos.value[currentPhotoIndex.value - 1]
}

async function confirmDelete() {
  if (!trip.value) return

  isDeleting.value = true

  try {
    await deleteTrip(trip.value.id)
    // Navigate back to home page after successful deletion
    router.push('/')
  } catch (err) {
    console.error('Error deleting trip:', err)
    alert('Failed to delete trip. Please try again.')
    isDeleting.value = false
    deleteDialogOpen.value = false
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
</script>

<style scoped>
/* Scoped z-index management for Leaflet map to prevent covering overlays */
:deep(.leaflet-container) {
  z-index: 0;
}

:deep(.leaflet-popup-pane) {
  z-index: 700;
}

:deep(.leaflet-control-container) {
  z-index: 800;
}
</style>
