import type { TablesInsert, TablesRow } from '@/lib/database.types'
import { api, ApiError, requireAuth } from '@/lib/api'
import { useAuth } from '@/composables/useAuth'

type Trip = TablesRow<'trips'>
type TripInsert = TablesInsert<'trips'>
type Photo = TablesRow<'photos'>
type PhotoInsert = TablesInsert<'photos'>

// API trip type - backend excludes access_token_hash for security (never sent to clients)
export type ApiTrip = Omit<Trip, 'access_token_hash'>

// Trip with metadata (used for list views)
export type TripWithMetadata = ApiTrip & {
  photo_count: number
  date_range: {
    start: string
    end: string
  }
  userRole?: 'admin' | 'editor' | 'viewer'
}

// API Response Types (camelCase from backend)
interface ApiTripResponse {
  id: string
  slug: string
  title: string
  description: string | null
  coverPhotoUrl: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  photoCount: number
  dateRange: {
    start: string
    end: string
  }
  userRole?: 'admin' | 'editor' | 'viewer'
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
  rotation: number
  createdAt: string
}

interface ApiTripWithPhotosResponse extends ApiTripResponse {
  photos: ApiPhotoResponse[]
}

// API input type for creating photos (camelCase for API)
interface ApiPhotoInsert {
  cloudinaryPublicId: string
  url: string
  thumbnailUrl: string
  latitude: number | null
  longitude: number | null
  takenAt: string
  caption: string | null
  rotation?: number
}

// Transform database types (snake_case) to API format (camelCase)
function transformPhotoToApi(photo: PhotoInsert): ApiPhotoInsert {
  return {
    cloudinaryPublicId: photo.cloudinary_public_id,
    url: photo.url,
    thumbnailUrl: photo.thumbnail_url,
    latitude: photo.latitude ?? null,
    longitude: photo.longitude ?? null,
    takenAt: photo.taken_at,
    caption: photo.caption ?? null,
    rotation: photo.rotation ?? 0
  }
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
    created_at: apiTrip.createdAt,
    updated_at: apiTrip.updatedAt,
    photo_count: apiTrip.photoCount,
    date_range: {
      start: apiTrip.dateRange.start,
      end: apiTrip.dateRange.end
    },
    userRole: apiTrip.userRole
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
    rotation: apiPhoto.rotation,
    created_at: apiPhoto.createdAt
  }
}

function transformApiTripWithPhotos(
  apiTrip: ApiTripWithPhotosResponse
): ApiTrip & { photos: Photo[] } {
  return {
    ...transformApiTrip(apiTrip),
    photos: apiTrip.photos.map(transformApiPhoto)
  }
}

/**
 * Create a new trip
 */
export async function createTrip(trip: TripInsert): Promise<ApiTrip> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  const body = {
    title: trip.title,
    description: trip.description,
    slug: trip.slug,
    isPublic: trip.is_public,
    coverPhotoUrl: trip.cover_photo_url
  }

  const apiTrip = await api.post<ApiTripResponse>('/api/trips', body)
  return transformApiTrip(apiTrip)
}

/**
 * Insert multiple photos for a trip
 */
export async function createPhotos(photos: PhotoInsert[]): Promise<Photo[]> {
  if (photos.length === 0) return []

  const { getToken } = useAuth()
  requireAuth(getToken)

  // All photos should have the same trip_id
  const tripId = photos[0].trip_id

  // Transform snake_case input to camelCase for API
  const apiPhotos = photos.map(transformPhotoToApi)

  const response = await api.post<{ photos: ApiPhotoResponse[] }>(`/api/trips/${tripId}/photos`, {
    photos: apiPhotos
  })

  return response.photos.map(transformApiPhoto)
}

/**
 * Get a trip by slug (public or with access token for private trips)
 */
export async function getTripBySlug(
  slug: string,
  token?: string
): Promise<(ApiTrip & { photos: Photo[] }) | null> {
  try {
    const path = token ? `/api/trips/slug/${slug}?token=${token}` : `/api/trips/slug/${slug}`
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
 * Get trips accessible to authenticated user with metadata
 * Returns trips based on user's access level (admin sees all, users see only accessible trips)
 */
export async function getTripsWithAuth(): Promise<TripWithMetadata[]> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  const { trips } = await api.get<{ trips: ApiTripResponse[] }>('/api/trips')
  return trips.map(transformApiTrip)
}

/**
 * Admin-only endpoint that returns all trips including drafts
 */
export async function getAllTripsAdmin(): Promise<TripWithMetadata[]> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  const { trips } = await api.get<{ trips: ApiTripResponse[] }>('/api/trips/admin')
  return trips.map(transformApiTrip)
}

/**
 * Update trip fields
 */
export async function updateTrip(
  tripId: string,
  updates: {
    isPublic?: boolean
    coverPhotoUrl?: string | null
    title?: string
    description?: string | null
  }
): Promise<void> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  await api.patch(`/api/trips/${tripId}`, updates)
}

/**
 * Update trip cover photo
 */
export async function updateTripCoverPhoto(tripId: string, coverPhotoUrl: string): Promise<void> {
  await updateTrip(tripId, { coverPhotoUrl })
}

/**
 * Delete a trip and all associated photos
 * Backend handles cascade deletion
 */
export async function deleteTrip(tripId: string): Promise<void> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  await api.delete(`/api/trips/${tripId}`)
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

/**
 * Get a trip by ID (admin-only)
 * Used for editing draft trips
 */
export async function getTripById(tripId: string): Promise<(ApiTrip & { photos: Photo[] }) | null> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  try {
    const trip = await api.get<ApiTripWithPhotosResponse>(`/api/trips/id/${tripId}`)
    return transformApiTripWithPhotos(trip)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * Delete a photo from a trip (admin-only)
 */
export async function deletePhoto(photoId: string): Promise<void> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  await api.delete(`/api/trips/photos/${photoId}`)
}
