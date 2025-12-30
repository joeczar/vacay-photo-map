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

    <!-- Main Content (placeholder for contact sheet) -->
    <div v-else class="space-y-6">
      <div class="text-center py-16 border-2 border-dashed border-border rounded-lg">
        <p class="text-muted-foreground">Contact sheet will be displayed here</p>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTripById } from '@/utils/database'
import type { ApiTrip } from '@/utils/database'
import AdminLayout from '@/layouts/AdminLayout.vue'
import ErrorState from '@/components/ErrorState.vue'
import { Button } from '@/components/ui/button'

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

onMounted(loadTrip)
</script>
