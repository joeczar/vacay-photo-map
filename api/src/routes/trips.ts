import { Hono } from "hono";
import { rm } from "node:fs/promises";
import { getDbClient } from "../db/client";
import { requireAdmin, requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";
import { getPhotosDir } from "./upload";
import {
  deleteMultipleFromR2,
  isR2Available,
  PHOTOS_URL_PREFIX,
} from "../utils/r2";

// =============================================================================
// Database Types
// =============================================================================

interface DbTrip {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_photo_url: string | null;
  is_public: boolean;
  access_token_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbPhoto {
  id: string;
  trip_id: string;
  cloudinary_public_id: string;
  url: string;
  thumbnail_url: string;
  latitude: string | null; // Decimal comes as string from postgres
  longitude: string | null;
  taken_at: Date;
  caption: string | null;
  album: string | null;
  rotation: number;
  created_at: Date;
}

// =============================================================================
// Response Types
// =============================================================================

interface TripResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverPhotoUrl: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  photoCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  userRole?: "admin" | "editor" | "viewer";
}

interface TripWithPhotosResponse extends TripResponse {
  photos: PhotoResponse[];
}

interface PhotoResponse {
  id: string;
  cloudinaryPublicId: string;
  url: string;
  thumbnailUrl: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: Date;
  caption: string | null;
  album: string | null;
  rotation: number;
  createdAt: Date;
}

// =============================================================================
// Validation Helpers
// =============================================================================

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SLUG_LENGTH = 100;

function isValidSlug(slug: string): boolean {
  return (
    SLUG_REGEX.test(slug) && slug.length > 0 && slug.length <= MAX_SLUG_LENGTH
  );
}

/**
 * Check if a string looks like a UUID to prevent routing collisions.
 * Even though we now have separate endpoints, we still want to prevent
 * confusing slug names.
 */
function looksLikeUuid(str: string): boolean {
  return UUID_REGEX.test(str);
}

function isValidTitle(title: string): boolean {
  return title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH;
}

function isValidDescription(description: string | undefined | null): boolean {
  if (!description) return true;
  return description.length <= MAX_DESCRIPTION_LENGTH;
}

function isValidUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  // Accept relative paths for self-hosted photos
  if (url.startsWith(PHOTOS_URL_PREFIX)) return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Check if error is a unique constraint violation
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

// =============================================================================
// Transform Helpers
// =============================================================================

interface PhotoStats {
  photo_count: string; // COUNT returns bigint as string
  min_taken_at: Date | null;
  max_taken_at: Date | null;
}

function getMetadataFromStats(
  stats: PhotoStats | undefined,
  fallbackDate: Date,
): { photoCount: number; dateRange: { start: string; end: string } } {
  const photoCount = stats ? parseInt(stats.photo_count, 10) : 0;
  const dateRange = {
    start: stats?.min_taken_at
      ? stats.min_taken_at.toISOString()
      : fallbackDate.toISOString(),
    end: stats?.max_taken_at
      ? stats.max_taken_at.toISOString()
      : fallbackDate.toISOString(),
  };
  return { photoCount, dateRange };
}

function toTripResponse(
  trip: DbTrip,
  photoCount: number,
  dateRange: { start: string; end: string },
  userRole?: "admin" | "editor" | "viewer",
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
    ...(userRole ? { userRole } : {}),
  };
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
    rotation: photo.rotation,
    createdAt: photo.created_at,
  };
}

/**
 * Fetches photos for a trip and builds the complete trip response
 * with photos and metadata
 */
async function buildTripWithPhotosResponse(
  trip: DbTrip,
  db: ReturnType<typeof getDbClient>,
): Promise<TripWithPhotosResponse> {
  // Fetch photos for this trip
  const photos = await db<DbPhoto[]>`
    SELECT id, trip_id, cloudinary_public_id, url, thumbnail_url,
           latitude, longitude, taken_at, caption, album, rotation, created_at
    FROM photos
    WHERE trip_id = ${trip.id}
    ORDER BY taken_at ASC
  `;

  // Compute photo metadata
  const photoCount = photos.length;
  const dateRange = {
    start:
      photos.length > 0
        ? photos[0].taken_at.toISOString()
        : trip.created_at.toISOString(),
    end:
      photos.length > 0
        ? photos[photos.length - 1].taken_at.toISOString()
        : trip.created_at.toISOString(),
  };

  return {
    ...toTripResponse(trip, photoCount, dateRange),
    photos: photos.map(toPhotoResponse),
  };
}

