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
 * - Cancels stale requests on slug change
 *
 * @param tripSlug - Trip slug (reactive ref or string)
 * @param sentinelRef - Template ref for the sentinel element (for intersection observer)
 * @returns Object containing photos array, trip metadata, loading states, and control functions
 */
export function useInfinitePhotos(
  tripSlug: Ref<string> | string,
  sentinelRef: Ref<HTMLElement | null>
) {
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

  // Request tracking to prevent race conditions
  let currentRequestId = 0

  /**
   * Load initial page of photos
   * Resets all state before fetching
   * Uses request ID to ignore stale responses
   */
  async function loadInitialPhotos() {
    const requestId = ++currentRequestId
    loading.value = true
    error.value = ''
    photos.value = []
    offset.value = 0

    try {
      const data = await getTripBySlugPaginated(slug.value, 0, LIMIT)

      // Ignore stale response if slug changed during fetch
      if (requestId !== currentRequestId) return

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
      // Ignore errors from stale requests
      if (requestId !== currentRequestId) return

      console.error('[useInfinitePhotos] Error loading photos:', err)

      // Handle 401 Unauthorized specifically
      if (err instanceof ApiError && err.status === 401) {
        error.value = 'This trip is private. Please use the link provided by the trip owner.'
      } else {
        error.value = 'Failed to load trip'
      }
    } finally {
      // Only update loading if this is still the current request
      if (requestId === currentRequestId) {
        loading.value = false
      }
    }
  }

  /**
   * Load next page of photos
   * Appends to existing photos array
   * Guards against double-loading with loadingMore flag
   */
  async function loadMorePhotos() {
    if (loadingMore.value || !hasMore.value) return

    const requestId = currentRequestId
    loadingMore.value = true

    try {
      const data = await getTripBySlugPaginated(slug.value, offset.value, LIMIT)

      // Ignore stale response
      if (requestId !== currentRequestId) return

      if (!data) return

      const { photos: fetchedPhotos, pagination } = data

      photos.value.push(...fetchedPhotos)
      hasMore.value = pagination.hasMore
      offset.value += LIMIT
    } catch (err) {
      // Ignore errors from stale requests
      if (requestId !== currentRequestId) return

      console.error('[useInfinitePhotos] Error loading more photos:', err)
      // Don't update error.value - show existing photos
    } finally {
      if (requestId === currentRequestId) {
        loadingMore.value = false
      }
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

  // Watch slug changes and reload (immediate: true handles initial load)
  watch(
    slug,
    () => {
      loadInitialPhotos()
    },
    { immediate: true }
  )

  return {
    photos,
    tripMetadata,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    loadMorePhotos
  }
}
