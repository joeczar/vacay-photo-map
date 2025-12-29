// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, it, expect, afterEach } from "bun:test";
import { app } from "../index";
import {
  createUser,
  cleanupUser,
  createTrip,
  cleanupTrip,
} from "../test-factories";
import {
  getAdminAuthHeader,
  getUserAuthHeader,
  createRequestWithUniqueIp,
} from "../test-helpers";
import type {
  AuthResponse,
  ErrorResponse,
  SuccessResponse,
  UserProfileResponse,
} from "../test-types";
import { getDbClient } from "../db/client";

describe("POST /api/auth/register", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("successfully registers new user with email + password", async () => {
    // Ensure there's already a user so new registrations aren't admin
    const existingUser = await createUser({
      email: "existing-admin@example.com",
      isAdmin: true,
    });

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as AuthResponse;
    expect(data.token).toBeDefined();
    expect(data.user.email).toBe("newuser@example.com");
    expect(data.user.displayName).toBeNull();
    expect(data.user.isAdmin).toBe(false);
    userId = data.user.id;

    // Cleanup existing user
    await cleanupUser(existingUser.id);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toBe("Invalid email format");
  });

  it("returns 400 for password shorter than 8 characters", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "short",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toBe("Password must be at least 8 characters");
  });

  it("returns 409 for duplicate email", async () => {
    // createUser generates unique email if not specified
    const user = await createUser();
    userId = user.id;

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email, // Use the generated email
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(409);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Conflict");
    expect(data.message).toBe("Email already registered");
  });

  it("first user becomes admin", async () => {
    // Clean database first
    const db = getDbClient();
    await db`DELETE FROM user_profiles`;

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "firstuser@example.com",
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as AuthResponse;
    expect(data.user.isAdmin).toBe(true);
    userId = data.user.id;
  });

  it("second user is not admin", async () => {
    // Create first user (admin)
    const firstUser = await createUser({
      email: "admin@example.com",
      isAdmin: true,
    });

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "seconduser@example.com",
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as AuthResponse;
    expect(data.user.isAdmin).toBe(false);

    // Cleanup
    userId = data.user.id;
    await cleanupUser(firstUser.id);
  });

  it("registration with valid invite code grants trip access", async () => {
    let adminUserId: string | null = null;
    let tripId: string | null = null;

    try {
      // Create admin user (let factory generate unique email)
      const admin = await createUser({ isAdmin: true });
      adminUserId = admin.id;

      // Create trip (let factory generate unique slug)
      const trip = await createTrip({ title: "Invite Trip" });
      tripId = trip.id;

      // Create invite with unique code
      const db = getDbClient();
      const inviteCode = `VALID_${crypto.randomUUID().slice(0, 8)}`;
      const [invite] = await db<{ id: string; code: string }[]>`
        INSERT INTO invites (code, email, role, expires_at, created_by_user_id)
        VALUES (${inviteCode}, NULL, 'viewer', NOW() + INTERVAL '7 days', ${adminUserId})
        RETURNING id, code
      `;

      // Associate invite with trip
      await db`
        INSERT INTO invite_trip_access (invite_id, trip_id)
        VALUES (${invite.id}, ${tripId})
      `;

      // Register with invite code (use unique email)
      const invitedEmail = `invited-${crypto.randomUUID().slice(0, 8)}@example.com`;
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: invitedEmail,
            password: "password123",
            inviteCode: invite.code,
          }),
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as AuthResponse;
      userId = data.user.id;

      // Verify trip access granted
      const access = await db<{ trip_id: string }[]>`
        SELECT trip_id FROM trip_access WHERE user_id = ${userId}
      `;
      expect(access.length).toBe(1);
      expect(access[0].trip_id).toBe(tripId);
    } finally {
      if (adminUserId) await cleanupUser(adminUserId);
      if (tripId) await cleanupTrip(tripId);
    }
  });

  it("registration with invalid invite code returns 400", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
          inviteCode: "INVALID123",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toBe("Invalid or expired invite code");
  });
});