// =============================================================================
// Routes
// =============================================================================

const trips = new Hono<AuthEnv>();

// =============================================================================
// GET /api/trips - List trips accessible to the user
// =============================================================================
trips.get("/", requireAuth, async (c) => {
  const user = c.var.user!;
  const db = getDbClient();

  interface DbTripWithRole extends DbTrip {
    role?: "admin" | "editor" | "viewer";
  }

  let tripList: DbTripWithRole[];

  if (user.isAdmin) {
    // Admins see all trips
    tripList = await db<DbTripWithRole[]>`
      SELECT id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
      FROM trips
      ORDER BY created_at DESC
    `;
  } else {
    // Non-admins only see trips they have access to
    tripList = await db<DbTripWithRole[]>`
      SELECT DISTINCT t.id, t.slug, t.title, t.description, t.cover_photo_url, t.is_public, t.created_at, t.updated_at, ta.role
      FROM trips t
      INNER JOIN trip_access ta ON ta.trip_id = t.id
      WHERE ta.user_id = ${user.id}
      ORDER BY t.created_at DESC
    `;
  }

  // Get photo metadata for all trips in one query
  const tripIds = tripList.map((t) => t.id);

  interface PhotoStatsWithTripId extends PhotoStats {
    trip_id: string;
  }

  const photoStats =
    tripIds.length > 0
      ? await db<PhotoStatsWithTripId[]>`
        SELECT
          trip_id,
          COUNT(*)::text as photo_count,
          MIN(taken_at) as min_taken_at,
          MAX(taken_at) as max_taken_at
        FROM photos
        WHERE trip_id = ANY(${tripIds})
        GROUP BY trip_id
      `
      : [];

  // Create a map for quick lookup
  const statsMap = new Map(photoStats.map((s) => [s.trip_id, s]));

  // Combine trips with their photo metadata
  const tripsWithMetadata = tripList.map((trip) => {
    const stats = statsMap.get(trip.id);
    const { photoCount, dateRange } = getMetadataFromStats(
      stats,
      trip.created_at,
    );
    // For admins, userRole is "admin"; for non-admins, use the role from trip_access
    const userRole = user.isAdmin ? "admin" : trip.role;
    return toTripResponse(trip, photoCount, dateRange, userRole);
  });

  return c.json({
    trips: tripsWithMetadata,
  });
});

// =============================================================================
// GET /api/trips/admin - List all trips (admin only)
// =============================================================================
/**
 * Admin endpoint to list all trips regardless of public/private status.
 * Unlike the public endpoint, this returns ALL trips with photo metadata.
 */
trips.get("/admin", requireAdmin, async (c) => {
  const db = getDbClient();

  const tripList = await db<DbTrip[]>`
    SELECT id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
    FROM trips
    ORDER BY created_at DESC
  `;

  // Get photo metadata for all trips in one query
  const tripIds = tripList.map((t) => t.id);

  interface PhotoStatsWithTripId extends PhotoStats {
    trip_id: string;
  }

  const photoStats =
    tripIds.length > 0
      ? await db<PhotoStatsWithTripId[]>`
        SELECT
          trip_id,
          COUNT(*)::text as photo_count,
          MIN(taken_at) as min_taken_at,
          MAX(taken_at) as max_taken_at
        FROM photos
        WHERE trip_id = ANY(${tripIds})
        GROUP BY trip_id
      `
      : [];

  // Create a map for quick lookup
  const statsMap = new Map(photoStats.map((s) => [s.trip_id, s]));

  // Combine trips with their photo metadata
  const tripsWithMetadata = tripList.map((trip) => {
    const stats = statsMap.get(trip.id);
    const { photoCount, dateRange } = getMetadataFromStats(
      stats,
      trip.created_at,
    );
    return toTripResponse(trip, photoCount, dateRange);
  });

  return c.json({
    trips: tripsWithMetadata,
  });
});

// =============================================================================
// GET /api/trips/slug/:slug - Get trip by slug
// =============================================================================
/**
 * Get trip by slug. Requires authentication and trip access.
 * Non-admin users must have a trip_access entry. Admins bypass access checks.
 */
