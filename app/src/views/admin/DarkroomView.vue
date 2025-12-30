<template>
  <AdminLayout>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="sm" @click="goBack">
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back
        </Button>
        <h1 class="text-2xl font-bold text-foreground">
          {{ trip ? trip.title : 'Loading...' }}
        </h1>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16">
      <p class="text-muted-foreground">Loading darkroom...</p>
    </div>

    <!-- Error State -->
    <ErrorState v-else-if="error" :message="error" title="Failed to load trip">
      <Button variant="outline" size="sm" class="btn-gradient-primary" @click="loadTrip">
        Try again
      </Button>
    </ErrorState>

    <!-- Main Content: Contact Sheet -->
    <div v-else class="space-y-6">
      <!-- Empty State -->
      <div
        v-if="!trip?.photos || trip.photos.length === 0"
        class="text-center py-16 border-2 border-dashed border-border rounded-lg"
      >
        <p class="text-muted-foreground">No photos in this trip</p>
      </div>

      <!-- Contact Sheet Grid -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <button
          v-for="photo in trip.photos"
          :key="photo.id"
          @click="selectPhoto(photo.id)"
          class="relative aspect-square overflow-hidden rounded-md transition-all"
          :class="
            selectedPhotoId === photo.id
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              : 'hover:opacity-80'
          "
        >
          <img
            :src="getImageUrl(photo.thumbnail_url, { rotation: photo.rotation })"
            :alt="`Photo ${photo.id}`"
            class="w-full h-full object-cover"
          />
        </button>
      </div>

      <!-- Detail Panel -->
      <Card v-if="selectedPhoto" class="p-6 mt-6">
        <div class="flex flex-col lg:flex-row gap-6">
          <!-- Photo Display -->
          <div class="flex-1 flex items-center justify-center bg-muted rounded-lg min-h-[400px]">
            <img
              :src="
                getImageUrl(selectedPhoto.url, {
                  rotation: localRotations[selectedPhoto.id] ?? selectedPhoto.rotation
                })
              "
              :alt="`Photo from ${trip?.title}`"
              class="max-w-full max-h-[600px] object-contain"
            />
          </div>
          <!-- Controls Sidebar -->
          <div class="lg:w-64 space-y-4">
            <div>
              <h3 class="font-semibold text-lg mb-3">Rotation</h3>
              <div class="flex gap-2">
                <Button @click="rotatePhoto(-90)" variant="outline" class="flex-1">
                  <RotateCcw class="w-4 h-4 mr-2" />
                  CCW
                </Button>
                <Button @click="rotatePhoto(90)" variant="outline" class="flex-1">
                  <RotateCw class="w-4 h-4 mr-2" />
                  CW
                </Button>
              </div>
              <p class="text-sm text-muted-foreground text-center mt-2">
                <span v-if="savingPhotos.has(selectedPhoto.id)">Saving...</span>
                <span v-else
                  >{{ localRotations[selectedPhoto.id] ?? selectedPhoto.rotation }}°</span
                >
              </p>
            </div>
            <div class="text-xs text-muted-foreground mt-6 space-y-1 border-t pt-4">
              <p class="font-medium mb-2">Keyboard shortcuts</p>
              <p><kbd class="px-1.5 py-0.5 bg-muted rounded text-xs">R</kbd> Rotate CW</p>
              <p><kbd class="px-1.5 py-0.5 bg-muted rounded text-xs">⇧R</kbd> Rotate CCW</p>
              <p>
                <kbd class="px-1.5 py-0.5 bg-muted rounded text-xs">←</kbd>
                <kbd class="px-1.5 py-0.5 bg-muted rounded text-xs">→</kbd> Navigate
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTripById, updatePhotoRotation } from '@/utils/database'
import type { ApiTrip, Photo } from '@/utils/database'
import AdminLayout from '@/layouts/AdminLayout.vue'
import ErrorState from '@/components/ErrorState.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getImageUrl } from '@/utils/image'
import { RotateCw, RotateCcw } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const trip = ref<(ApiTrip & { photos: Photo[] }) | null>(null)
const loading = ref(true)
const error = ref('')
const selectedPhotoId = ref<string | null>(null)
const localRotations = reactive<Record<string, number>>({})
const saveTimeouts = ref<Record<string, number>>({})
const savingPhotos = ref(new Set<string>())

const selectedPhoto = computed(() => {
  if (!selectedPhotoId.value || !trip.value?.photos) return null
  return trip.value.photos.find(p => p.id === selectedPhotoId.value) ?? null
})

async function loadTrip() {
  loading.value = true
  error.value = ''
  try {
    const tripId = route.params.tripId as string
    trip.value = await getTripById(tripId)

    if (!trip.value) {
      error.value = 'Trip not found'
    }
  } catch (err) {
    console.error('[DarkroomView] Error loading trip:', err)
    error.value = 'Failed to load trip'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push('/admin/trips')
}

function selectPhoto(photoId: string) {
  selectedPhotoId.value = photoId
}

function rotatePhoto(delta: number) {
  if (!selectedPhoto.value) return

  const photoId = selectedPhoto.value.id
  const current = localRotations[photoId] ?? selectedPhoto.value.rotation
  const newRotation = ((current + delta + 360) % 360) as 0 | 90 | 180 | 270

  // Optimistic update
  localRotations[photoId] = newRotation

  // Clear existing timeout
  if (saveTimeouts.value[photoId]) {
    clearTimeout(saveTimeouts.value[photoId])
  }

  // Debounce save (500ms)
  saveTimeouts.value[photoId] = window.setTimeout(async () => {
    savingPhotos.value.add(photoId)
    try {
      await updatePhotoRotation(photoId, newRotation)
      // Update source of truth
      const photo = trip.value?.photos.find(p => p.id === photoId)
      if (photo) photo.rotation = newRotation
      // Clear local override since it matches server
      delete localRotations[photoId]
    } catch (err) {
      console.error('[DarkroomView] Failed to save rotation:', err)
      // Revert optimistic update
      delete localRotations[photoId]
    } finally {
      savingPhotos.value.delete(photoId)
      delete saveTimeouts.value[photoId]
    }
  }, 500)
}

function navigatePhoto(direction: number) {
  if (!trip.value?.photos || trip.value.photos.length === 0) return

  const photos = trip.value.photos

  if (!selectedPhotoId.value) {
    // Select first or last based on direction
    selectedPhotoId.value = direction > 0 ? photos[0].id : photos[photos.length - 1].id
    return
  }

  const currentIndex = photos.findIndex(p => p.id === selectedPhotoId.value)
  if (currentIndex === -1) return

  const nextIndex = (currentIndex + direction + photos.length) % photos.length
  selectedPhotoId.value = photos[nextIndex].id
}

function handleKeyboard(e: KeyboardEvent) {
  // Ignore if typing in input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return
  }

  // Rotation shortcuts (require selected photo)
  if (selectedPhoto.value && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault()
    const delta = e.shiftKey ? -90 : 90
    rotatePhoto(delta)
    return
  }

  // Navigation shortcuts
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    navigatePhoto(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    navigatePhoto(1)
  }
}

onMounted(() => {
  loadTrip()
  window.addEventListener('keydown', handleKeyboard)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard)
  Object.values(saveTimeouts.value).forEach(clearTimeout)
})
</script>
