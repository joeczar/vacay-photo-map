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
 * Get a trip by slug with all photos
 * Note: Type assertion required due to Supabase-js v2.39 type inference limitations
 */
export async function getTripBySlug(slug: string): Promise<(Trip & { photos: Photo[] }) | null> {
  const tripResult = (await supabase.from('trips').select('*').eq('slug', slug).single()) as {
    data: Trip | null
    error: unknown
  }

  if (tripResult.error) return null
  if (!tripResult.data) return null

  const trip = tripResult.data

  const photosResult = (await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', trip.id)
    .order('taken_at', { ascending: true })) as {
    data: Photo[] | null
    error: unknown
  }

  if (photosResult.error) throw photosResult.error

  return {
    ...trip,
    photos: photosResult.data || []
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
