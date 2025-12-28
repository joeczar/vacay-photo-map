// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, mock } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { trips } from "./trips";
import type { AuthEnv } from "../types/auth";
import { getPhotosDir } from "./upload";
import { getDbClient } from "../db/client";
import { getAdminAuthHeader, getUserAuthHeader } from "../test-helpers";

// Mock R2 to ensure tests use local filesystem fallback
mock.module("../utils/r2", () => ({
  uploadToR2: async () => false,
  getFromR2: async () => null,
  isR2Available: () => false,
  deleteMultipleFromR2: async () => 0,
  PHOTOS_URL_PREFIX: "/api/photos/",
}));

// Response types
interface ErrorResponse {
  error: string;
  message: string;
}

interface TripResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverPhotoUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  dateRange: {
    start: string;
    end: string;
  };
}

interface TripListResponse {
  trips: TripResponse[];
}

interface TripWithPhotosResponse extends TripResponse {
  photos: Array<{
    id: string;
    cloudinaryPublicId: string;
    url: string;
    thumbnailUrl: string;
    latitude: number | null;
    longitude: number | null;
    takenAt: string;
    caption: string | null;
    album: string | null;
    createdAt: string;
  }>;
}

// interface SuccessResponse {
//   success: boolean
// }

// Create test app
function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api/trips", trips);
  return app;
}

