import { Hono } from 'hono'
import { getDbClient } from '../db/client'
import { requireAdmin, optionalAuth } from '../middleware/auth'
import type { AuthEnv } from '../types/auth'

// =============================================================================
// Database Types
// =============================================================================

interface DbTrip {
  id: string
  slug: string
  title: string
  description: string | null
  cover_photo_url: string | null
  is_public: boolean
  access_token_hash: string | null
  created_at: Date
  updated_at: Date
}

interface DbPhoto {
  id: string
  trip_id: string
  cloudinary_public_id: string
  url: string
  thumbnail_url: string
  latitude: string | null // Decimal comes as string from postgres
  longitude: string | null
  taken_at: Date
  caption: string | null
  album: string | null
  created_at: Date
}

// =============================================================================
// Response Types
// =============================================================================

interface TripResponse {
  id: string
  slug: string
  title: string
  description: string | null
  coverPhotoUrl: string | null
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
  photoCount: number
  dateRange: {
    start: string
    end: string
  }
}

interface TripWithPhotosResponse extends TripResponse {
  photos: PhotoResponse[]
}

interface PhotoResponse {
  id: string
  cloudinaryPublicId: string
  url: string
  thumbnailUrl: string
  latitude: number | null
  longitude: number | null
  takenAt: Date
  caption: string | null
  album: string | null
  createdAt: Date
}

// =============================================================================
// Validation Helpers
// =============================================================================

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_SLUG_LENGTH = 100

function isValidSlug(slug: string): boolean {
  return (
    SLUG_REGEX.test(slug) && slug.length > 0 && slug.length <= MAX_SLUG_LENGTH
  )
}

function isValidTitle(title: string): boolean {
  return title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH
}

function isValidDescription(description: string | undefined | null): boolean {
  if (!description) return true
  return description.length <= MAX_DESCRIPTION_LENGTH
}

function isValidUrl(url: string | undefined | null): boolean {
  if (!url) return true
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// Check if error is a unique constraint violation
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  )
}

// =============================================================================
// Transform Helpers
// =============================================================================

function toTripResponse(
  trip: DbTrip,
  photoCount: number,
  dateRange: { start: string; end: string }
): TripResponse {
  return {
    id: trip.id,
    slug: trip.slug,
    title: trip.title,
    description: trip.description,
    coverPhotoUrl: trip.cover_photo_url,
    isPublic: trip.is_public,
    createdAt: trip.created_at,
    updatedAt: trip.updated_at,
    photoCount,
    dateRange,
  }
}

function toPhotoResponse(photo: DbPhoto): PhotoResponse {
  return {
    id: photo.id,
    cloudinaryPublicId: photo.cloudinary_public_id,
    url: photo.url,
    thumbnailUrl: photo.thumbnail_url,
    latitude: photo.latitude ? parseFloat(photo.latitude) : null,
    longitude: photo.longitude ? parseFloat(photo.longitude) : null,
    takenAt: photo.taken_at,
    caption: photo.caption,
    album: photo.album,
    createdAt: photo.created_at,
  }
}

// =============================================================================
// Routes
// =============================================================================

const trips = new Hono<AuthEnv>()

