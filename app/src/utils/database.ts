import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesRow, TablesUpdate } from '@/lib/database.types'

type Trip = TablesRow<'trips'>
type TripInsert = TablesInsert<'trips'>
type Photo = TablesRow<'photos'>
type PhotoInsert = TablesInsert<'photos'>

/**
 * Create a new trip
 * Note: Type assertion required due to Supabase-js v2.39 type inference limitations
 */
export async function createTrip(trip: TripInsert): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .insert([trip] as unknown as never)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('No data returned from insert')
  return data as Trip
}

/**
 * Insert multiple photos for a trip
 * Note: Type assertion required due to Supabase-js v2.39 type inference limitations
 */
export async function createPhotos(photos: PhotoInsert[]): Promise<Photo[]> {
  const { data, error} = await supabase
    .from('photos')
    .insert(photos as unknown as never)
    .select()

  if (error) throw error
  if (!data) throw new Error('No data returned from insert')
  return data as Photo[]
}

/**
 * Get a trip by slug with all photos via Edge Function
 * Handles access control for public and protected trips
 * @param slug - Trip slug identifier
 * @param token - Optional access token for protected trips
 * @returns Trip with photos if found, or null if not found
 * @throws Error with status code (401 for unauthorized, others for HTTP errors)
 */
export async function getTripBySlug(
  slug: string,
  token?: string
): Promise<(Trip & { photos: Photo[] }) | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL environment variable')
  }

  // Build URL with query parameters
  const url = new URL(`${supabaseUrl}/functions/v1/get-trip`)
  url.searchParams.set('slug', slug)
  if (token) {
    url.searchParams.set('token', token)
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header needed - using query params for token
      },
    })

    // Handle unauthorized access (missing/invalid token)
    if (response.status === 401) {
      const error = new Error('Unauthorized') as Error & { status: number }
      error.status = 401
      throw error
    }

    // Handle not found
    if (response.status === 404) {
      return null
    }

    // Handle other errors
    if (!response.ok) {
      const error = new Error(`HTTP error ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    const trip = await response.json()
    return trip as (Trip & { photos: Photo[] })
  } catch (error) {
    // Re-throw errors with status codes for proper handling in TripView
    if (error instanceof Error && 'status' in error) {
      throw error
    }

    // Network or other errors
    console.error('Error fetching trip:', error)
    return null
  }
}

/**
 * Get all public trips with photo count
 * Note: Type assertion required due to Supabase-js v2.39 type inference limitations
 */
export async function getAllTrips(): Promise<
  (Trip & { photo_count: number; date_range: { start: string; end: string } })[]
> {
  const result = (await supabase
    .from('trips')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })) as {
    data: Trip[] | null
    error: unknown
  }

  if (result.error) throw result.error
  if (!result.data) return []

  const trips = result.data

  // Get photo counts and date ranges for each trip
  const tripsWithMetadata = await Promise.all(
    trips.map(async trip => {
      const photosResult = (await supabase
        .from('photos')
        .select('taken_at')
        .eq('trip_id', trip.id)
        .order('taken_at', { ascending: true })) as {
        data: { taken_at: string }[] | null
        error: unknown
      }

      const photos = photosResult.data || []
      const photoCount = photos.length
      const dateRange =
        photos.length > 0
          ? {
              start: photos[0].taken_at,
              end: photos[photos.length - 1].taken_at
            }
          : { start: trip.created_at, end: trip.created_at }

      return {
        ...trip,
        photo_count: photoCount,
        date_range: dateRange
      }
    })
  )

  return tripsWithMetadata
}

/**
 * Update trip cover photo
 * Note: Type assertion required due to Supabase-js v2.39 type inference limitations
 */
export async function updateTripCoverPhoto(tripId: string, coverPhotoUrl: string): Promise<void> {
  const updateData: TablesUpdate<'trips'> = { cover_photo_url: coverPhotoUrl }

  const { error } = await supabase
    .from('trips')
    .update(updateData as unknown as never)
    .eq('id', tripId)

  if (error) throw error
}

/**
 * Delete a trip and all associated photos
 * This will cascade delete all photos in the trip due to foreign key constraints
 */
export async function deleteTrip(tripId: string): Promise<void> {
  console.log(`🗑️  Deleting trip ${tripId} and all associated photos...`)

  // First, delete all photos for this trip
  const { error: photosError } = await supabase
    .from('photos')
    .delete()
    .eq('trip_id', tripId)

  if (photosError) {
    console.error('Failed to delete photos:', photosError)
    throw photosError
  }

  // Then delete the trip itself
  const { error: tripError } = await supabase
    .from('trips')
    .delete()
    .eq('id', tripId)

  if (tripError) {
    console.error('Failed to delete trip:', tripError)
    throw tripError
  }

  console.log(`✅ Trip ${tripId} and all photos deleted successfully`)
}