describe("Trip Routes", () => {
  // ==========================================================================
  // GET /api/trips - List trips (requires auth, filtered by access)
  // ==========================================================================
  describe("GET /api/trips", () => {
    it("returns trips for authenticated admin user", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "GET",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as TripListResponse;
      expect(Array.isArray(data.trips)).toBe(true);
    });

    it("returns only accessible trips for non-admin user", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Create a unique non-admin user for this test
      const now = Date.now();
      const testUserId = `00000000-0000-4000-a000-${String(now).padStart(12, "0").slice(-12)}`;
      const testEmail = `test-trips-nonadmin-${now}@example.com`;
      const testWebauthnUserId = `test-webauthn-trips-${now}`;

      await db`
        INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin)
        VALUES (${testUserId}, ${testEmail}, ${testWebauthnUserId}, false)
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              is_admin = EXCLUDED.is_admin,
              webauthn_user_id = EXCLUDED.webauthn_user_id
      `;

      // Create two trips
      const trip1Slug = `accessible-trip-${now}`;
      const trip2Slug = `inaccessible-trip-${now}`;

      const [trip1] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${trip1Slug}, 'Accessible Trip', true)
        RETURNING id
      `;

      const [trip2] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${trip2Slug}, 'Inaccessible Trip', true)
        RETURNING id
      `;

      // Grant access to trip1 only
      await db`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${trip1.id}, 'viewer', ${testUserId})
      `;

      // Request trips as non-admin user
      const authHeader = await getUserAuthHeader(testUserId, testEmail);
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripListResponse;

      // Should only see trip1
      const accessibleTrip = data.trips.find((t) => t.id === trip1.id);
      const inaccessibleTrip = data.trips.find((t) => t.id === trip2.id);

      expect(accessibleTrip).toBeDefined();
      expect(inaccessibleTrip).toBeUndefined();

      // Cleanup
      await db`DELETE FROM trips WHERE id IN (${trip1.id}, ${trip2.id})`;
      await db`DELETE FROM user_profiles WHERE id = ${testUserId}`;
    });
  });

  // ==========================================================================
  // GET /api/trips/:slug - Get trip by slug (requires auth and access)
  // ==========================================================================
  describe("GET /api/trips/:slug", () => {
    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips/slug/non-existent-trip-slug", {
          method: "GET",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });

    it("returns 403 for non-admin user without trip access", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Create a unique non-admin user
      const now = Date.now();
      const testUserId = `00000000-0000-4000-a000-${String(now).padStart(12, "0").slice(-12)}`;
      const testEmail = `test-trips-noaccess-${now}@example.com`;
      const testWebauthnUserId = `test-webauthn-noaccess-${now}`;

      await db`
        INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin)
        VALUES (${testUserId}, ${testEmail}, ${testWebauthnUserId}, false)
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              is_admin = EXCLUDED.is_admin,
              webauthn_user_id = EXCLUDED.webauthn_user_id
      `;

      // Create a trip without granting access
      const tripSlug = `forbidden-trip-${now}`;
      const [trip] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${tripSlug}, 'Forbidden Trip', true)
        RETURNING id
      `;

      // Request trip as non-admin user without access
      const authHeader = await getUserAuthHeader(testUserId, testEmail);
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${tripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Access denied");

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
      await db`DELETE FROM user_profiles WHERE id = ${testUserId}`;
    });

    it("returns trip for non-admin user with viewer access", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Create a unique non-admin user
      const now = Date.now();
      const testUserId = `00000000-0000-4000-a000-${String(now).padStart(12, "0").slice(-12)}`;
      const testEmail = `test-trips-viewer-${now}@example.com`;
      const testWebauthnUserId = `test-webauthn-viewer-${now}`;

      await db`
        INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin)
        VALUES (${testUserId}, ${testEmail}, ${testWebauthnUserId}, false)
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              is_admin = EXCLUDED.is_admin,
              webauthn_user_id = EXCLUDED.webauthn_user_id
      `;

      // Create a trip and grant viewer access
      const tripSlug = `viewer-trip-${now}`;
      const [trip] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${tripSlug}, 'Viewer Trip', true)
        RETURNING id
      `;

      await db`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${trip.id}, 'viewer', ${testUserId})
      `;

      // Request trip as non-admin user with viewer access
      const authHeader = await getUserAuthHeader(testUserId, testEmail);
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${tripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(trip.id);
      expect(data.slug).toBe(tripSlug);

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
      await db`DELETE FROM user_profiles WHERE id = ${testUserId}`;
    });

    it("returns trip for admin user regardless of access", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Create a trip without granting access to admin
      const now = Date.now();
      const tripSlug = `admin-trip-${now}`;
      const [trip] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${tripSlug}, 'Admin Trip', true)
        RETURNING id
      `;

      // Request trip as admin user (no explicit access needed)
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${tripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(trip.id);
      expect(data.slug).toBe(tripSlug);

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
    });
  });

  // ==========================================================================
  // POST /api/trips - Create trip
  // ==========================================================================
  describe("POST /api/trips", () => {
    it("returns 400 for invalid slug format", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            slug: "Invalid Slug With Spaces",
            title: "Test Trip",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Invalid slug format");
    });

    it("returns 400 for missing title", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            slug: "test-trip",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Title is required");
    });

    it("returns 400 for invalid URL", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            slug: "test-trip",
            title: "Test Trip",
            coverPhotoUrl: "not-a-valid-url",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Invalid cover photo URL");
    });

    it("returns 400 for UUID-like slug", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            slug: "550e8400-e29b-41d4-a716-446655440000",
            title: "Test Trip",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("UUID format");
    });
  });

  // ==========================================================================
  // PATCH /api/trips/:id - Update trip
  // ==========================================================================
  describe("PATCH /api/trips/:id", () => {
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";

    it("returns 400 for no fields to update", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({}),
        }),
      );
      // Will be 404 since trip doesn't exist, or 400 for no fields
      // In this case, it checks for trip existence first
      expect([400, 404]).toContain(res.status);
    });

    it("returns 400 for UUID-like slug in update", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Create a test trip
      const originalSlug = "test-patch-uuid-slug-" + Date.now();
      const [trip] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${originalSlug}, 'Test Trip', true)
        RETURNING id
      `;

      // Try to update slug to UUID-like value
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            slug: "550e8400-e29b-41d4-a716-446655440000",
          }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("UUID format");

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
    });
  });

  // ==========================================================================
  // DELETE /api/trips/:id - Delete trip
  // ==========================================================================
  describe("DELETE /api/trips/:id", () => {
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";

    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /api/trips/admin - List all trips (admin only)
  // ==========================================================================
  describe("GET /api/trips/admin", () => {
    it("returns all trips (draft + public) for admin user", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Create test trips with unique slugs
      const draftSlug = "draft-trip-" + crypto.randomUUID();
      const publicSlug = "public-trip-" + crypto.randomUUID();

      const [draftTrip] = await db`
        INSERT INTO trips (title, slug, is_public)
        VALUES ('Draft Trip', ${draftSlug}, false)
        RETURNING id
      `;

      const [publicTrip] = await db`
        INSERT INTO trips (title, slug, is_public)
        VALUES ('Public Trip', ${publicSlug}, true)
        RETURNING id
      `;

      const res = await app.fetch(
        new Request("http://localhost/api/trips/admin", {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripListResponse;
      expect(Array.isArray(data.trips)).toBe(true);

      // Verify both draft and public trips are returned
      const draftFound = data.trips.find((t) => t.id === draftTrip.id);
      const publicFound = data.trips.find((t) => t.id === publicTrip.id);

      expect(draftFound).toBeDefined();
      expect(draftFound?.isPublic).toBe(false);
      expect(publicFound).toBeDefined();
      expect(publicFound?.isPublic).toBe(true);

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${draftTrip.id}`;
      await db`DELETE FROM trips WHERE id = ${publicTrip.id}`;
    });

    it("returns 403 for non-admin user", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/trips/admin", {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
    });

    it("returns trips ordered by created_at DESC", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Create trips with deliberate timing
      const olderSlug = "older-trip-" + crypto.randomUUID();
      const newerSlug = "newer-trip-" + crypto.randomUUID();

      const [olderTrip] = await db`
        INSERT INTO trips (title, slug, is_public, created_at)
        VALUES ('Older Trip', ${olderSlug}, true, NOW() - INTERVAL '1 hour')
        RETURNING id, created_at
      `;

      const [newerTrip] = await db`
        INSERT INTO trips (title, slug, is_public, created_at)
        VALUES ('Newer Trip', ${newerSlug}, true, NOW())
        RETURNING id, created_at
      `;

      const res = await app.fetch(
        new Request("http://localhost/api/trips/admin", {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripListResponse;

      // Find positions of our test trips
      const newerIndex = data.trips.findIndex((t) => t.id === newerTrip.id);
      const olderIndex = data.trips.findIndex((t) => t.id === olderTrip.id);

      // Newer trip should appear before older trip (DESC order)
      expect(newerIndex).toBeGreaterThanOrEqual(0);
      expect(olderIndex).toBeGreaterThanOrEqual(0);
      expect(newerIndex).toBeLessThan(olderIndex);

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${olderTrip.id}`;
      await db`DELETE FROM trips WHERE id = ${newerTrip.id}`;
    });
  });

  // ==========================================================================
  // GET /api/trips/:id - Get trip by ID (UUID)
  // ==========================================================================
  describe("GET /api/trips/:id (UUID)", () => {
    it("returns trip with photos for valid UUID (admin)", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Create test trip
      const slug = "test-trip-by-id-" + crypto.randomUUID();
      const [trip] = await db`
        INSERT INTO trips (title, slug, is_public, description)
        VALUES ('Test Trip By ID', ${slug}, true, 'Test description')
        RETURNING id, title, slug, description
      `;

      // Create test photo
      const [photo] = await db`
        INSERT INTO photos (
          trip_id, cloudinary_public_id, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, 'test-public-id', 'https://example.com/photo.jpg',
          'https://example.com/photo-thumb.jpg', 40.7128, -74.0060,
          NOW()
        )
        RETURNING id, url, thumbnail_url, latitude, longitude
      `;

      // Fetch trip by UUID
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/id/${trip.id}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;

      expect(data.id).toBe(trip.id);
      expect(data.title).toBe("Test Trip By ID");
      expect(data.slug).toBe(slug);
      expect(data.description).toBe("Test description");
      expect(Array.isArray(data.photos)).toBe(true);
      expect(data.photos.length).toBe(1);
      expect(data.photos[0].id).toBe(photo.id);
      expect(data.photos[0].latitude).toBe(40.7128);

      // Cleanup
      await db`DELETE FROM photos WHERE id = ${photo.id}`;
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
    });

    it("returns 403 for non-admin user accessing by UUID", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Create a unique non-admin user
      const now = Date.now();
      const testUserId = `00000000-0000-4000-a000-${String(now).padStart(12, "0").slice(-12)}`;
      const testEmail = `test-uuid-access-${now}@example.com`;
      const testWebauthnUserId = `test-webauthn-uuid-${now}`;

      await db`
        INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin)
        VALUES (${testUserId}, ${testEmail}, ${testWebauthnUserId}, false)
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              is_admin = EXCLUDED.is_admin,
              webauthn_user_id = EXCLUDED.webauthn_user_id
      `;

      // Create a trip and grant viewer access
      const tripSlug = `uuid-trip-${now}`;
      const [trip] = await db<{ id: string }[]>`
        INSERT INTO trips (slug, title, is_public)
        VALUES (${tripSlug}, 'UUID Trip', true)
        RETURNING id
      `;

      await db`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${trip.id}, 'viewer', ${testUserId})
      `;

      // Try to access trip by UUID (should fail for non-admin even with access)
      const authHeader = await getUserAuthHeader(testUserId, testEmail);
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/id/${trip.id}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Admin access required");

      // Cleanup
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
      await db`DELETE FROM user_profiles WHERE id = ${testUserId}`;
    });

    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/id/${validUuid}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });
  });

  // ==========================================================================
  // DELETE /api/trips/photos/:id - Delete individual photo
  // ==========================================================================
  describe("DELETE /api/trips/photos/:id", () => {
    it("deletes photo and returns 204 (admin)", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Create test trip
      const slug = "test-trip-delete-photo-" + crypto.randomUUID();
      const [trip] = await db`
        INSERT INTO trips (title, slug, is_public)
        VALUES ('Test Trip for Photo Delete', ${slug}, true)
        RETURNING id
      `;

      // Create dummy photo and thumbnail files to be deleted
      const photosDir = getPhotosDir();
      const tripDir = `${photosDir}/${trip.id}`;
      await mkdir(tripDir, { recursive: true });
      const photoFilename = "test-delete.jpg";
      const thumbnailFilename = "thumb-test-delete.jpg";
      const photoPath = `${tripDir}/${photoFilename}`;
      const thumbnailPath = `${tripDir}/${thumbnailFilename}`;

      await Bun.write(photoPath, "fake-photo-data");
      await Bun.write(thumbnailPath, "fake-thumbnail-data");
      expect(await Bun.file(photoPath).exists()).toBe(true);
      expect(await Bun.file(thumbnailPath).exists()).toBe(true);

      const photoUrl = `/api/photos/${trip.id}/${photoFilename}`;
      const thumbnailUrl = `/api/photos/${trip.id}/${thumbnailFilename}`;

      // Create test photo record
      const [photo] = await db`
        INSERT INTO photos (
          trip_id, cloudinary_public_id, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, 'test-delete-photo', ${photoUrl},
          ${thumbnailUrl}, 40.7128, -74.0060,
          NOW()
        )
        RETURNING id
      `;

      // Delete photo via API
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${photo.id}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(204);

      // Verify photo is deleted from database
      const [deletedPhoto] = await db`
        SELECT * FROM photos WHERE id = ${photo.id}
      `;
      expect(deletedPhoto).toBeUndefined();

      // Verify both photo and thumbnail files are deleted from disk
      expect(await Bun.file(photoPath).exists()).toBe(false);
      expect(await Bun.file(thumbnailPath).exists()).toBe(false);

      // Cleanup trip
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
    });

    it("returns 404 for non-existent photo", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });
  });

  // ==========================================================================
  // PATCH /api/trips/photos/:id - Update photo rotation
  // ==========================================================================
  describe("PATCH /api/trips/photos/:id - Update photo rotation", () => {
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";

    it("returns 401 without authentication", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotation: 90 }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 90 }),
        }),
      );
      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
    });

    it("returns 400 for invalid UUID format", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trips/photos/not-a-uuid", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 90 }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Invalid photo ID format");
    });

    it("returns 400 when request body is empty", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Rotation field is required.");
    });

    it("returns 400 for invalid rotation value: 45", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 45 }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Rotation must be one of: 0, 90, 180, 270.");
    });

    it("returns 400 for invalid rotation value: 360", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 360 }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Rotation must be one of: 0, 90, 180, 270.");
    });

    it("returns 400 for string rotation value", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: "90" }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Rotation must be one of: 0, 90, 180, 270.");
    });

    it("returns 400 for null rotation value", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: null }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Rotation must be one of: 0, 90, 180, 270.");
    });

    it("returns 404 for non-existent photo", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 90 }),
        }),
      );
      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });

    it("successfully updates photo rotation", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Create test trip
      const slug = "test-trip-rotation-" + crypto.randomUUID();
      const [trip] = await db`
        INSERT INTO trips (title, slug, is_public)
        VALUES ('Test Trip for Rotation', ${slug}, true)
        RETURNING id
      `;

      // Create test photo with default rotation (0)
      const [photo] = await db`
        INSERT INTO photos (
          trip_id, cloudinary_public_id, url, thumbnail_url,
          latitude, longitude, taken_at, rotation
        )
        VALUES (
          ${trip.id}, 'test-rotation-photo', 'https://example.com/photo.jpg',
          'https://example.com/photo-thumb.jpg', 40.7128, -74.0060,
          NOW(), 0
        )
        RETURNING id
      `;

      // Update rotation to 90
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${photo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 90 }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rotation).toBe(90);

      // Verify rotation was updated in database
      const [updatedPhoto] = await db`
        SELECT rotation FROM photos WHERE id = ${photo.id}
      `;
      expect(updatedPhoto.rotation).toBe(90);

      // Cleanup
      await db`DELETE FROM photos WHERE id = ${photo.id}`;
      await db`DELETE FROM trips WHERE id = ${trip.id}`;
    });
  });

  // ==========================================================================
  // DELETE /api/trips/:id - File cleanup integration tests
  // ==========================================================================
  describe("DELETE /api/trips/:id - file cleanup", () => {
    it("deletes photo directory when trip is deleted", async () => {
      // Create a trip first
      const db = getDbClient();
      const [trip] = await db`
        INSERT INTO trips (title, slug, is_public)
        VALUES ('Test Trip', ${"test-trip-cleanup-" + crypto.randomUUID()}, true)
        RETURNING id
      `;

      // Create photo directory and file
      const photosDir = getPhotosDir();
      const tripDir = `${photosDir}/${trip.id}`;
      await mkdir(tripDir, { recursive: true });
      await Bun.write(`${tripDir}/test.jpg`, "fake-photo-data");

      // Verify file exists
      expect(await Bun.file(`${tripDir}/test.jpg`).exists()).toBe(true);

      // Delete trip
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(204);

      // Verify directory is gone
      const dirExists = await Bun.file(tripDir).exists();
      expect(dirExists).toBe(false);
    });

    it("succeeds even if photo directory does not exist", async () => {
      // Create a trip without photos
      const db = getDbClient();
      const [trip] = await db`
        INSERT INTO trips (title, slug, is_public)
        VALUES ('No Photos Trip', ${"no-photos-" + crypto.randomUUID()}, true)
        RETURNING id
      `;

      // Don't create any photo directory

      // Delete trip should still succeed
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(204);
    });
  });
});
