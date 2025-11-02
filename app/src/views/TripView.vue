<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-900">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-slate-300">Loading trip...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Trip Not Found</h2>
        <p class="text-gray-600 dark:text-slate-300 mb-4">{{ error }}</p>
        <a href="/" class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">← Back to Home</a>
      </div>
    </div>

    <!-- Trip Content -->
    <div v-else-if="trip">
      <!-- Hero Section -->
      <div class="bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
        <div class="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div class="flex items-start justify-between">
            <div>
              <a href="/" class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-2 inline-block">
                ← Back to Trips
              </a>
              <h1 class="text-4xl font-bold text-gray-900 dark:text-slate-100 mb-2">{{ trip.title }}</h1>
              <p v-if="trip.description" class="text-gray-600 dark:text-slate-300 mb-4">{{ trip.description }}</p>
              <div class="flex gap-6 text-sm text-gray-500 dark:text-slate-400">
                <span>{{ trip.photos.length }} photos</span>
                <span v-if="dateRange">{{ dateRange }}</span>
                <span v-if="photosWithLocation">{{ photosWithLocation }} locations</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                @click="handleDelete"
                :disabled="isDeleting"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 dark:disabled:bg-red-800 text-white rounded-lg font-medium transition-colors"
              >
                {{ isDeleting ? 'Deleting...' : 'Delete Trip' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Map Section -->
      <div class="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-slate-900/50 overflow-hidden">
          <div style="height: 600px" class="relative">
            <l-map
              ref="map"
              v-model:zoom="zoom"
              :center="mapCenter as [number, number]"
              :options="{ scrollWheelZoom: true }"
              @ready="onMapReady"
            >
              <l-tile-layer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

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
                      class="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden cursor-pointer hover:scale-110 transition-transform"
                      :class="selectedPhoto?.id === photo.id ? 'border-primary-500 border-4' : ''"
                    >
                      <img :src="photo.thumbnail_url" :alt="photo.caption || 'Photo'" class="w-full h-full object-cover" />
                    </div>
                  </div>
                </l-icon>

                <l-popup :options="{ maxWidth: 300 }">
                  <div class="p-2">
                    <img :src="photo.url" :alt="photo.caption || 'Photo'" class="w-full h-48 object-cover rounded mb-2" />
                    <p v-if="photo.caption" class="text-sm font-medium mb-1">{{ photo.caption }}</p>
                    <p class="text-xs text-gray-500">{{ formatDate(photo.taken_at) }}</p>
                  </div>
                </l-popup>
              </l-marker>

              <!-- Route Line -->
              <l-polyline v-if="routeCoordinates.length > 0" :lat-lngs="routeCoordinates as [number, number][]" :weight="3" color="#3B82F6" />
            </l-map>
          </div>

          <!-- Photo Grid Below Map -->
          <div class="p-6 border-t border-gray-200 dark:border-slate-700">
            <h3 class="text-lg font-semibold dark:text-slate-100 mb-4">All Photos</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div
                v-for="photo in trip.photos"
                :key="photo.id"
                class="relative aspect-square cursor-pointer group"
                @click="selectPhoto(photo)"
              >
                <img
                  :src="photo.thumbnail_url"
                  :alt="photo.caption || 'Photo'"
                  class="w-full h-full object-cover rounded border-2 transition-all"
                  :class="selectedPhoto?.id === photo.id ? 'border-primary-500' : 'border-gray-200 dark:border-slate-700 group-hover:border-primary-300 dark:group-hover:border-primary-500'"
                />
                <div
                  v-if="!photo.latitude || !photo.longitude"
                  class="absolute top-1 right-1 bg-yellow-500 rounded-full p-1"
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
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Lightbox -->
      <div
        v-if="selectedPhoto"
        class="fixed inset-0 bg-black bg-opacity-90 dark:bg-black dark:bg-opacity-95 z-50 flex items-center justify-center p-4"
        @click="closePhoto"
      >
        <div class="relative max-w-6xl w-full" @click.stop>
          <button
            @click="closePhoto"
            class="absolute -top-12 right-0 text-white hover:text-gray-300 dark:hover:text-slate-400 text-lg font-bold"
          >
            ✕ Close
          </button>

          <img :src="selectedPhoto.url" :alt="selectedPhoto.caption || 'Photo'" class="w-full h-auto rounded-lg shadow-2xl" />

          <div class="mt-4 text-white">
            <p v-if="selectedPhoto.caption" class="text-lg font-medium mb-2">{{ selectedPhoto.caption }}</p>
            <p class="text-sm text-gray-300 dark:text-slate-400">{{ formatDate(selectedPhoto.taken_at) }}</p>
          </div>

          <!-- Navigation -->
          <button
            v-if="currentPhotoIndex > 0"
            @click.stop="previousPhoto"
            class="absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-20 hover:bg-opacity-30 dark:bg-slate-800 dark:bg-opacity-50 dark:hover:bg-opacity-70 text-white rounded-full p-3"
          >
            ←
          </button>
          <button
            v-if="currentPhotoIndex < trip.photos.length - 1"
            @click.stop="nextPhoto"
            class="absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-20 hover:bg-opacity-30 dark:bg-slate-800 dark:bg-opacity-50 dark:hover:bg-opacity-70 text-white rounded-full p-3"
          >
            →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { LMap, LTileLayer, LMarker, LIcon, LPopup, LPolyline } from '@vue-leaflet/vue-leaflet'
import { getTripBySlug, deleteTrip } from '@/utils/database'
import type { Database } from '@/lib/database.types'

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href
})