trips.get("/slug/:slug", requireAuth, async (c) => {
  const slug = c.req.param("slug");
  const user = c.var.user!;
  const db = getDbClient();

  // Find trip by slug
  const tripResults = await db<DbTrip[]>`
    SELECT id, slug, title, description, cover_photo_url, is_public,
           access_token_hash, created_at, updated_at
    FROM trips
    WHERE slug = ${slug}
  `;

  if (tripResults.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  const trip = tripResults[0];

  // Check access for non-admin users
  if (!user.isAdmin) {
    const accessCheck = await db<{ role: string }[]>`
      SELECT role FROM trip_access
      WHERE user_id = ${user.id} AND trip_id = ${trip.id}
    `;

    if (accessCheck.length === 0) {
      return c.json(
        { error: "Forbidden", message: "Access denied to this trip" },
        403,
      );
    }
  }

  // Build response with photos and metadata
  const response = await buildTripWithPhotosResponse(trip, db);
  return c.json(response);
});

// =============================================================================
// GET /api/trips/id/:id - Get trip by UUID (admin only)
// =============================================================================
/**
 * Get trip by UUID. Admin-only endpoint for internal operations.
 */
trips.get("/id/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const db = getDbClient();

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  // Find trip by UUID
  const tripResults = await db<DbTrip[]>`
    SELECT id, slug, title, description, cover_photo_url, is_public,
           access_token_hash, created_at, updated_at
    FROM trips
    WHERE id = ${id}
  `;

  if (tripResults.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  const trip = tripResults[0];

  // Build response with photos and metadata
  const response = await buildTripWithPhotosResponse(trip, db);
  return c.json(response);
});

// =============================================================================
// POST /api/trips - Create trip (admin only)
// =============================================================================
trips.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<{
    slug: string;
    title: string;
    description?: string;
    coverPhotoUrl?: string;
    isPublic?: boolean;
  }>();

  const { slug, title, description, coverPhotoUrl, isPublic = true } = body;

  // Validate required fields
  if (!slug || !isValidSlug(slug)) {
    return c.json(
      {
        error: "Bad Request",
        message:
          "Invalid slug format. Use lowercase letters, numbers, and hyphens only.",
      },
      400,
    );
  }

  // Prevent UUID-like slugs
  if (looksLikeUuid(slug)) {
    return c.json(
      {
        error: "Bad Request",
        message:
          "Slug cannot be in UUID format. Please choose a different slug.",
      },
      400,
    );
  }

  if (!title || !isValidTitle(title)) {
    return c.json(
      {
        error: "Bad Request",
        message: `Title is required and must be ${MAX_TITLE_LENGTH} characters or less.`,
      },
      400,
    );
  }

  if (!isValidDescription(description)) {
    return c.json(
      {
        error: "Bad Request",
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`,
      },
      400,
    );
  }

  if (!isValidUrl(coverPhotoUrl)) {
    return c.json(
      { error: "Bad Request", message: "Invalid cover photo URL." },
      400,
    );
  }

  const db = getDbClient();

  try {
    const [trip] = await db<DbTrip[]>`
      INSERT INTO trips (slug, title, description, cover_photo_url, is_public)
      VALUES (${slug}, ${title.trim()}, ${description?.trim() || null}, ${coverPhotoUrl || null}, ${isPublic})
      RETURNING id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
    `;

    // New trip has no photos yet
    const photoCount = 0;
    const dateRange = {
      start: trip.created_at.toISOString(),
      end: trip.created_at.toISOString(),
    };

    return c.json(toTripResponse(trip, photoCount, dateRange), 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        { error: "Conflict", message: "A trip with this slug already exists." },
        409,
      );
    }
    throw error;
  }
});

// =============================================================================
// PATCH /api/trips/:id - Update trip (admin only)
// =============================================================================
trips.patch("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    slug?: string;
    title?: string;
    description?: string | null;
    coverPhotoUrl?: string | null;
    isPublic?: boolean;
  }>();

  const { slug, title, description, coverPhotoUrl, isPublic } = body;

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  // Validate optional fields if provided
  if (slug !== undefined && !isValidSlug(slug)) {
    return c.json(
      {
        error: "Bad Request",
        message:
          "Invalid slug format. Use lowercase letters, numbers, and hyphens only.",
      },
      400,
    );
  }

  // Prevent UUID-like slugs
  if (slug !== undefined && looksLikeUuid(slug)) {
    return c.json(
      {
        error: "Bad Request",
        message:
          "Slug cannot be in UUID format. Please choose a different slug.",
      },
      400,
    );
  }

  if (title !== undefined && !isValidTitle(title)) {
    return c.json(
      {
        error: "Bad Request",
        message: `Title must be non-empty and ${MAX_TITLE_LENGTH} characters or less.`,
      },
      400,
    );
  }

  if (description !== undefined && !isValidDescription(description)) {
    return c.json(
      {
        error: "Bad Request",
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`,
      },
      400,
    );
  }

  if (coverPhotoUrl !== undefined && !isValidUrl(coverPhotoUrl)) {
    return c.json(
      { error: "Bad Request", message: "Invalid cover photo URL." },
      400,
    );
  }

  const db = getDbClient();

  // Check if trip exists
  const existing = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${id}
  `;

  if (existing.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  // Build dynamic update - only update provided fields
  const updates: Record<string, unknown> = {};
  if (slug !== undefined) updates.slug = slug;
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined)
    updates.description = description?.trim() || null;
  if (coverPhotoUrl !== undefined)
    updates.cover_photo_url = coverPhotoUrl || null;
  if (isPublic !== undefined) updates.is_public = isPublic;

  if (Object.keys(updates).length === 0) {
    return c.json(
      { error: "Bad Request", message: "No fields to update." },
      400,
    );
  }

  try {
    const [trip] = await db<DbTrip[]>`
      UPDATE trips
      SET ${db(updates)}
      WHERE id = ${id}
      RETURNING id, slug, title, description, cover_photo_url, is_public, created_at, updated_at
    `;

    // Fetch photo metadata for this trip
    const [stats] = await db<PhotoStats[]>`
      SELECT
        COUNT(*)::text as photo_count,
        MIN(taken_at) as min_taken_at,
        MAX(taken_at) as max_taken_at
      FROM photos
      WHERE trip_id = ${id}
    `;

    const { photoCount, dateRange } = getMetadataFromStats(
      stats,
      trip.created_at,
    );
    return c.json(toTripResponse(trip, photoCount, dateRange));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        { error: "Conflict", message: "A trip with this slug already exists." },
        409,
      );
    }
    throw error;
  }
});

// =============================================================================
// DELETE /api/trips/:id - Delete trip (admin only)
// =============================================================================
trips.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  const db = getDbClient();

  // Get all photo URLs before deletion (needed for R2 cleanup)
  const photos = await db<{ url: string; thumbnail_url: string }[]>`
    SELECT url, thumbnail_url FROM photos WHERE trip_id = ${id}
  `;

  const result = await db`
    DELETE FROM trips
    WHERE id = ${id}
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  // Clean up photo files from R2 or local filesystem
  try {
    if (isR2Available()) {
      // Extract R2 keys from URLs and batch delete
      const keys = new Set<string>();
      for (const photo of photos) {
        keys.add(photo.url.replace(PHOTOS_URL_PREFIX, ""));
        keys.add(photo.thumbnail_url.replace(PHOTOS_URL_PREFIX, ""));
      }
      await deleteMultipleFromR2(Array.from(keys));
    } else {
      // Fallback: delete local directory
      const photosDir = getPhotosDir();
      const tripDir = `${photosDir}/${id}`;
      await rm(tripDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Log but don't fail the request - DB transaction already committed
    console.error(`Failed to delete photos for trip ${id}:`, error);
  }

  // 204 No Content
  return c.body(null, 204);
});

// =============================================================================
// PATCH /api/trips/:id/protection - Update protection settings (admin only)
// =============================================================================
trips.patch("/:id/protection", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    isPublic: boolean;
    token?: string;
  }>();

  const { isPublic, token } = body;

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  // Validate isPublic is a boolean
  if (typeof isPublic !== "boolean") {
    return c.json(
      { error: "Bad Request", message: "isPublic must be a boolean." },
      400,
    );
  }

  // If making private, token is recommended (but not required - can set later)
  // If token provided, it should be at least 8 characters for security
  if (token !== undefined && token.length < 8) {
    return c.json(
      {
        error: "Bad Request",
        message: "Token must be at least 8 characters long.",
      },
      400,
    );
  }

  const db = getDbClient();

  // Check if trip exists
  const existing = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${id}
  `;

  if (existing.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  // Hash token if provided and making private
  const accessTokenHash =
    !isPublic && token
      ? await Bun.password.hash(token, { algorithm: "bcrypt", cost: 14 })
      : null;

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
  `;

  return c.json({ success: true });
});

