import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesRow } from '@/lib/database.types'
import { api, ApiError } from '@/lib/api'
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
 */
export async function createTrip(trip: TripInsert): Promise<Trip> {
  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')

  api.setToken(token)

  const body = {
    title: trip.title,
    description: trip.description,
    slug: trip.slug,
    isPublic: trip.is_public,
    coverPhotoUrl: trip.cover_photo_url,
  }

  const apiTrip = await api.post<ApiTripResponse>('/api/trips', body)
  return transformApiTrip(apiTrip)
}

/**
 * Insert multiple photos for a trip
 *
 * @deprecated Temporarily using Supabase client directly.
 * TODO: Migrate to API once POST /api/trips/:id/photos endpoint is implemented.
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
 */
export async function updateTripCoverPhoto(tripId: string, coverPhotoUrl: string): Promise<void> {
  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')

  api.setToken(token)
  await api.patch(`/api/trips/${tripId}`, { coverPhotoUrl })
}

/**
 * Delete a trip and all associated photos
 * Backend handles cascade deletion
 */
export async function deleteTrip(tripId: string): Promise<void> {
  console.log(`🗑️  Deleting trip ${tripId} and all associated photos...`)

  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')

  api.setToken(token)
  await api.delete(`/api/trips/${tripId}`)

  console.log(`✅ Trip ${tripId} and all photos deleted successfully`)
}

/**
 * Update trip protection settings
 * @param tripId - Trip UUID
 * @param isPublic - Whether the trip should be public
 * @param token - Plaintext token to hash (required when isPublic is false)
 * @param authToken - JWT for authorization
 */
export async function updateTripProtection(
  tripId: string,
  isPublic: boolean,
  token: string | undefined,
  authToken: string
): Promise<void> {
  api.setToken(authToken)
  await api.patch(`/api/trips/${tripId}/protection`, { isPublic, token })
}
