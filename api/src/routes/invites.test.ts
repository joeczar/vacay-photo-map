// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { invites } from "./invites";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import {
  getAdminAuthHeader,
  getUserAuthHeader,
  TEST_ADMIN_USER_ID,
} from "../test-helpers";

// Response types
interface ErrorResponse {
  error: string;
  message: string;
}

interface CreateInviteResponse {
  invite: {
    id: string;
    code: string;
    createdByUserId: string;
    email: string | null;
    role: "editor" | "viewer";
    expiresAt: string;
    usedAt: string | null;
    usedByUserId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  tripIds: string[];
}

interface InviteListResponse {
  invites: Array<{
    id: string;
    code: string;
    email: string | null;
    role: "editor" | "viewer";
    expiresAt: string;
    usedAt: string | null;
    tripCount: number;
    status: "pending" | "used" | "expired";
  }>;
}

interface ValidateInviteResponse {
  valid: boolean;
  reason?: string;
  message?: string;
  invite?: {
    email: string | null;
    role: string;
    expiresAt: string;
  };
  trips?: Array<{
    id: string;
    slug: string;
    title: string;
  }>;
}

// Create test app
function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api/invites", invites);
  return app;
}

// Test data
let testTripId: string;

describe("Invite Routes", () => {
  // Setup: Create test user and test trip for invite assignments
  beforeAll(async () => {
    const db = getDbClient();

    // Create test admin user (required for invite creation foreign key)
    await db`
      INSERT INTO user_profiles (id, email, is_admin)
      VALUES (${TEST_ADMIN_USER_ID}, 'admin@example.com', true)
      ON CONFLICT (id) DO NOTHING
    `;

    const uniqueSlug = `test-trip-for-invites-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${uniqueSlug}, 'Test Trip for Invites', true)
      RETURNING id
    `;
    testTripId = trip.id;
  });

  // Cleanup: Delete test trip and user
  afterAll(async () => {
    const db = getDbClient();
    await db`DELETE FROM trips WHERE id = ${testTripId}`;
    await db`DELETE FROM user_profiles WHERE id = ${TEST_ADMIN_USER_ID}`;
  });

  // ==========================================================================
  // POST /api/invites - Create invite
  // ==========================================================================
  describe("POST /api/invites", () => {
    it("returns 401 without authentication", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email: "test@example.com",
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid email", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email: "not-an-email",
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message.toLowerCase()).toContain("email");
    });

    it("returns 400 for invalid role", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email: "test@example.com",
            role: "invalid-role",
            tripIds: [testTripId],
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message.toLowerCase()).toContain("role");
    });

    it("returns 400 for empty trip IDs", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email: "test@example.com",
            role: "viewer",
            tripIds: [],
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message.toLowerCase()).toContain("trip");
    });

    it("creates invite successfully for admin", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      // Use mixed-case email to verify normalization
      const email = `Test-${Date.now()}@Example.COM`;

      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as CreateInviteResponse;
      // Verify email is normalized to lowercase
      expect(data.invite.email).toBe(email.toLowerCase());
      expect(data.invite.role).toBe("viewer");
      expect(data.invite.code).toHaveLength(32);
      expect(data.tripIds).toEqual([testTripId]);

      // Cleanup
      const db = getDbClient();
      await db`DELETE FROM invites WHERE id = ${data.invite.id}`;
    });

    it("returns 409 for duplicate pending invite", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const email = `duplicate-${Date.now()}@example.com`;

      // Create first invite
      const res1 = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      expect(res1.status).toBe(201);
      const data1 = (await res1.json()) as CreateInviteResponse;

      // Try to create duplicate
      const res2 = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "editor",
            tripIds: [testTripId],
          }),
        }),
      );
      expect(res2.status).toBe(409);

      // Cleanup
      const db = getDbClient();
      await db`DELETE FROM invites WHERE id = ${data1.invite.id}`;
    });
  });

  // ==========================================================================
  // GET /api/invites - List invites
  // ==========================================================================
  describe("GET /api/invites", () => {
    it("returns 401 without authentication", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "GET",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "GET",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(403);
    });

    it("returns invite list for admin", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "GET",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as InviteListResponse;
      expect(Array.isArray(data.invites)).toBe(true);
    });
  });

  // ==========================================================================
  // DELETE /api/invites/:id - Revoke invite
  // ==========================================================================
  describe("DELETE /api/invites/:id", () => {
    it("returns 401 without authentication", async () => {
      const app = createTestApp();
      const fakeId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.fetch(
        new Request(`http://localhost/api/invites/${fakeId}`, {
          method: "DELETE",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid UUID", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const res = await app.fetch(
        new Request("http://localhost/api/invites/invalid-id", {
          method: "DELETE",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent invite", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const fakeId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.fetch(
        new Request(`http://localhost/api/invites/${fakeId}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );
      expect(res.status).toBe(404);
    });

    it("successfully revokes pending invite", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const db = getDbClient();

      // Create invite
      const email = `revoke-${Date.now()}@example.com`;
      const createRes = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      const createData = (await createRes.json()) as CreateInviteResponse;

      // Revoke it
      const deleteRes = await app.fetch(
        new Request(`http://localhost/api/invites/${createData.invite.id}`, {
          method: "DELETE",
          headers: authHeader,
        }),
      );
      expect(deleteRes.status).toBe(200);

      // Verify it's marked as used
      const [invite] = await db<{ used_at: Date | null }[]>`
        SELECT used_at FROM invites WHERE id = ${createData.invite.id}
      `;
      expect(invite.used_at).not.toBeNull();

      // Cleanup
      await db`DELETE FROM invites WHERE id = ${createData.invite.id}`;
    });
  });

  // ==========================================================================
  // GET /api/invites/validate/:token - Validate invite
  // ==========================================================================
  describe("GET /api/invites/validate/:token", () => {
    it("does not require authentication", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/api/invites/validate/invalid-token", {
          method: "GET",
        }),
      );
      // Should return 400 for invalid format, not 401
      expect(res.status).not.toBe(401);
    });

    it("returns 400 for invalid token format", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/api/invites/validate/short", {
          method: "GET",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-existent token (prevents enumeration)", async () => {
      const app = createTestApp();
      // Valid format but doesn't exist - uses 400 to prevent token enumeration
      const fakeToken = "A".repeat(32);
      const res = await app.fetch(
        new Request(`http://localhost/api/invites/validate/${fakeToken}`, {
          method: "GET",
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ValidateInviteResponse;
      expect(data.valid).toBe(false);
    });

    it("returns valid response for active invite", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const db = getDbClient();

      // Create invite
      const email = `validate-${Date.now()}@example.com`;
      const createRes = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      const createData = (await createRes.json()) as CreateInviteResponse;

      // Validate it
      const validateRes = await app.fetch(
        new Request(
          `http://localhost/api/invites/validate/${createData.invite.code}`,
          { method: "GET" },
        ),
      );
      expect(validateRes.status).toBe(200);
      const validateData = (await validateRes.json()) as ValidateInviteResponse;
      expect(validateData.valid).toBe(true);
      expect(validateData.invite?.email).toBe(email.toLowerCase());
      expect(validateData.trips).toHaveLength(1);

      // Cleanup
      await db`DELETE FROM invites WHERE id = ${createData.invite.id}`;
    });

    it("returns 400 for already-used invite (prevents enumeration)", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const db = getDbClient();

      // Create invite
      const email = `used-${Date.now()}@example.com`;
      const createRes = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      const createData = (await createRes.json()) as CreateInviteResponse;

      // Mark as used
      await db`UPDATE invites SET used_at = NOW() WHERE id = ${createData.invite.id}`;

      // Validate - returns 400 (same as non-existent) to prevent enumeration
      const validateRes = await app.fetch(
        new Request(
          `http://localhost/api/invites/validate/${createData.invite.code}`,
          { method: "GET" },
        ),
      );
      expect(validateRes.status).toBe(400);
      const validateData = (await validateRes.json()) as ValidateInviteResponse;
      expect(validateData.valid).toBe(false);

      // Cleanup
      await db`DELETE FROM invites WHERE id = ${createData.invite.id}`;
    });

    it("returns 400 for expired invite (prevents enumeration)", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const db = getDbClient();

      // Create invite
      const email = `expired-${Date.now()}@example.com`;
      const createRes = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );
      const createData = (await createRes.json()) as CreateInviteResponse;

      // Set expiration to past
      await db`UPDATE invites SET expires_at = NOW() - INTERVAL '1 day' WHERE id = ${createData.invite.id}`;

      // Validate - returns 400 (same as non-existent) to prevent enumeration
      const validateRes = await app.fetch(
        new Request(
          `http://localhost/api/invites/validate/${createData.invite.code}`,
          { method: "GET" },
        ),
      );
      expect(validateRes.status).toBe(400);
      const validateData = (await validateRes.json()) as ValidateInviteResponse;
      expect(validateData.valid).toBe(false);

      // Cleanup
      await db`DELETE FROM invites WHERE id = ${createData.invite.id}`;
    });

    it("enforces rate limiting", async () => {
      const app = createTestApp();
      const fakeToken = "B".repeat(32);

      // Make 6 requests (limit is 5)
      const requests = Array.from({ length: 6 }, () =>
        app.fetch(
          new Request(`http://localhost/api/invites/validate/${fakeToken}`, {
            method: "GET",
            headers: { "x-real-ip": "192.168.1.100" }, // Simulate same IP
          }),
        ),
      );

      const responses = await Promise.all(requests);
      const statusCodes = responses.map((r) => r.status);

      // First 5 should be 404 (not found), 6th should be 429 (rate limited)
      const rateLimitedCount = statusCodes.filter((s) => s === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });
});