// =============================================================================
// POST /api/trips/:id/photos - Add photos to trip (admin only)
// =============================================================================
trips.post("/:id/photos", requireAdmin, async (c) => {
  const tripId = c.req.param("id");
  const body = await c.req.json<{
    photos: Array<{
      cloudinaryPublicId: string;
      url: string;
      thumbnailUrl: string;
      latitude: number | null;
      longitude: number | null;
      takenAt: string;
      caption: string | null;
    }>;
  }>();

  const { photos } = body;

  // Validate UUID format
  if (!UUID_REGEX.test(tripId)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format." },
      400,
    );
  }

  // Validate photos array
  if (!Array.isArray(photos) || photos.length === 0) {
    return c.json(
      {
        error: "Bad Request",
        message: "Photos array is required and must not be empty.",
      },
      400,
    );
  }

  // Validate individual photo objects
  for (const photo of photos) {
    if (
      !photo.cloudinaryPublicId ||
      !photo.url ||
      !photo.thumbnailUrl ||
      !photo.takenAt
    ) {
      return c.json(
        {
          error: "Bad Request",
          message:
            "Each photo must include cloudinaryPublicId, url, thumbnailUrl, and takenAt.",
        },
        400,
      );
    }

    // Validate date format
    if (isNaN(Date.parse(photo.takenAt))) {
      return c.json(
        {
          error: "Bad Request",
          message: `Invalid date format for takenAt: ${photo.takenAt}`,
        },
        400,
      );
    }

    // Validate URLs
    if (!isValidUrl(photo.url) || !isValidUrl(photo.thumbnailUrl)) {
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid URL format for photo url or thumbnailUrl.",
        },
        400,
      );
    }
  }

  const db = getDbClient();

  // Check if trip exists
  const existing = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `;

  if (existing.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
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
      })),
    )}
    RETURNING *
  `;

  return c.json({ photos: insertedPhotos.map(toPhotoResponse) }, 201);
});

