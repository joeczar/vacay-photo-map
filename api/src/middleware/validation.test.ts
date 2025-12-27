// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { AuthEnv } from "../types/auth";
import { trips } from "../routes/trips";
import { invites } from "../routes/invites";
import { tripAccess } from "../routes/trip-access";
import { getAdminAuthHeader } from "../test-helpers";

// Mock R2 to use local filesystem
mock.module("../utils/r2", () => ({
  uploadToR2: async () => false,
  getFromR2: async () => null,
  isR2Available: () => false,
  deleteMultipleFromR2: async () => 0,
  PHOTOS_URL_PREFIX: "/api/photos/",
}));

// Create full test app with all routes that have UUID validation
function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api/trips", trips);
  app.route("/api/invites", invites);
  app.route("/api", tripAccess);
  return app;
}

// Valid UUID for tests that need one valid UUID
const validUuid = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// UUID Validation Tests
// =============================================================================
// This comprehensive test verifies all endpoints return 400 for invalid UUID format.
// Individual route files should NOT duplicate these tests.

describe("UUID Validation", () => {
  // Endpoints that validate UUID in URL path
  const uuidPathEndpoints: Array<{
    method: string;
    path: string;
    desc: string;
    body?: Record<string, unknown>;
  }> = [
    // Trip routes
    {
      method: "PATCH",
      path: "/api/trips/invalid-uuid",
      desc: "Update trip",
      body: { title: "Test" },
    },
    { method: "DELETE", path: "/api/trips/invalid-uuid", desc: "Delete trip" },
    {
      method: "GET",
      path: "/api/trips/id/invalid-uuid",
      desc: "Get trip by UUID",
    },
    {
      method: "PATCH",
      path: "/api/trips/invalid-uuid/protection",
      desc: "Update trip protection",
      body: { isPublic: true },
    },
    {
      method: "DELETE",
      path: "/api/trips/photos/invalid-uuid",
      desc: "Delete photo",
    },
    // Trip access routes
    {
      method: "GET",
      path: "/api/trips/invalid-uuid/access",
      desc: "List trip access",
    },
    {
      method: "PATCH",
      path: "/api/trip-access/invalid-uuid",
      desc: "Update trip access",
      body: { role: "editor" },
    },
    {
      method: "DELETE",
      path: "/api/trip-access/invalid-uuid",
      desc: "Delete trip access",
    },
    // Invite routes
    {
      method: "DELETE",
      path: "/api/invites/invalid-uuid",
      desc: "Delete invite",
    },
  ];

  describe("returns 400 for invalid UUID in path", () => {
    uuidPathEndpoints.forEach(({ method, path, desc, body }) => {
      it(`${method} ${path} (${desc})`, async () => {
        const app = createTestApp();
        const headers = await getAdminAuthHeader();
        const res = await app.fetch(
          new Request(`http://localhost${path}`, {
            method,
            headers: { ...headers, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }),
        );
        expect(res.status).toBe(400);
        const data = (await res.json()) as { message: string };
        expect(data.message.toLowerCase()).toMatch(
          /invalid.*format|invalid.*id/i,
        );
      });
    });
  });

  // Endpoints that validate UUID in request body
  describe("returns 400 for invalid UUID in body", () => {
    it("POST /api/trip-access with invalid userId", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trip-access", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "invalid-uuid",
            tripId: validUuid,
            role: "viewer",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { message: string };
      expect(data.message.toLowerCase()).toMatch(
        /invalid.*format|invalid.*id/i,
      );
    });

    it("POST /api/trip-access with invalid tripId", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/trip-access", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: validUuid,
            tripId: "invalid-uuid",
            role: "viewer",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { message: string };
      expect(data.message.toLowerCase()).toMatch(
        /invalid.*format|invalid.*id/i,
      );
    });
  });
});
