<template>
  <AdminLayout>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">Manage Trips</h1>
      <Button as-child variant="outline" size="sm" class="btn-gradient-primary">
        <router-link to="/admin">Upload New Trip</router-link>
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16">
      <p class="text-muted-foreground">Loading trips...</p>
    </div>

    <!-- Error State -->
    <ErrorState v-else-if="error" :message="error">
      <Button variant="outline" size="sm" class="btn-gradient-primary" @click="loadTrips">
        Try again
      </Button>
    </ErrorState>

    <!-- Content -->
    <div v-else>
      <!-- Draft Trips Section -->
      <div v-if="draftTrips.length > 0" class="mb-10">
        <h2 class="text-xl font-semibold mb-4">Draft Trips</h2>
        <Alert class="mb-4">
          <AlertDescription>
            These trips have incomplete uploads and are not visible to visitors.
          </AlertDescription>
        </Alert>
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <TripCard
            v-for="trip in draftTrips"
            :key="trip.id"
            :trip="trip"
            :isDraft="true"
            :onDelete="() => handleDelete(trip.id)"
          />
        </div>
      </div>

      <!-- Separator (only if both sections exist) -->
      <Separator v-if="draftTrips.length > 0 && publishedTrips.length > 0" class="my-8" />

      <!-- Published Trips Section -->
      <div>
        <h2 class="text-xl font-semibold mb-4">Published Trips</h2>
        <EmptyState
          v-if="publishedTrips.length === 0"
          title="No published trips"
          description="Upload and publish your first trip"
        >
          <Button as-child size="sm" class="btn-gradient-primary">
            <router-link to="/admin">Upload Trip</router-link>
          </Button>
        </EmptyState>
        <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <TripCard
            v-for="trip in publishedTrips"
            :key="trip.id"
            :trip="trip"
            :onDelete="() => handleDelete(trip.id)"
          />
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAllTripsAdmin, deleteTrip } from '@/utils/database'
import type { ApiTrip } from '@/utils/database'
import AdminLayout from '@/layouts/AdminLayout.vue'
import TripCard from '@/components/TripCard.vue'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'

type TripWithMetadata = ApiTrip & {
  photo_count: number
  date_range: { start: string; end: string }
}

const trips = ref<TripWithMetadata[]>([])
const loading = ref(true)
const error = ref('')

const draftTrips = computed(() => trips.value.filter(t => !t.is_public))
const publishedTrips = computed(() => trips.value.filter(t => t.is_public))

async function loadTrips() {
  loading.value = true
  error.value = ''
  try {
    trips.value = await getAllTripsAdmin()
  } catch (err) {
    console.error('[TripManagementView] Error loading trips:', err)
    error.value = 'Failed to load trips'
  } finally {
    loading.value = false
  }
}

async function handleDelete(tripId: string) {
  try {
    await deleteTrip(tripId)
    await loadTrips() // Refresh list
  } catch (err) {
    console.error('[TripManagementView] Delete failed:', err)
    alert('Failed to delete trip. Please try again.')
  }
}

onMounted(loadTrips)
</script>
