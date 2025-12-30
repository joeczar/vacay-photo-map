// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { tripAccess } from "./trip-access";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import {
  getAdminAuthHeader,
  TEST_ADMIN_USER_ID,
  TEST_USER_ID,
} from "../test-helpers";

// Response types
interface ErrorResponse {
  error: string;
  message: string;
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

interface UserListResponse {
  users: Array<{
    id: string;
    userId: string;
    email: string;
    displayName: string | null;
    role: string;
    grantedAt: string;
    grantedByUserId: string | null;
  }>;
}

interface AllUsersResponse {
  users: Array<{
    id: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
  }>;
}

function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api", tripAccess);
  return app;
}

// Test data
let testTripId: string;
let testUserId: string;
let testAdminEmail: string;
let testUserEmail: string;

describe("Trip Access Routes", () => {
  beforeAll(async () => {
    const db = getDbClient();

    // Create admin user with unique email
    const now = Date.now();
    testAdminEmail = `test-admin-trip-access-${now}@example.com`;
    const adminPasswordHash = await Bun.password.hash("password123");
    await db`
      INSERT INTO user_profiles (id, email, password_hash, is_admin, display_name)
      VALUES (${TEST_ADMIN_USER_ID}, ${testAdminEmail}, ${adminPasswordHash}, true, 'Admin User')
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            is_admin = EXCLUDED.is_admin,
            password_hash = EXCLUDED.password_hash,
            display_name = EXCLUDED.display_name
    `;

    // Create regular test user with unique email
    testUserEmail = `test-user-trip-access-${now}@example.com`;
    const userPasswordHash = await Bun.password.hash("password123");
    await db`
      INSERT INTO user_profiles (id, email, password_hash, is_admin, display_name)
      VALUES (${TEST_USER_ID}, ${testUserEmail}, ${userPasswordHash}, false, 'Test User')
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            is_admin = EXCLUDED.is_admin,
            password_hash = EXCLUDED.password_hash,
            display_name = EXCLUDED.display_name
    `;
    testUserId = TEST_USER_ID;

    // Create test trip
    const uniqueSlug = `test-trip-access-${Date.now()}`;
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES (${uniqueSlug}, 'Test Trip for Access', true)
      RETURNING id
    `;
    testTripId = trip.id;
  });

  afterAll(async () => {
    const db = getDbClient();
    // Cleanup: CASCADE deletes trip_access records
    await db`DELETE FROM trips WHERE id = ${testTripId}`;
    await db`DELETE FROM user_profiles WHERE id IN (${TEST_ADMIN_USER_ID}, ${TEST_USER_ID})`;
  });

  describe("POST /api/trip-access", () => {
    it("grants access to user (editor role)", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          tripId: testTripId,
          role: "editor",
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as TripAccessResponse;
      expect(data.tripAccess.userId).toBe(testUserId);
      expect(data.tripAccess.tripId).toBe(testTripId);
      expect(data.tripAccess.role).toBe("editor");
      expect(data.tripAccess.grantedByUserId).toBe(TEST_ADMIN_USER_ID);

      // Cleanup
      const db = getDbClient();
      await db`DELETE FROM trip_access WHERE id = ${data.tripAccess.id}`;
    });

    it("grants access to user (viewer role)", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          tripId: testTripId,
          role: "viewer",
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as TripAccessResponse;
      expect(data.tripAccess.role).toBe("viewer");

      // Cleanup
      const db = getDbClient();
      await db`DELETE FROM trip_access WHERE id = ${data.tripAccess.id}`;
    });

    it("returns 400 for missing required fields", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          // missing tripId and role
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("required");
    });

    it("returns 400 for invalid role", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          tripId: testTripId,
          role: "admin",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("editor");
      expect(data.message).toContain("viewer");
    });

    it("returns 404 if user does not exist", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeUserId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: fakeUserId,
          tripId: testTripId,
          role: "editor",
        }),
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("User not found");
    });

    it("returns 404 if trip does not exist", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeTripId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          tripId: fakeTripId,
          role: "editor",
        }),
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Trip not found");
    });

    it("returns 400 when trying to grant access to admin user", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: TEST_ADMIN_USER_ID, // Admin user
          tripId: testTripId,
          role: "editor",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("admin");
      expect(data.message).toContain("implicit access");
    });

    it("returns 409 for duplicate access grant (unique constraint)", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const db = getDbClient();

      // First grant
      const res1 = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          tripId: testTripId,
          role: "editor",
        }),
      });

      expect(res1.status).toBe(201);
      const data1 = (await res1.json()) as TripAccessResponse;

      // Second grant (should fail)
      const res2 = await app.request("/api/trip-access", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId,
          tripId: testTripId,
          role: "viewer",
        }),
      });

      expect(res2.status).toBe(409);
      const data2 = (await res2.json()) as ErrorResponse;
      expect(data2.message).toContain("already has access");
      expect(data2.message).toContain("PATCH");

      // Cleanup
      await db`DELETE FROM trip_access WHERE id = ${data1.tripAccess.id}`;
    });
  });

  describe("GET /api/trips/:tripId/access", () => {
    it("lists all users with access to trip", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const db = getDbClient();

      // Grant access to test user
      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${testTripId}, 'editor', ${TEST_ADMIN_USER_ID})
        RETURNING id
      `;

      const res = await app.request(`/api/trips/${testTripId}/access`, {
        method: "GET",
        headers: auth,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as UserListResponse;
      expect(data.users).toBeArrayOfSize(1);
      expect(data.users[0].userId).toBe(testUserId);
      expect(data.users[0].email).toBe(testUserEmail);
      expect(data.users[0].displayName).toBe("Test User");
      expect(data.users[0].role).toBe("editor");

      // Cleanup
      await db`DELETE FROM trip_access WHERE id = ${access.id}`;
    });

    it("returns empty array if no users have access", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request(`/api/trips/${testTripId}/access`, {
        method: "GET",
        headers: auth,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as UserListResponse;
      expect(data.users).toBeArrayOfSize(0);
    });

    it("returns 404 if trip does not exist", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeTripId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request(`/api/trips/${fakeTripId}/access`, {
        method: "GET",
        headers: auth,
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Trip not found");
    });
  });

  describe("PATCH /api/trip-access/:id", () => {
    it("updates user's role from viewer to editor", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const db = getDbClient();

      // Create access record
      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${testTripId}, 'viewer', ${TEST_ADMIN_USER_ID})
        RETURNING id
      `;

      const res = await app.request(`/api/trip-access/${access.id}`, {
        method: "PATCH",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "editor" }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripAccessResponse;
      expect(data.tripAccess.id).toBe(access.id);
      expect(data.tripAccess.role).toBe("editor");

      // Cleanup
      await db`DELETE FROM trip_access WHERE id = ${access.id}`;
    });

    it("updates user's role from editor to viewer", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const db = getDbClient();

      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${testTripId}, 'editor', ${TEST_ADMIN_USER_ID})
        RETURNING id
      `;

      const res = await app.request(`/api/trip-access/${access.id}`, {
        method: "PATCH",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "viewer" }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as TripAccessResponse;
      expect(data.tripAccess.role).toBe("viewer");

      // Cleanup
      await db`DELETE FROM trip_access WHERE id = ${access.id}`;
    });

    it("returns 400 for missing role field", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request(`/api/trip-access/${fakeId}`, {
        method: "PATCH",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("role is required");
    });

    it("returns 400 for invalid role", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request(`/api/trip-access/${fakeId}`, {
        method: "PATCH",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("editor");
      expect(data.message).toContain("viewer");
    });

    it("returns 404 if record does not exist", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request(`/api/trip-access/${fakeId}`, {
        method: "PATCH",
        headers: {
          ...auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "editor" }),
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Trip access record not found");
    });
  });

  describe("DELETE /api/trip-access/:id", () => {
    it("revokes user access to trip", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const db = getDbClient();

      // Create access record
      const [access] = await db<{ id: string }[]>`
        INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
        VALUES (${testUserId}, ${testTripId}, 'editor', ${TEST_ADMIN_USER_ID})
        RETURNING id
      `;

      const res = await app.request(`/api/trip-access/${access.id}`, {
        method: "DELETE",
        headers: auth,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toBe("Trip access revoked");

      // Verify deletion
      const check = await db<{ id: string }[]>`
        SELECT id FROM trip_access WHERE id = ${access.id}
      `;
      expect(check).toBeArrayOfSize(0);
    });

    it("returns 404 if record does not exist", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();
      const fakeId = "00000000-0000-4000-a000-000000000999";

      const res = await app.request(`/api/trip-access/${fakeId}`, {
        method: "DELETE",
        headers: auth,
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toContain("Trip access record not found");
    });
  });

  describe("GET /api/users", () => {
    it("lists all users (admin and regular)", async () => {
      const app = createTestApp();
      const auth = await getAdminAuthHeader();

      const res = await app.request("/api/users", {
        method: "GET",
        headers: auth,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AllUsersResponse;
      expect(data.users.length).toBeGreaterThanOrEqual(2); // At least admin + test user

      const admin = data.users.find((u) => u.id === TEST_ADMIN_USER_ID);
      expect(admin).toBeDefined();
      expect(admin!.isAdmin).toBe(true);
      expect(admin!.email).toBe(testAdminEmail);

      const user = data.users.find((u) => u.id === TEST_USER_ID);
      expect(user).toBeDefined();
      expect(user!.isAdmin).toBe(false);
      expect(user!.email).toBe(testUserEmail);
    });
  });
});
