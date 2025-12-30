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
          <!-- Controls Sidebar (placeholder) -->
          <div class="lg:w-64 space-y-4">
            <p class="text-muted-foreground text-sm">Rotation controls coming next...</p>
          </div>
        </div>
      </Card>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTripById } from '@/utils/database'
import type { ApiTrip } from '@/utils/database'
import AdminLayout from '@/layouts/AdminLayout.vue'
import ErrorState from '@/components/ErrorState.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getImageUrl } from '@/utils/image'

type Photo = {
  id: string
  trip_id: string
  storage_key: string
  url: string
  thumbnail_url: string
  latitude: number | null
  longitude: number | null
  taken_at: string
  caption: string | null
  album: string | null
  rotation: number
  created_at: string
}

const route = useRoute()
const router = useRouter()

const trip = ref<(ApiTrip & { photos: Photo[] }) | null>(null)
const loading = ref(true)
const error = ref('')
const selectedPhotoId = ref<string | null>(null)
const localRotations = reactive<Record<string, number>>({})

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

onMounted(loadTrip)
</script>