// =============================================================================
// DELETE /api/trips/photos/:id - Delete individual photo (admin only)
// =============================================================================
trips.delete("/photos/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid photo ID format." },
      400,
    );
  }

  const db = getDbClient();

  // Fetch photo to get trip_id, url, and thumbnail_url for disk cleanup
  const photoResults = await db<DbPhoto[]>`
    SELECT id, trip_id, url, thumbnail_url
    FROM photos
    WHERE id = ${id}
  `;

  if (photoResults.length === 0) {
    return c.json({ error: "Not Found", message: "Photo not found" }, 404);
  }

  const photo = photoResults[0];

  // Delete photo from database
  await db`
    DELETE FROM photos
    WHERE id = ${id}
  `;

  // Clean up photo files from R2 or local filesystem
  // URL format: /api/photos/{tripId}/{filename}
  try {
    // Extract keys from URLs
    const photoKey = photo.url.replace(PHOTOS_URL_PREFIX, "");
    const thumbnailKey = photo.thumbnail_url.replace(PHOTOS_URL_PREFIX, "");

    if (isR2Available()) {
      // Batch delete from R2
      const keysToDelete = [photoKey];
      if (thumbnailKey !== photoKey) {
        keysToDelete.push(thumbnailKey);
      }
      await deleteMultipleFromR2(keysToDelete);
    } else {
      // Fallback: local filesystem
      const photosDir = getPhotosDir();

      // Delete main photo
      const photoPath = `${photosDir}/${photoKey}`;
      await rm(photoPath, { force: true });

      // Delete thumbnail if different
      if (thumbnailKey !== photoKey) {
        const thumbnailFilePath = `${photosDir}/${thumbnailKey}`;
        await rm(thumbnailFilePath, { force: true });
      }
    }
  } catch (error) {
    // Log any error during file cleanup but don't fail the request.
    // The database is the source of truth, and the photo record is already deleted.
    console.error(
      `Failed to clean up files for photo ${id} (url: ${photo.url}, thumbnail: ${photo.thumbnail_url}):`,
      error,
    );
  }

  // 204 No Content
  return c.body(null, 204);
});

export { trips };
