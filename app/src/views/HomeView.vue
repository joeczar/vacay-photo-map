<template>
  <MainLayout>
    <!-- Hero Section -->
    <!-- Hero Section: Personal & Styled -->
    <div
         class="relative overflow-hidden rounded-3xl bg-secondary/30 border border-white/5 px-6 py-12 shadow-2xl sm:px-12 sm:py-16 mb-12">
      <!-- Gradient Glow -->
      <div class="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl pointer-events-none"></div>

      <div class="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-2">
            Welcome back.
          </h1>
          <p class="text-muted-foreground text-lg">
            Where to next?
          </p>
        </div>
        <Button v-if="trips.length > 0" variant="outline" as-child
                class="bg-background/50 backdrop-blur-sm border-white/10 hover:bg-background/80">
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
    <div v-else-if="error" class="text-center py-12">
      <div
           class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 text-destructive mb-4">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p class="text-destructive font-medium">{{ error }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="trips.length === 0"
         class="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-3xl bg-card/50">
      <div class="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary">
        <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h2 class="text-2xl font-semibold text-foreground mb-2">No hTrips Yet</h2>
      <p class="text-muted-foreground mb-8">Start by uploading your first vacation photos!</p>
      <Button as-child>
        <router-link to="/admin">Upload Your First Trip</router-link>
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

onMounted(async () => {
  try {
    trips.value = await getAllTrips()
  } catch (err) {
    console.error('Error loading trips:', err)
    error.value = 'Failed to load trips'
  } finally {
    loading.value = false
  }
})
</script>
