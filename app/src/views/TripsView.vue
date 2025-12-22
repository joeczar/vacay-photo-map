<template>
  <MainLayout>
    <!-- Hero Section -->
    <div
      class="rounded-2xl bg-card border border-border/50 px-6 py-8 sm:px-10 sm:py-10 mb-10 card-soft"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mb-1">
            Hey there.
          </h1>
          <p class="text-muted-foreground">Ready to explore?</p>
        </div>
        <Button
          v-if="trips.length > 0"
          variant="outline"
          as-child
          size="sm"
          class="btn-gradient-primary"
        >
          <router-link to="/admin">Manage Trips</router-link>
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 6" :key="i" class="bg-card border-border">
        <Skeleton class="aspect-video w-full rounded-t-xl" />
        <div class="p-5">
          <Skeleton class="h-6 w-3/4 mb-3" />
          <Skeleton class="h-4 w-full" />
        </div>
      </Card>
    </div>

    <!-- Error State -->
    <ErrorState v-else-if="error" message="Couldn't load trips right now">
      <Button variant="outline" size="sm" class="btn-gradient-primary" @click="loadTrips">
        Try again
      </Button>
    </ErrorState>

    <!-- Empty State -->
    <EmptyState
      v-else-if="trips.length === 0"
      title="No trips yet"
      description="Upload your first vacation photos to get started"
    >
      <Button as-child size="sm" class="btn-gradient-primary">
        <router-link to="/admin">Add your first trip</router-link>
      </Button>
    </EmptyState>

    <!-- Trip Grid -->
    <div v-else>
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-2xl font-bold text-foreground">All Trips</h2>
        <span class="text-sm text-muted-foreground bg-secondary px-3 py-1 rounded-full"
          >{{ trips.length }} trips</span
        >
      </div>

      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <template v-for="(trip, i) in trips" :key="trip.id">
          <!-- On large screens, let featured span full row for balance -->
          <div v-if="i === 0 && trips.length > 1" class="md:col-span-2 lg:col-span-3">
            <TripCard :trip="trip" featured />
          </div>
          <TripCard v-else :trip="trip" />
        </template>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAllTrips, type ApiTrip } from '@/utils/database'
import MainLayout from '@/layouts/MainLayout.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import TripCard from '@/components/TripCard.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'

const trips = ref<
  (ApiTrip & { photo_count: number; date_range: { start: string; end: string } })[]
>([])
const loading = ref(true)
const error = ref('')

async function loadTrips() {
  loading.value = true
  error.value = ''
  try {
    trips.value = await getAllTrips()
  } catch (err) {
    console.error('Error loading trips:', err)
    error.value = 'Failed to load trips'
  } finally {
    loading.value = false
  }
}

onMounted(loadTrips)
</script>
