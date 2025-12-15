<template>
  <MainLayout>
    <!-- Hero Section -->
    <div class="rounded-2xl bg-card border border-border/50 px-6 py-8 sm:px-10 sm:py-10 mb-10">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mb-1">
            Hey there.
          </h1>
          <p class="text-muted-foreground">
            Ready to explore?
          </p>
        </div>
        <Button v-if="trips.length > 0" variant="outline" as-child size="sm">
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
    <div v-else-if="error" class="text-center py-16">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
        <svg class="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M12 9v2m0 4h.01M3 15a4 4 0 014-4h1a4 4 0 010 8H7a4 4 0 01-4-4zm18 0a4 4 0 00-4-4h-1a4 4 0 000 8h1a4 4 0 004-4z" />
        </svg>
      </div>
      <p class="text-muted-foreground mb-4">Couldn't load trips right now</p>
      <Button variant="outline" size="sm" @click="loadTrips">Try again</Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="trips.length === 0"
         class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl bg-card/50">
      <div class="h-14 w-14 bg-muted rounded-full flex items-center justify-center mb-5 text-muted-foreground">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-foreground mb-2">No trips yet</h2>
      <p class="text-muted-foreground mb-6">Upload your first vacation photos to get started</p>
      <Button as-child size="sm">
        <router-link to="/admin">Add your first trip</router-link>
      </Button>
    </div>

    <!-- Trip Grid -->
    <div v-else>
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-2xl font-bold text-foreground">All Trips</h2>
        <span class="text-sm text-muted-foreground bg-secondary px-3 py-1 rounded-full">{{ trips.length }} trips</span>
      </div>

      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <TripCard
                  v-for="trip in trips"
                  :key="trip.id"
                  :trip="trip" />
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
