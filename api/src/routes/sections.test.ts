// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, mock, afterEach } from "bun:test";
import { Hono } from "hono";
import { sections } from "./sections";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import { getAdminAuthHeader, getUserAuthHeader } from "../test-helpers";
import { createTrip, createPhoto, cleanupTrip } from "../test-factories";
import type { ErrorResponse, SectionResponse } from "../test-types";

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
  app.route("/api", sections); // Mount at /api (same as main app)
  return app;
}

// Helper for creating sections via API
async function createSection(
  app: Hono<AuthEnv>,
  tripId: string,
  title: string,
  orderIndex: number,
): Promise<SectionResponse> {
  const headers = await getAdminAuthHeader();
  const res = await app.fetch(
    new Request(`http://localhost/api/trips/${tripId}/sections`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title, orderIndex }),
    }),
  );
  return res.json() as Promise<SectionResponse>;
}

describe("Section Routes", () => {
  // =============================================================================
  // GET /api/trips/:tripId/sections - List sections for a trip
  // =============================================================================
  describe("GET /api/trips/:tripId/sections", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("returns empty array for trip with no sections", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Empty Trip" });
      createdTripIds.push(trip.id);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          headers,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { sections: SectionResponse[] };
      expect(Array.isArray(data.sections)).toBe(true);
      expect(data.sections.length).toBe(0);
    });

    it("returns sections ordered by order_index", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Ordered Trip" });
      createdTripIds.push(trip.id);

      // Create sections out of order
      await createSection(app, trip.id, "Third", 2);
      await createSection(app, trip.id, "First", 0);
      await createSection(app, trip.id, "Second", 1);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          headers,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { sections: SectionResponse[] };
      expect(data.sections.length).toBe(3);
      expect(data.sections[0].title).toBe("First");
      expect(data.sections[1].title).toBe("Second");
      expect(data.sections[2].title).toBe("Third");
    });

    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${fakeUuid}/sections`, {
          headers,
        }),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });

    it("returns 400 for invalid tripId UUID", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/trips/not-a-uuid/sections", {
          headers,
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("Invalid trip ID format");
    });

    it("requires admin auth (401 without token)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`),
      );

      expect(res.status).toBe(401);
    });

    it("requires admin auth (403 for non-admin user)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const headers = await getUserAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          headers,
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  // =============================================================================
  // POST /api/trips/:tripId/sections - Create a section
  // =============================================================================
  describe("POST /api/trips/:tripId/sections", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("creates section successfully", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Create Test" });
      createdTripIds.push(trip.id);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "First Section", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as SectionResponse;
      expect(data.title).toBe("First Section");
      expect(data.orderIndex).toBe(0);
      expect(data.tripId).toBe(trip.id);
      expect(data.id).toBeDefined();
    });

    it("returns 400 for empty title", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Empty Title Test" });
      createdTripIds.push(trip.id);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "   ", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("Title is required");
    });

    it("returns 400 for title > 200 chars", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Long Title Test" });
      createdTripIds.push(trip.id);

      const longTitle = "a".repeat(201);
      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: longTitle, orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("200 characters");
    });

    it("returns 400 for negative orderIndex", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Negative Index Test" });
      createdTripIds.push(trip.id);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Section", orderIndex: -1 }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("non-negative");
    });

    it("returns 400 for missing orderIndex", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Missing Order Test" });
      createdTripIds.push(trip.id);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Valid Title" }), // No orderIndex
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("required");
    });

    it("returns 409 for duplicate (trip_id, order_index)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Duplicate Order Test" });
      createdTripIds.push(trip.id);

      // Create first section with orderIndex 0
      await createSection(app, trip.id, "First", 0);

      // Try to create another section with same orderIndex
      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Second", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(409);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Conflict");
      expect(data.message).toContain("order already exists");
    });

    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${fakeUuid}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Section", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });

    it("returns 400 for invalid tripId UUID", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/trips/not-a-uuid/sections", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Section", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("Invalid trip ID format");
    });

    it("requires admin auth (401 without token)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Section", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it("requires admin auth (403 for non-admin user)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const headers = await getUserAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Section", orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  // =============================================================================
  // PATCH /api/sections/:id - Update a section
  // =============================================================================
  describe("PATCH /api/sections/:id", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("updates title successfully", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Update Title Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Original Title", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Title" }),
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as SectionResponse;
      expect(data.title).toBe("Updated Title");
      expect(data.orderIndex).toBe(0); // Unchanged
    });

    it("updates orderIndex successfully", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Update Order Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ orderIndex: 5 }),
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as SectionResponse;
      expect(data.orderIndex).toBe(5);
      expect(data.title).toBe("Section"); // Unchanged
    });

    it("updates both fields successfully", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Update Both Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Original", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated", orderIndex: 3 }),
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as SectionResponse;
      expect(data.title).toBe("Updated");
      expect(data.orderIndex).toBe(3);
    });

    it("returns 400 for no fields provided", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "No Fields Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("At least one field");
    });

    it("returns 400 for empty title", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Empty Title Update Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Original", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "   " }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("Title is required");
    });

    it("returns 400 for negative orderIndex", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Negative Update Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ orderIndex: -1 }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("non-negative");
    });

    it("returns 409 for duplicate orderIndex in same trip", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Duplicate Update Test" });
      createdTripIds.push(trip.id);

      // Create section1 with orderIndex 0 (creates the conflict target)
      await createSection(app, trip.id, "First", 0);
      const section2 = await createSection(app, trip.id, "Second", 1);

      // Try to update section2 to have same orderIndex as section1
      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section2.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ orderIndex: 0 }),
        }),
      );

      expect(res.status).toBe(409);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Conflict");
      expect(data.message).toContain("order already exists");
    });

    it("returns 404 for non-existent section", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const res = await app.fetch(
        new Request(`http://localhost/api/${fakeUuid}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });

    it("returns 400 for invalid section id UUID", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/not-a-uuid", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("Invalid section ID format");
    });

    it("requires admin auth (401 without token)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it("requires admin auth (403 for non-admin user)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const headers = await getUserAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  // =============================================================================
  // DELETE /api/sections/:id - Delete a section
  // =============================================================================
  describe("DELETE /api/sections/:id", () => {
    const createdTripIds: string[] = [];

    afterEach(async () => {
      for (const id of createdTripIds) await cleanupTrip(id);
      createdTripIds.length = 0;
    });

    it("deletes section successfully (204)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Delete Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "To Delete", 0);

      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "DELETE",
          headers,
        }),
      );

      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");

      // Verify section is deleted
      const listRes = await app.fetch(
        new Request(`http://localhost/api/trips/${trip.id}/sections`, {
          headers,
        }),
      );
      const data = (await listRes.json()) as { sections: SectionResponse[] };
      expect(data.sections.length).toBe(0);
    });

    it("sets photos.section_id to NULL (verify cascade)", async () => {
      const app = createTestApp();
      const db = getDbClient();
      const trip = await createTrip({ title: "Cascade Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "With Photo", 0);

      // Create photo and assign to section
      const photo = await createPhoto({ tripId: trip.id });
      await db`
        UPDATE photos SET section_id = ${section.id} WHERE id = ${photo.id}
      `;

      // Verify photo has section_id
      const [photoBeforeDelete] = await db<{ section_id: string | null }[]>`
        SELECT section_id FROM photos WHERE id = ${photo.id}
      `;
      expect(photoBeforeDelete.section_id).toBe(section.id);

      // Delete section
      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "DELETE",
          headers,
        }),
      );

      expect(res.status).toBe(204);

      // Verify photo.section_id is NULL
      const [photoAfterDelete] = await db<{ section_id: string | null }[]>`
        SELECT section_id FROM photos WHERE id = ${photo.id}
      `;
      expect(photoAfterDelete.section_id).toBeNull();
    });

    it("returns 404 for non-existent section", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const res = await app.fetch(
        new Request(`http://localhost/api/${fakeUuid}`, {
          method: "DELETE",
          headers,
        }),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });

    it("returns 400 for invalid section id UUID", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/not-a-uuid", {
          method: "DELETE",
          headers,
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toContain("Invalid section ID format");
    });

    it("requires admin auth (401 without token)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(401);
    });

    it("requires admin auth (403 for non-admin user)", async () => {
      const app = createTestApp();
      const trip = await createTrip({ title: "Auth Test" });
      createdTripIds.push(trip.id);

      const section = await createSection(app, trip.id, "Section", 0);

      const headers = await getUserAuthHeader();
      const res = await app.fetch(
        new Request(`http://localhost/api/${section.id}`, {
          method: "DELETE",
          headers,
        }),
      );

      expect(res.status).toBe(403);
    });
  });
});