// =============================================================================
// GET /api/trips - List all public trips
// =============================================================================
trips.get('/', async (c) => {
  const db = getDbClient()

  const tripList = await db<DbTrip[]>`
    SELECT id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
    FROM trips
    WHERE is_public = true
    ORDER BY created_at DESC
  `

  // Get photo metadata for all trips in one query
  const tripIds = tripList.map((t) => t.id)

  interface PhotoStats {
    trip_id: string
    photo_count: string // COUNT returns bigint as string
    min_taken_at: Date | null
    max_taken_at: Date | null
  }

  const photoStats = tripIds.length > 0
    ? await db<PhotoStats[]>`
        SELECT
          trip_id,
          COUNT(*)::text as photo_count,
          MIN(taken_at) as min_taken_at,
          MAX(taken_at) as max_taken_at
        FROM photos
        WHERE trip_id = ANY(${tripIds})
        GROUP BY trip_id
      `
    : []

  // Create a map for quick lookup
  const statsMap = new Map(
    photoStats.map((s) => [s.trip_id, s])
  )

  // Combine trips with their photo metadata
  const tripsWithMetadata = tripList.map((trip) => {
    const stats = statsMap.get(trip.id)
    const photoCount = stats ? parseInt(stats.photo_count, 10) : 0

    // Use photo dates if available, otherwise fall back to trip creation date
    const dateRange = {
      start: stats?.min_taken_at
        ? stats.min_taken_at.toISOString()
        : trip.created_at.toISOString(),
      end: stats?.max_taken_at
        ? stats.max_taken_at.toISOString()
        : trip.created_at.toISOString(),
    }

    return toTripResponse(trip, photoCount, dateRange)
  })

  return c.json({
    trips: tripsWithMetadata,
  })
})

// =============================================================================
// GET /api/trips/:slug - Get trip by slug with access control
// =============================================================================
trips.get('/:slug', optionalAuth, async (c) => {
  const slug = c.req.param('slug')
  const token = c.req.query('token')
  const user = c.var.user
  const db = getDbClient()

  // Find trip by slug
  const tripResults = await db<DbTrip[]>`
    SELECT id, slug, title, description, cover_photo_url, is_public,
           access_token_hash, created_at, updated_at
    FROM trips
    WHERE slug = ${slug}
  `

  if (tripResults.length === 0) {
    return c.json({ error: 'Not Found', message: 'Trip not found' }, 404)
  }

  const trip = tripResults[0]

  // Access control for private trips
  if (!trip.is_public) {
    const isAdmin = user?.isAdmin === true

    // Check if admin
    if (!isAdmin) {
      // Check token if provided
      if (!token || !trip.access_token_hash) {
        return c.json({ error: 'Unauthorized', message: 'Access denied' }, 401)
      }

      // Verify token against hash
      const isValidToken = await Bun.password.verify(
        token,
        trip.access_token_hash
      )
      if (!isValidToken) {
        return c.json({ error: 'Unauthorized', message: 'Invalid token' }, 401)
      }
    }
  }

  // Fetch photos for this trip
  const photos = await db<DbPhoto[]>`
    SELECT id, trip_id, cloudinary_public_id, url, thumbnail_url,
           latitude, longitude, taken_at, caption, album, created_at
    FROM photos
    WHERE trip_id = ${trip.id}
    ORDER BY taken_at ASC
  `

  // Compute photo metadata
  const photoCount = photos.length
  const dateRange = {
    start: photos.length > 0
      ? photos[0].taken_at.toISOString()
      : trip.created_at.toISOString(),
    end: photos.length > 0
      ? photos[photos.length - 1].taken_at.toISOString()
      : trip.created_at.toISOString(),
  }

  const response: TripWithPhotosResponse = {
    ...toTripResponse(trip, photoCount, dateRange),
    photos: photos.map(toPhotoResponse),
  }

  return c.json(response)
})

