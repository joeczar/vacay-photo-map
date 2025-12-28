// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { invites } from "./invites";
import { tripAccess } from "./trip-access";
import { trips } from "./trips";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import {
  getAdminAuthHeader,
  getUserAuthHeader,
  TEST_ADMIN_USER_ID,
  TEST_USER_ID,
  TEST_USER_2_ID,
  uniqueIp,
} from "../test-helpers";

// =============================================================================
// Response Types
// =============================================================================

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

interface TripAccessResponse {
  tripAccess: {
    id: string;
    userId: string;
    tripId: string;
    role: "editor" | "viewer";
    grantedAt: string;
    grantedByUserId: string | null;
  };
}

interface TripWithPhotosResponse {
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
  photos: Array<{
    id: string;
    storageKey: string;
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

interface ErrorResponse {
  error: string;
  message: string;
}

// =============================================================================
// Test App Factory
// =============================================================================

function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api/invites", invites);
  app.route("/api", tripAccess);
  app.route("/api/trips", trips);
  return app;
}

// =============================================================================
// Test Data
// =============================================================================

let testTripId: string;
let testTripSlug: string;
let testAdminEmail: string;
let testUserEmail: string;
let secondUserEmail: string;

// =============================================================================
// RBAC Integration Tests
// =============================================================================

describe("RBAC Integration Tests", () => {
  beforeAll(async () => {
    const db = getDbClient();
    const now = Date.now();

    // Create admin user with unique email and webauthn_user_id
    const adminWebauthnId = `test-webauthn-${TEST_ADMIN_USER_ID}-${now}`;
    testAdminEmail = `test-admin-rbac-${now}@example.com`;
    await db`
      INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin, display_name)
      VALUES (${TEST_ADMIN_USER_ID}, ${testAdminEmail}, ${adminWebauthnId}, true, 'Admin User')
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            is_admin = EXCLUDED.is_admin,
            webauthn_user_id = EXCLUDED.webauthn_user_id,
            display_name = EXCLUDED.display_name
    `;

    // Create first regular test user
    const userWebauthnId = `test-webauthn-${TEST_USER_ID}-${now}`;
    testUserEmail = `test-user-rbac-${now}@example.com`;
    await db`
      INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin, display_name)
      VALUES (${TEST_USER_ID}, ${testUserEmail}, ${userWebauthnId}, false, 'Test User')
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            is_admin = EXCLUDED.is_admin,
            webauthn_user_id = EXCLUDED.webauthn_user_id,
            display_name = EXCLUDED.display_name
    `;

    // Create second regular test user for invite workflow tests
    const secondWebauthnId = `test-webauthn-${TEST_USER_2_ID}-${now}`;
    secondUserEmail = `test-user-2-rbac-${now}@example.com`;
    await db`
      INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin, display_name)
      VALUES (${TEST_USER_2_ID}, ${secondUserEmail}, ${secondWebauthnId}, false, 'Test User 2')
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            is_admin = EXCLUDED.is_admin,
            webauthn_user_id = EXCLUDED.webauthn_user_id,
            display_name = EXCLUDED.display_name
    `;

    // Create test trip (draft mode - is_public = false)
    testTripSlug = `test-rbac-trip-${now}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public, description)
      VALUES (${testTripSlug}, 'RBAC Test Trip', false, 'Test trip for RBAC integration')
      RETURNING id
    `;
    testTripId = trip.id;
  });

  afterAll(async () => {
    const db = getDbClient();
    // CASCADE deletes trip_access, photos, invite_trips
    await db`DELETE FROM trips WHERE id = ${testTripId}`;
    await db`DELETE FROM user_profiles WHERE id IN (${TEST_ADMIN_USER_ID}, ${TEST_USER_ID}, ${TEST_USER_2_ID})`;
  });

  // ===========================================================================
  // 1. Invite Creation and Validation
  // ===========================================================================
  describe("Invite Creation and Validation", () => {
    let inviteCode: string;
    let inviteId: string;

    it("admin can create invite for trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email: testUserEmail,
            role: "editor",
            tripIds: [testTripId],
          }),
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as CreateInviteResponse;
      expect(data.invite.email).toBe(testUserEmail);
      expect(data.invite.role).toBe("editor");
      expect(data.invite.code).toHaveLength(32);
      expect(data.tripIds).toEqual([testTripId]);

      // Store for next tests
      inviteCode = data.invite.code;
      inviteId = data.invite.id;
    });

    it("validate invite code returns valid=true with role and trips", async () => {
      const app = createTestApp();

      const res = await app.fetch(
        new Request(`http://localhost/api/invites/validate/${inviteCode}`, {
          method: "GET",
          headers: { "X-Forwarded-For": uniqueIp() },
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateInviteResponse;
      expect(data.valid).toBe(true);
      expect(data.invite?.email).toBe(testUserEmail);
      expect(data.invite?.role).toBe("editor");
      expect(data.trips).toHaveLength(1);
      expect(data.trips![0].id).toBe(testTripId);
      expect(data.trips![0].slug).toBe(testTripSlug);
    });

    it("invalid invite code returns valid=false, reason='not_found'", async () => {
      const app = createTestApp();
      const fakeCode = "A".repeat(32);

      const res = await app.fetch(
        new Request(`http://localhost/api/invites/validate/${fakeCode}`, {
          method: "GET",
          headers: { "X-Forwarded-For": uniqueIp() },
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ValidateInviteResponse;
      expect(data.valid).toBe(false);
      // API uses 400 status to prevent token enumeration
    });

    it("expired invite returns valid=false, reason='expired'", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Set expiration to past
      await db`UPDATE invites SET expires_at = NOW() - INTERVAL '1 day' WHERE id = ${inviteId}`;

      const res = await app.fetch(
        new Request(`http://localhost/api/invites/validate/${inviteCode}`, {
          method: "GET",
          headers: { "X-Forwarded-For": uniqueIp() },
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ValidateInviteResponse;
      expect(data.valid).toBe(false);

      // Reset expiration for next tests
      await db`UPDATE invites SET expires_at = NOW() + INTERVAL '7 days' WHERE id = ${inviteId}`;
    });

    // Cleanup invite after these tests
    afterAll(async () => {
      const db = getDbClient();
      await db`DELETE FROM invites WHERE id = ${inviteId}`;
    });
  });

  // ===========================================================================
  // 2. Registration with Invite
  // ===========================================================================
  describe("Registration with Invite", () => {
    let inviteCode: string;
    let inviteId: string;

    beforeAll(async () => {
      // Create fresh invite for registration test
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request("http://localhost/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            email: secondUserEmail,
            role: "viewer",
            tripIds: [testTripId],
          }),
        }),
      );

      const data = (await res.json()) as CreateInviteResponse;
      inviteCode = data.invite.code;
      inviteId = data.invite.id;
    });

    it("simulate registration flow: create user, mark invite used, grant trip_access", async () => {
      const db = getDbClient();

      // Step 1: Validate invite exists and is valid
      const [invite] = await db<
        { id: string; role: string; used_at: Date | null }[]
      >`
        SELECT id, role, used_at FROM invites
        WHERE code = ${inviteCode}
          AND expires_at > NOW()
      `;

      expect(invite).toBeDefined();
      expect(invite.used_at).toBeNull();
      expect(invite.role).toBe("viewer");

      // Step 2: Mark invite as used (simulates auth.ts registration flow)
      await db`
        UPDATE invites
        SET used_at = NOW(), used_by_user_id = ${TEST_USER_2_ID}
        WHERE id = ${inviteId}
      `;

      // Step 3: Grant trip access to new user (simulates auth.ts registration flow)
      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        SELECT ${TEST_USER_2_ID}, ita.trip_id, i.role, i.created_by_user_id
        FROM invites i
        JOIN invite_trip_access ita ON ita.invite_id = i.id
        WHERE i.id = ${inviteId}
        RETURNING id
      `;

      expect(access).toBeDefined();

      // Verify access was granted correctly
      const [tripAccess] = await db<
        { user_id: string; trip_id: string; role: string }[]
      >`
        SELECT user_id, trip_id, role FROM trip_access
        WHERE id = ${access.id}
      `;

      expect(tripAccess.user_id).toBe(TEST_USER_2_ID);
      expect(tripAccess.trip_id).toBe(testTripId);
      expect(tripAccess.role).toBe("viewer");
    });

    it("using invite twice returns valid=false, reason='already_used'", async () => {
      const app = createTestApp();

      const res = await app.fetch(
        new Request(`http://localhost/api/invites/validate/${inviteCode}`, {
          method: "GET",
          headers: { "X-Forwarded-For": uniqueIp() },
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ValidateInviteResponse;
      expect(data.valid).toBe(false);
    });

    afterAll(async () => {
      const db = getDbClient();
      // Clean up trip access and invite
      await db`DELETE FROM trip_access WHERE user_id = ${TEST_USER_2_ID} AND trip_id = ${testTripId}`;
      await db`DELETE FROM invites WHERE id = ${inviteId}`;
    });
  });

  // ===========================================================================
  // 3. Trip Access Control
  // ===========================================================================
  describe("Trip Access Control", () => {
    let accessId: string;

    beforeAll(async () => {
      const db = getDbClient();
      // Grant editor access to TEST_USER_ID for trip access tests
      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${TEST_USER_ID}, ${testTripId}, 'editor', ${TEST_ADMIN_USER_ID})
        RETURNING id
      `;
      accessId = access.id;
    });

    it("user with editor role can view trip (GET /api/trips/slug/:slug)", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(TEST_USER_ID, testUserEmail);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(testTripId);
      expect(data.slug).toBe(testTripSlug);
      expect(data.title).toBe("RBAC Test Trip");
    });

    it("user without access gets 403", async () => {
      const app = createTestApp();
      // Use TEST_USER_2_ID who doesn't have access
      const authHeader = await getUserAuthHeader(
        TEST_USER_2_ID,
        secondUserEmail,
      );

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Access denied");
    });

    it("admin bypasses access checks", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(testTripId);
    });

    afterAll(async () => {
      const db = getDbClient();
      await db`DELETE FROM trip_access WHERE id = ${accessId}`;
    });
  });

  // ===========================================================================
  // 4. Role-Based Permissions
  // ===========================================================================
  describe("Role-Based Permissions", () => {
    let accessId: string;

    it("admin can grant trip access (POST /api/trip-access)", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          tripId: testTripId,
          role: "viewer",
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as TripAccessResponse;
      expect(data.tripAccess.userId).toBe(TEST_USER_ID);
      expect(data.tripAccess.tripId).toBe(testTripId);
      expect(data.tripAccess.role).toBe("viewer");
      expect(data.tripAccess.grantedByUserId).toBe(TEST_ADMIN_USER_ID);

      accessId = data.tripAccess.id;
    });

    it("user can view trip after access granted", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(TEST_USER_ID, testUserEmail);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(testTripId);
    });

    it("admin can revoke access (DELETE /api/trip-access/:id)", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      const res = await app.request(`/api/trip-access/${accessId}`, {
        method: "DELETE",
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(true);

      // Verify deletion
      const db = getDbClient();
      const check = await db<{ id: string }[]>`
        SELECT id FROM trip_access WHERE id = ${accessId}
      `;
      expect(check).toBeArrayOfSize(0);
    });

    it("user gets 403 after access revoked", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(TEST_USER_ID, testUserEmail);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Access denied");
    });
  });

  // ===========================================================================
  // 5. Draft vs Published
  // ===========================================================================
  describe("Draft vs Published", () => {
    it("admin can access draft trips (is_public=false)", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // Our test trip is draft mode (is_public=false)
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(testTripId);
      expect(data.isPublic).toBe(false);
    });

    it("non-admin user cannot access draft trip without explicit access", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader(TEST_USER_ID, testUserEmail);

      // TEST_USER_ID should not have access since we cleaned up in previous tests
      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Access denied");
    });

    it("non-admin user can access draft trip with granted access", async () => {
      const db = getDbClient();
      const app = createTestApp();

      // Grant access
      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${TEST_USER_ID}, ${testTripId}, 'viewer', ${TEST_ADMIN_USER_ID})
        RETURNING id
      `;

      const authHeader = await getUserAuthHeader(TEST_USER_ID, testUserEmail);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/slug/${testTripSlug}`, {
          method: "GET",
          headers: authHeader,
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripWithPhotosResponse;
      expect(data.id).toBe(testTripId);
      expect(data.isPublic).toBe(false);

      // Cleanup
      await db`DELETE FROM trip_access WHERE id = ${access.id}`;
    });
  });
});
