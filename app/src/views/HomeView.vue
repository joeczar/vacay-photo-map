<template>
  <MainLayout>
    <!-- Loading State -->
    <div v-if="loading" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 6" :key="i">
        <Skeleton class="aspect-video w-full" />
        <CardHeader>
          <Skeleton class="h-6 w-3/4" />
          <Skeleton class="h-4 w-full mt-2" />
        </CardHeader>
      </Card>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="trips.length === 0" class="text-center py-12">
      <h2 class="text-2xl font-semibold text-foreground mb-4">No Trips Yet</h2>
      <p class="text-muted-foreground mb-6">Start by uploading your first vacation photos!</p>
      <Button as-child>
        <router-link to="/admin">Upload Your First Trip</router-link>
      </Button>
    </div>

    <!-- Trip Grid -->
    <div v-else>
      <h2 class="text-2xl font-bold text-foreground mb-6">All Trips</h2>
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card
              v-for="trip in trips"
              :key="trip.id"
              class="overflow-hidden hover:shadow-xl transition-shadow group cursor-pointer">
          <router-link :to="`/trip/${trip.slug}`" class="block">
            <!-- Cover Photo -->
            <div class="aspect-video relative bg-muted overflow-hidden">
              <img
                   v-if="trip.cover_photo_url"
                   :src="trip.cover_photo_url"
                   :alt="trip.title"
                   class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
                <svg class="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                  <path
                        fill-rule="evenodd"
                        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                        clip-rule="evenodd" />
                </svg>
              </div>
            </div>

            <!-- Trip Info -->
            <CardHeader>
              <CardTitle class="group-hover:text-primary transition-colors">
                {{ trip.title }}
              </CardTitle>
              <CardDescription v-if="trip.description" class="line-clamp-2">
                {{ trip.description }}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div class="flex items-center gap-4 text-sm">
                <Badge variant="secondary">
                  <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path
                          fill-rule="evenodd"
                          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                          clip-rule="evenodd" />
                  </svg>
                  {{ trip.photo_count }} photos
                </Badge>
                <span v-if="trip.date_range" class="text-muted-foreground text-xs">
                  {{ formatDateRange(trip.date_range) }}
                </span>
              </div>
            </CardContent>
          </router-link>
        </Card>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAllTrips } from '@/utils/database'
import type { Database } from '@/lib/database.types'
import MainLayout from '@/layouts/MainLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

type Trip = Database['public']['Tables']['trips']['Row']

const trips = ref<
  (Trip & { photo_count: number; date_range: { start: string; end: string } })[]
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

function formatDateRange(dateRange: { start: string; end: string }): string {
  const start = new Date(dateRange.start)
  const end = new Date(dateRange.end)

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (start.toDateString() === end.toDateString()) {
    return formatDate(start)
  }

  // Same year
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${formatDate(end)}`
  }

  return `${formatDate(start)} - ${formatDate(end)}`
}
</script>