// =============================================================================
// POST /api/trips - Create trip (admin only)
// =============================================================================
trips.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<{
    slug: string
    title: string
    description?: string
    coverPhotoUrl?: string
    isPublic?: boolean
  }>()

  const { slug, title, description, coverPhotoUrl, isPublic = true } = body

  // Validate required fields
  if (!slug || !isValidSlug(slug)) {
    return c.json(
      {
        error: 'Bad Request',
        message:
          'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
      },
      400
    )
  }

  if (!title || !isValidTitle(title)) {
    return c.json(
      {
        error: 'Bad Request',
        message: `Title is required and must be ${MAX_TITLE_LENGTH} characters or less.`,
      },
      400
    )
  }

  if (!isValidDescription(description)) {
    return c.json(
      {
        error: 'Bad Request',
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`,
      },
      400
    )
  }

  if (!isValidUrl(coverPhotoUrl)) {
    return c.json(
      { error: 'Bad Request', message: 'Invalid cover photo URL.' },
      400
    )
  }

  const db = getDbClient()

  try {
    const [trip] = await db<DbTrip[]>`
      INSERT INTO trips (slug, title, description, cover_photo_url, is_public)
      VALUES (${slug}, ${title.trim()}, ${description?.trim() || null}, ${coverPhotoUrl || null}, ${isPublic})
      RETURNING id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
    `

    // New trip has no photos yet
    const photoCount = 0
    const dateRange = {
      start: trip.created_at.toISOString(),
      end: trip.created_at.toISOString(),
    }

    return c.json(toTripResponse(trip, photoCount, dateRange), 201)
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        { error: 'Conflict', message: 'A trip with this slug already exists.' },
        409
      )
    }
    throw error
  }
})

// =============================================================================
// PATCH /api/trips/:id - Update trip (admin only)
// =============================================================================
trips.patch('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    slug?: string
    title?: string
    description?: string | null
    coverPhotoUrl?: string | null
    isPublic?: boolean
  }>()

  const { slug, title, description, coverPhotoUrl, isPublic } = body

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Bad Request', message: 'Invalid trip ID format.' }, 400)
  }

  // Validate optional fields if provided
  if (slug !== undefined && !isValidSlug(slug)) {
    return c.json(
      {
        error: 'Bad Request',
        message:
          'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
      },
      400
    )
  }

  if (title !== undefined && !isValidTitle(title)) {
    return c.json(
      {
        error: 'Bad Request',
        message: `Title must be non-empty and ${MAX_TITLE_LENGTH} characters or less.`,
      },
      400
    )
  }

  if (description !== undefined && !isValidDescription(description)) {
    return c.json(
      {
        error: 'Bad Request',
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`,
      },
      400
    )
  }

  if (coverPhotoUrl !== undefined && !isValidUrl(coverPhotoUrl)) {
    return c.json(
      { error: 'Bad Request', message: 'Invalid cover photo URL.' },
      400
    )
  }

  const db = getDbClient()

  // Check if trip exists
  const existing = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${id}
  `

  if (existing.length === 0) {
    return c.json({ error: 'Not Found', message: 'Trip not found' }, 404)
  }

  // Build dynamic update - only update provided fields
  const updates: Record<string, unknown> = {}
  if (slug !== undefined) updates.slug = slug
  if (title !== undefined) updates.title = title.trim()
  if (description !== undefined)
    updates.description = description?.trim() || null
  if (coverPhotoUrl !== undefined)
    updates.cover_photo_url = coverPhotoUrl || null
  if (isPublic !== undefined) updates.is_public = isPublic

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'Bad Request', message: 'No fields to update.' }, 400)
  }

  try {
    const [trip] = await db<DbTrip[]>`
      UPDATE trips
      SET ${db(updates)}
      WHERE id = ${id}
      RETURNING id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
    `

    // Fetch photo metadata for this trip
    interface PhotoStats {
      photo_count: string
      min_taken_at: Date | null
      max_taken_at: Date | null
    }

    const [stats] = await db<PhotoStats[]>`
      SELECT
        COUNT(*)::text as photo_count,
        MIN(taken_at) as min_taken_at,
        MAX(taken_at) as max_taken_at
      FROM photos
      WHERE trip_id = ${id}
    `

    const photoCount = stats ? parseInt(stats.photo_count, 10) : 0
    const dateRange = {
      start: stats?.min_taken_at
        ? stats.min_taken_at.toISOString()
        : trip.created_at.toISOString(),
      end: stats?.max_taken_at
        ? stats.max_taken_at.toISOString()
        : trip.created_at.toISOString(),
    }

    return c.json(toTripResponse(trip, photoCount, dateRange))
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        { error: 'Conflict', message: 'A trip with this slug already exists.' },
        409
      )
    }
    throw error
  }
})

// =============================================================================
// DELETE /api/trips/:id - Delete trip (admin only)
// =============================================================================
trips.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Bad Request', message: 'Invalid trip ID format.' }, 400)
  }

  const db = getDbClient()

  const result = await db`
    DELETE FROM trips
    WHERE id = ${id}
    RETURNING id
  `

  if (result.length === 0) {
    return c.json({ error: 'Not Found', message: 'Trip not found' }, 404)
  }

  // 204 No Content
  return c.body(null, 204)
})

// =============================================================================
// PATCH /api/trips/:id/protection - Update protection settings (admin only)
// =============================================================================
trips.patch('/:id/protection', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    isPublic: boolean
    token?: string
  }>()

  const { isPublic, token } = body

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Bad Request', message: 'Invalid trip ID format.' }, 400)
  }

  // Validate isPublic is a boolean
  if (typeof isPublic !== 'boolean') {
    return c.json(
      { error: 'Bad Request', message: 'isPublic must be a boolean.' },
      400
    )
  }

  // If making private, token is recommended (but not required - can set later)
  // If token provided, it should be at least 8 characters for security
  if (token !== undefined && token.length < 8) {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Token must be at least 8 characters long.',
      },
      400
    )
  }

  const db = getDbClient()

  // Check if trip exists
  const existing = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${id}
  `

  if (existing.length === 0) {
    return c.json({ error: 'Not Found', message: 'Trip not found' }, 404)
  }

  // Hash token if provided and making private
  const accessTokenHash = !isPublic && token
    ? await Bun.password.hash(token, { algorithm: 'bcrypt', cost: 14 })
    : null

  // Update trip protection settings in a single query:
  // - If making public: clear the token hash
  // - If making private with token: set new hash
  // - If making private without token: keep existing hash
  await db`
    UPDATE trips
    SET
      is_public = ${isPublic},
      access_token_hash = CASE
        WHEN ${isPublic} THEN NULL
        WHEN ${token !== undefined} THEN ${accessTokenHash}
        ELSE access_token_hash
      END
    WHERE id = ${id}
  `

  return c.json({ success: true })
})

