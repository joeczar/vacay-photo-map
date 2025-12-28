import { ref, watch, type Ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import { getTripBySlugPaginated, type ApiTrip } from '@/utils/database'
import type { TablesRow } from '@/lib/database.types'
import { ApiError } from '@/lib/api'

type Photo = TablesRow<'photos'>

const LIMIT = 50

/**
 * Composable for managing infinite scroll photo loading
 *
 * Features:
 * - Initial load fetches 50 photos
 * - Intersection observer triggers loading more photos on scroll
 * - Accumulates photos as user scrolls
 * - Handles error states including 401 (private trips)
 * - Watches slug changes and reloads
 *
 * @param tripSlug - Trip slug (reactive ref or string)
 * @returns Object containing photos array, trip metadata, loading states, and control functions
 */
export function useInfinitePhotos(tripSlug: Ref<string> | string) {
  const slug = typeof tripSlug === 'string' ? ref(tripSlug) : tripSlug

  // State
  const photos = ref<Photo[]>([])
  const tripMetadata = ref<ApiTrip | null>(null)
  const loading = ref(true)
  const loadingMore = ref(false)
  const hasMore = ref(false)
  const total = ref(0)
  const offset = ref(0)
  const error = ref('')

  // Sentinel element for intersection observer
  const sentinelRef = ref<HTMLElement | null>(null)

  /**
   * Load initial page of photos
   * Resets all state before fetching
   */
  async function loadInitialPhotos() {
    loading.value = true
    error.value = ''
    photos.value = []
    offset.value = 0

    try {
      const data = await getTripBySlugPaginated(slug.value, 0, LIMIT)

      if (!data) {
        error.value = 'Trip not found'
        return
      }

      const { photos: fetchedPhotos, pagination, ...metadata } = data

      tripMetadata.value = metadata
      photos.value = fetchedPhotos
      total.value = pagination.total
      hasMore.value = pagination.hasMore
      offset.value = LIMIT
    } catch (err) {
      console.error('[useInfinitePhotos] Error loading photos:', err)

      // Handle 401 Unauthorized specifically
      if (err instanceof ApiError && err.status === 401) {
        error.value = 'This trip is private. Please use the link provided by the trip owner.'
      } else {
        error.value = 'Failed to load trip'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Load next page of photos
   * Appends to existing photos array
   * Guards against double-loading with loadingMore flag
   */
  async function loadMorePhotos() {
    if (loadingMore.value || !hasMore.value) return

    loadingMore.value = true

    try {
      const data = await getTripBySlugPaginated(slug.value, offset.value, LIMIT)

      if (!data) return

      const { photos: fetchedPhotos, pagination } = data

      photos.value = [...photos.value, ...fetchedPhotos]
      hasMore.value = pagination.hasMore
      offset.value += LIMIT
    } catch (err) {
      console.error('[useInfinitePhotos] Error loading more photos:', err)
      // Don't update error.value - show existing photos
    } finally {
      loadingMore.value = false
    }
  }

  // Set up intersection observer
  useIntersectionObserver(
    sentinelRef,
    ([{ isIntersecting }]) => {
      if (isIntersecting && hasMore.value && !loadingMore.value) {
        loadMorePhotos()
      }
    },
    { threshold: 0.1 }
  )

  // Watch slug changes and reload
  watch(slug, () => {
    loadInitialPhotos()
  })

  // Initial load
  loadInitialPhotos()

  return {
    photos,
    tripMetadata,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    loadMorePhotos,
    sentinelRef
  }
}
