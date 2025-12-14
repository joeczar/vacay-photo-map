import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesRow, TablesUpdate } from '@/lib/database.types'
import { api, ApiError } from '@/lib/api'
// @ts-expect-error - Will be used in future commits
import { useAuth } from '@/composables/useAuth'

type Trip = TablesRow<'trips'>
type TripInsert = TablesInsert<'trips'>
type Photo = TablesRow<'photos'>
type PhotoInsert = TablesInsert<'photos'>

// Trip with metadata (used for list views)
type TripWithMetadata = Trip & {
  photo_count: number
  date_range: {
    start: string
    end: string
  }
}

// API Response Types (camelCase from backend)
interface ApiTripResponse {
  id: string
  slug: string
  title: string
  description: string | null
  coverPhotoUrl: string | null
  isPublic: boolean
  accessTokenHash: string | null
  createdAt: string
  updatedAt: string
  photoCount: number
  dateRange: {
    start: string
    end: string
  }
}

interface ApiPhotoResponse {
  id: string
  tripId: string
  cloudinaryPublicId: string
  url: string
  thumbnailUrl: string
  latitude: number | null
  longitude: number | null
  takenAt: string
  caption: string | null
  album: string | null
  createdAt: string
}

interface ApiTripWithPhotosResponse extends ApiTripResponse {
  photos: ApiPhotoResponse[]
}

// Transform API responses (camelCase) to database types (snake_case)
function transformApiTrip(apiTrip: ApiTripResponse): TripWithMetadata {
  return {
    id: apiTrip.id,
    slug: apiTrip.slug,
    title: apiTrip.title,
    description: apiTrip.description,
    cover_photo_url: apiTrip.coverPhotoUrl,
    is_public: apiTrip.isPublic,
    access_token_hash: apiTrip.accessTokenHash,
    created_at: apiTrip.createdAt,
    updated_at: apiTrip.updatedAt,
    photo_count: apiTrip.photoCount,
    date_range: {
      start: apiTrip.dateRange.start,
      end: apiTrip.dateRange.end,
    },
  }
}

function transformApiPhoto(apiPhoto: ApiPhotoResponse): Photo {
  return {
    id: apiPhoto.id,
    trip_id: apiPhoto.tripId,
    cloudinary_public_id: apiPhoto.cloudinaryPublicId,
    url: apiPhoto.url,
    thumbnail_url: apiPhoto.thumbnailUrl,
    latitude: apiPhoto.latitude,
    longitude: apiPhoto.longitude,
    taken_at: apiPhoto.takenAt,
    caption: apiPhoto.caption,
    album: apiPhoto.album,
    created_at: apiPhoto.createdAt,
  }
}

function transformApiTripWithPhotos(apiTrip: ApiTripWithPhotosResponse): Trip & { photos: Photo[] } {
  return {
    ...transformApiTrip(apiTrip),
    photos: apiTrip.photos.map(transformApiPhoto),
  }
}

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
  const { data, error } = await supabase
    .from('photos')
    .insert(photos as unknown as never)
    .select()

  if (error) throw error
  if (!data) throw new Error('No data returned from insert')
  return data as Photo[]
}

/**
 * Get a trip by slug (public or with access token for private trips)
 */
export async function getTripBySlug(
  slug: string,
  token?: string
): Promise<(Trip & { photos: Photo[] }) | null> {
  try {
    const path = token ? `/api/trips/${slug}?token=${token}` : `/api/trips/${slug}`
    const trip = await api.get<ApiTripWithPhotosResponse>(path)
    return transformApiTripWithPhotos(trip)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * Get all public trips with metadata (photo count and date range)
 */
export async function getAllTrips(): Promise<TripWithMetadata[]> {
  const { trips } = await api.get<{ trips: ApiTripResponse[] }>('/api/trips')
  return trips.map(transformApiTrip)
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
  const { error: photosError } = await supabase.from('photos').delete().eq('trip_id', tripId)

  if (photosError) {
    console.error('Failed to delete photos:', photosError)
    throw photosError
  }

  // Then delete the trip itself
  const { error: tripError } = await supabase.from('trips').delete().eq('id', tripId)

  if (tripError) {
    console.error('Failed to delete trip:', tripError)
    throw tripError
  }

  console.log(`✅ Trip ${tripId} and all photos deleted successfully`)
}

/**
 * Update trip protection settings via Edge Function
 * Handles token hashing server-side for security
 * @param tripId - Trip UUID
 * @param isPublic - Whether the trip should be public
 * @param token - Plaintext token to hash (required when isPublic is false)
 * @param authToken - JWT from API login endpoint (/api/auth/login) for authorization
 */
export async function updateTripProtection(
  tripId: string,
  isPublic: boolean,
  token: string | undefined,
  authToken: string
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL environment variable')
  }

  const url = `${supabaseUrl}/functions/v1/update-trip-protection`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      tripId,
      isPublic,
      token
    })
  })

  if (response.status === 401) {
    throw new Error('Unauthorized: Please log in again')
  }

  if (response.status === 403) {
    throw new Error('Forbidden: Admin access required')
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Failed to update trip protection (${response.status})`)
  }
}