// =============================================================================
// POST /api/trips/:id/photos - Add photos to trip (admin only)
// =============================================================================
trips.post('/:id/photos', requireAdmin, async (c) => {
  const tripId = c.req.param('id')
  const body = await c.req.json<{
    photos: Array<{
      cloudinaryPublicId: string
      url: string
      thumbnailUrl: string
      latitude: number | null
      longitude: number | null
      takenAt: string
      caption: string | null
    }>
  }>()

  const { photos } = body

  // Validate UUID format
  if (!UUID_REGEX.test(tripId)) {
    return c.json({ error: 'Bad Request', message: 'Invalid trip ID format.' }, 400)
  }

  // Validate photos array
  if (!Array.isArray(photos) || photos.length === 0) {
    return c.json(
      { error: 'Bad Request', message: 'Photos array is required and must not be empty.' },
      400
    )
  }

  const db = getDbClient()

  // Check if trip exists
  const existing = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `

  if (existing.length === 0) {
    return c.json({ error: 'Not Found', message: 'Trip not found' }, 404)
  }

  // Insert all photos
  const insertedPhotos = await db<DbPhoto[]>`
    INSERT INTO photos ${db(
      photos.map((p) => ({
        trip_id: tripId,
        cloudinary_public_id: p.cloudinaryPublicId,
        url: p.url,
        thumbnail_url: p.thumbnailUrl,
        latitude: p.latitude,
        longitude: p.longitude,
        taken_at: p.takenAt,
        caption: p.caption,
      }))
    )}
    RETURNING *
  `

  return c.json({ photos: insertedPhotos.map(toPhotoResponse) }, 201)
})

export { trips }