type Trip = Database['public']['Tables']['trips']['Row']
type Photo = Database['public']['Tables']['photos']['Row']

const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string

// State
const trip = ref<(Trip & { photos: Photo[] }) | null>(null)
const loading = ref(true)
const error = ref('')
const selectedPhoto = ref<Photo | null>(null)
const zoom = ref(12)
const map = ref(null)
const isDeleting = ref(false)

// Load trip data
onMounted(async () => {
  try {
    const data = await getTripBySlug(slug)
    if (!data) {
      error.value = 'Trip not found'
    } else {
      trip.value = data
    }
  } catch (err) {
    console.error('Error loading trip:', err)
    error.value = 'Failed to load trip'
  } finally {
    loading.value = false
  }
})

// Computed properties
const photosWithCoordinates = computed(() => {
  if (!trip.value) return []
  return trip.value.photos.filter(p => p.latitude !== null && p.longitude !== null)
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
  if (!trip.value || trip.value.photos.length === 0) return ''

  const dates = trip.value.photos.map(p => new Date(p.taken_at)).sort((a, b) => a.getTime() - b.getTime())
  const start = dates[0]
  const end = dates[dates.length - 1]

  if (start.toDateString() === end.toDateString()) {
    return formatDate(start.toISOString())
  }

  return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`
})

const currentPhotoIndex = computed(() => {
  if (!selectedPhoto.value || !trip.value) return -1
  return trip.value.photos.findIndex(p => p.id === selectedPhoto.value!.id)
})

// Methods
function onMapReady() {
  // Fit map to show all markers
  if (map.value && photosWithCoordinates.value.length > 0) {
    const bounds = photosWithCoordinates.value.map(p => [p.latitude!, p.longitude!])
    ;(map.value as any).leafletObject.fitBounds(bounds, { padding: [50, 50] })
  }
}

function selectPhoto(photo: Photo) {
  selectedPhoto.value = photo

  // Pan map to photo location if it has coordinates
  if (photo.latitude && photo.longitude && map.value) {
    ;(map.value as any).leafletObject.panTo([photo.latitude, photo.longitude])
  }
}

function closePhoto() {
  selectedPhoto.value = null
}

function nextPhoto() {
  if (!trip.value || currentPhotoIndex.value >= trip.value.photos.length - 1) return
  selectedPhoto.value = trip.value.photos[currentPhotoIndex.value + 1]
}

function previousPhoto() {
  if (!trip.value || currentPhotoIndex.value <= 0) return
  selectedPhoto.value = trip.value.photos[currentPhotoIndex.value - 1]
}

async function handleDelete() {
  if (!trip.value) return

  const confirmed = confirm(
    `Are you sure you want to delete "${trip.value.title}"?\n\n` +
    `This will permanently delete the trip and all ${trip.value.photos.length} photos.\n\n` +
    `This action cannot be undone.`
  )

  if (!confirmed) return

  isDeleting.value = true

  try {
    await deleteTrip(trip.value.id)
    // Navigate back to home page after successful deletion
    router.push('/')
  } catch (err) {
    console.error('Error deleting trip:', err)
    alert('Failed to delete trip. Please try again.')
    isDeleting.value = false
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