describe("POST /api/auth/login", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("successfully logs in with correct credentials", async () => {
    const user = await createUser({
      email: "loginuser@example.com",
      password: "password123",
    });
    userId = user.id;

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "loginuser@example.com",
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as AuthResponse;
    expect(data.token).toBeDefined();
    expect(data.user.email).toBe("loginuser@example.com");
    expect(data.user.id).toBe(userId);
  });

  it("returns 401 for wrong password (generic error message)", async () => {
    const user = await createUser({
      email: "loginuser@example.com",
      password: "password123",
    });
    userId = user.id;

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "loginuser@example.com",
          password: "wrongpassword",
        }),
      }),
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Unauthorized");
    expect(data.message).toBe("Invalid credentials");
  });

  it("returns 401 for non-existent user (same generic error)", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          password: "password123",
        }),
      }),
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Unauthorized");
    expect(data.message).toBe("Invalid credentials");
  });

  it("returns 400 for missing email or password", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toBe("Email and password required");
  });
});

describe("POST /api/auth/admin/reset-password", () => {
  let adminUserId: string | null = null;
  let targetUserId: string | null = null;

  afterEach(async () => {
    if (adminUserId) {
      await cleanupUser(adminUserId);
      adminUserId = null;
    }
    if (targetUserId) {
      await cleanupUser(targetUserId);
      targetUserId = null;
    }
  });

  it("admin can reset any user's password", async () => {
    const admin = await createUser({
      email: "admin@example.com",
      isAdmin: true,
    });
    adminUserId = admin.id;

    const targetUser = await createUser({
      email: "target@example.com",
      password: "oldpassword",
    });
    targetUserId = targetUser.id;

    const authHeader = await getAdminAuthHeader(adminUserId, admin.email);

    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/admin/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            userId: targetUserId,
            newPassword: "newpassword123",
          }),
        },
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as SuccessResponse;
    expect(data.success).toBe(true);

    // Verify password was changed
    const loginRes = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "target@example.com",
          password: "newpassword123",
        }),
      }),
    );
    expect(loginRes.status).toBe(200);
  });

  it("non-admin gets 403", async () => {
    const user = await createUser({
      email: "user@example.com",
      isAdmin: false,
    });
    adminUserId = user.id; // Reuse cleanup

    const targetUser = await createUser({ email: "target@example.com" });
    targetUserId = targetUser.id;

    const authHeader = await getUserAuthHeader(user.id, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/admin/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            userId: targetUserId,
            newPassword: "newpassword123",
          }),
        },
      ),
    );

    expect(res.status).toBe(403);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Forbidden");
  });

  it("returns 404 for non-existent user", async () => {
    const admin = await createUser({
      email: "admin@example.com",
      isAdmin: true,
    });
    adminUserId = admin.id;

    const authHeader = await getAdminAuthHeader(adminUserId, admin.email);

    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/admin/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            userId: "00000000-0000-4000-a000-999999999999",
            newPassword: "newpassword123",
          }),
        },
      ),
    );

    expect(res.status).toBe(404);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Not Found");
    expect(data.message).toBe("User not found");
  });

  it("returns 400 for password too short", async () => {
    const admin = await createUser({
      email: "admin@example.com",
      isAdmin: true,
    });
    adminUserId = admin.id;

    const targetUser = await createUser({ email: "target@example.com" });
    targetUserId = targetUser.id;

    const authHeader = await getAdminAuthHeader(adminUserId, admin.email);

    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/admin/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            userId: targetUserId,
            newPassword: "short",
          }),
        },
      ),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toBe("Password must be at least 8 characters");
  });
});

describe("GET /api/auth/me", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("returns user info when authenticated", async () => {
    const user = await createUser({
      email: "me@example.com",
      displayName: "Test User",
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/me", {
        method: "GET",
        headers: authHeader,
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as UserProfileResponse;
    expect(data.id).toBe(userId);
    expect(data.email).toBe("me@example.com");
    expect(data.displayName).toBe("Test User");
    expect(data.isAdmin).toBe(false);
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });
});

describe("Rate Limiting", () => {
  it("returns 429 after 10 requests from same IP", async () => {
    const testIp = "192.168.99.99";

    // Make 11 requests (limit is 10)
    const requests = Array.from({ length: 11 }, () =>
      app.fetch(
        new Request("http://localhost/api/auth/logout", {
          method: "POST",
          headers: { "X-Forwarded-For": testIp },
        }),
      ),
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);

    // First 10 should succeed, 11th should be rate limited
    expect(statuses.filter((s) => s === 200).length).toBe(10);
    expect(statuses.filter((s) => s === 429).length).toBe(1);
  });
});
