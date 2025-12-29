// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, mock, afterEach } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { trips } from "./trips";
import type { AuthEnv } from "../types/auth";
import { getPhotosDir } from "./upload";
import { getDbClient } from "../db/client";
import { getAdminAuthHeader, getUserAuthHeader } from "../test-helpers";
import {
  createUser,
  createTrip,
  createPhoto,
  cleanupUser,
  cleanupTrip,
} from "../test-factories";
import type {
  ErrorResponse,
  TripListResponse,
  TripWithPhotosResponse,
} from "../test-types";

// Mock R2 to ensure tests use local filesystem fallback
mock.module("../utils/r2", () => ({
  uploadToR2: async () => false,
  getFromR2: async () => null,
  isR2Available: () => false,
  deleteMultipleFromR2: async () => 0,
  PHOTOS_URL_PREFIX: "/api/photos/",
}));

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
    const createdTripIds: string[] = [];
    const createdUserIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      for (const id of createdUserIds) await cleanupUser(id);
      createdTripIds.length = 0;
      createdUserIds.length = 0;
    });

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

      const user = await createUser({ isAdmin: false });
      createdUserIds.push(user.id);

      const trip1 = await createTrip({ title: "Accessible Trip" });
      const trip2 = await createTrip({ title: "Inaccessible Trip" });
      createdTripIds.push(trip1.id, trip2.id);

      // Grant access to trip1 only
      await db`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${user.id}, ${trip1.id}, 'viewer', ${user.id})
      `;

      const authHeader = await getUserAuthHeader(user.id, user.email);
      const res = await app.fetch(
        new Request("http://localhost/api/trips", {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripListResponse;

      const accessibleTrip = data.trips.find((t) => t.id === trip1.id);
      const inaccessibleTrip = data.trips.find((t) => t.id === trip2.id);

      expect(accessibleTrip).toBeDefined();
      expect(inaccessibleTrip).toBeUndefined();
    });
  });

  // ==========================================================================
  // GET /api/trips/:slug - Get trip by slug (requires auth and access)
  // ==========================================================================
  describe("GET /api/trips/:slug", () => {
    const createdTripIds: string[] = [];
    const createdUserIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      for (const id of createdUserIds) await cleanupUser(id);
      createdTripIds.length = 0;
      createdUserIds.length = 0;
    });

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
      const app = createTestApp();

      const user = await createUser({ isAdmin: false });
      createdUserIds.push(user.id);

      const trip = await createTrip({ title: "Forbidden Trip" });
      createdTripIds.push(trip.id);

      const authHeader = await getUserAuthHeader(user.id, user.email);
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${trip.slug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Access denied");
    });

    it("returns trip for non-admin user with viewer access", async () => {
      const db = getDbClient();
      const app = createTestApp();

      const user = await createUser({ isAdmin: false });
      createdUserIds.push(user.id);

      const trip = await createTrip({ title: "Viewer Trip" });
      createdTripIds.push(trip.id);

      await db`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${user.id}, ${trip.id}, 'viewer', ${user.id})
      `;

      const authHeader = await getUserAuthHeader(user.id, user.email);
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${trip.slug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(trip.id);
      expect(data.slug).toBe(trip.slug);
    });

    it("returns trip for admin user regardless of access", async () => {
      const app = createTestApp();

      const trip = await createTrip({ title: "Admin Trip" });
      createdTripIds.push(trip.id);

      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${trip.slug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(trip.id);
      expect(data.slug).toBe(trip.slug);
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
  });

  // ==========================================================================
  // PATCH /api/trips/:id - Update trip
  // ==========================================================================
  describe("PATCH /api/trips/:id", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ title: "New Title" }),
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 for UUID-like slug in update", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const trip = await createTrip({ title: "Test Trip" });
      createdTripIds.push(trip.id);

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
    });
  });

  // ==========================================================================
  // DELETE /api/trips/:id - Delete trip (includes cascading delete + file cleanup)
  // ==========================================================================
  describe("DELETE /api/trips/:id", () => {
    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${validUuid}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(404);
    });

    it("deletes photo directory when trip is deleted", async () => {
      const trip = await createTrip({ title: "Test Trip" });

      // Create photo directory and file
      const photosDir = getPhotosDir();
      const tripDir = `${photosDir}/${trip.id}`;
      await mkdir(tripDir, { recursive: true });
      await Bun.write(`${tripDir}/test.jpg`, "fake-photo-data");

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
      expect(await Bun.file(tripDir).exists()).toBe(false);
    });
  });

  // ==========================================================================
  // DELETE /api/trips/photos/:id - Delete individual photo
  // ==========================================================================
  describe("DELETE /api/trips/photos/:id", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("deletes photo and returns 204 (admin)", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const trip = await createTrip({ title: "Test Trip for Photo Delete" });
      createdTripIds.push(trip.id);

      // Create dummy photo and thumbnail files to be deleted
      const photosDir = getPhotosDir();
      const tripDir = `${photosDir}/${trip.id}`;
      await mkdir(tripDir, { recursive: true });
      const photoPath = `${tripDir}/test-delete.jpg`;
      const thumbnailPath = `${tripDir}/thumb-test-delete.jpg`;

      await Bun.write(photoPath, "fake-photo-data");
      await Bun.write(thumbnailPath, "fake-thumbnail-data");

      const photoUrl = `/api/photos/${trip.id}/test-delete.jpg`;
      const thumbnailUrl = `/api/photos/${trip.id}/thumb-test-delete.jpg`;

      const [photo] = await db`
        INSERT INTO photos (
          trip_id, storage_key, url, thumbnail_url,
          latitude, longitude, taken_at
        )
        VALUES (
          ${trip.id}, 'test-delete-photo', ${photoUrl},
          ${thumbnailUrl}, 40.7128, -74.0060, NOW()
        )
        RETURNING id
      `;

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${photo.id}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(204);

      // Verify photo and files are deleted
      const [deletedPhoto] =
        await db`SELECT * FROM photos WHERE id = ${photo.id}`;
      expect(deletedPhoto).toBeUndefined();
      expect(await Bun.file(photoPath).exists()).toBe(false);
      expect(await Bun.file(thumbnailPath).exists()).toBe(false);
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
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("returns 400 for invalid rotation value", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
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

    it("successfully updates photo rotation", async () => {
      const db = getDbClient();
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const trip = await createTrip({ title: "Test Trip for Rotation" });
      createdTripIds.push(trip.id);

      const [photo] = await db`
        INSERT INTO photos (
          trip_id, storage_key, url, thumbnail_url,
          latitude, longitude, taken_at, rotation
        )
        VALUES (
          ${trip.id}, 'test-rotation-photo', 'https://example.com/photo.jpg',
          'https://example.com/photo-thumb.jpg', 40.7128, -74.0060, NOW(), 0
        )
        RETURNING id
      `;

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/photos/${photo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ rotation: 90 }),
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { rotation: number };
      expect(data.rotation).toBe(90);

      const [updatedPhoto] =
        await db`SELECT rotation FROM photos WHERE id = ${photo.id}`;
      expect(updatedPhoto.rotation).toBe(90);
    });
  });

  // ==========================================================================
  // GET /api/trips/slug/:slug - Pagination tests
  // ==========================================================================
  describe("GET /api/trips/slug/:slug - pagination", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("returns pagination metadata with defaults (limit=50, offset=0)", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const trip = await createTrip({ title: "Pagination Test" });
      createdTripIds.push(trip.id);

      // Create 5 photos
      for (let i = 0; i < 5; i++) {
        await createPhoto({
          tripId: trip.id,
          latitude: 40.7128,
          longitude: -74.006,
        });
      }

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${trip.slug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.photos.length).toBe(5);
      expect(data.pagination).toEqual({
        total: 5,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
    });

    it("paginates correctly with hasMore calculation", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const trip = await createTrip({ title: "Pagination Test" });
      createdTripIds.push(trip.id);

      for (let i = 0; i < 5; i++) {
        await createPhoto({
          tripId: trip.id,
          latitude: 40.7128,
          longitude: -74.006,
        });
      }

      // First page: hasMore = true
      const res1 = await app.fetch(
        new Request(
          `http://localhost/api/trips/slug/${trip.slug}?limit=2&offset=0`,
          { method: "GET", headers: authHeader },
        ),
      );
      const data1 = (await res1.json()) as TripWithPhotosResponse;
      expect(data1.photos.length).toBe(2);
      expect(data1.pagination.hasMore).toBe(true);

      // Last page: hasMore = false
      const res2 = await app.fetch(
        new Request(
          `http://localhost/api/trips/slug/${trip.slug}?limit=2&offset=4`,
          { method: "GET", headers: authHeader },
        ),
      );
      const data2 = (await res2.json()) as TripWithPhotosResponse;
      expect(data2.photos.length).toBe(1);
      expect(data2.pagination.hasMore).toBe(false);
    });

    it("returns 400 for invalid pagination params", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/trips/slug/any-trip?limit=invalid", {
          method: "GET",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { message: string };
      expect(data.message).toContain("positive integer");
    });
  });
});
