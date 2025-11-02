<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-900">
    <header class="bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
      <div class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-slate-100">Vacay Photo Map</h1>
          <a
            href="/admin"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Upload Trip
          </a>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-slate-300">Loading trips...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-12">
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="trips.length === 0" class="text-center py-12">
        <h2 class="text-2xl font-semibold text-gray-700 dark:text-slate-300 mb-4">No Trips Yet</h2>
        <p class="text-gray-600 dark:text-slate-300 mb-6">Start by uploading your first vacation photos!</p>
        <a
          href="/admin"
          class="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
        >
          Upload Your First Trip
        </a>
      </div>

      <!-- Trip Grid -->
      <div v-else>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-6">All Trips</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a
            v-for="trip in trips"
            :key="trip.id"
            :href="`/trip/${trip.slug}`"
            class="block bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-900/50 overflow-hidden hover:shadow-xl dark:hover:shadow-slate-900 transition-shadow group"
          >
            <!-- Cover Photo -->
            <div class="relative h-64 bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <img
                v-if="trip.cover_photo_url"
                :src="trip.cover_photo_url"
                :alt="trip.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-gray-400 dark:text-slate-500">
                <svg class="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <!-- Trip Info -->
            <div class="p-6">
              <h3 class="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                {{ trip.title }}
              </h3>
              <p v-if="trip.description" class="text-gray-600 dark:text-slate-300 text-sm mb-4 line-clamp-2">
                {{ trip.description }}
              </p>

              <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
                <span class="flex items-center gap-1">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  {{ trip.photo_count }} photos
                </span>
                <span v-if="trip.date_range" class="flex items-center gap-1">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  {{ formatDateRange(trip.date_range) }}
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAllTrips } from '@/utils/database'
import type { Database } from '@/lib/database.types'

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
