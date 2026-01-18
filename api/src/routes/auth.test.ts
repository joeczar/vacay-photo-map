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

  it("successfully registers new user with valid invite", async () => {
    // Create admin to create invite
    const admin = await createUser({
      email: "invite-admin@example.com",
      isAdmin: true,
    });

    // Create invite
    const db = getDbClient();
    const inviteCode = `REG_${crypto.randomUUID().slice(0, 8)}`.padEnd(32, "X");
    await db`
      INSERT INTO invites (code, email, role, expires_at, created_by_user_id)
      VALUES (${inviteCode}, 'newuser@example.com', 'viewer', NOW() + INTERVAL '7 days', ${admin.id})
    `;

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "password123",
          inviteCode,
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

    // Cleanup
    await cleanupUser(admin.id);
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

  // NOTE: "first user becomes admin" test removed - admins now created via CLI only
  // All registration is invite-only, no special first-user case

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

// =============================================================================
// GET /registration-status - Registration status endpoint tests
// =============================================================================

describe("GET /api/auth/registration-status", () => {
  it("returns closed when no invite provided", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/registration-status",
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      registrationOpen: boolean;
      reason: string;
    };
    expect(data.registrationOpen).toBe(false);
    expect(data.reason).toBe("invite_required");
  });

  it("returns closed for invalid invite format", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/registration-status?invite=short",
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      registrationOpen: boolean;
      reason: string;
    };
    expect(data.registrationOpen).toBe(false);
    expect(data.reason).toBe("invalid_invite");
  });

  it("returns closed for non-existent invite", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp(
        "http://localhost/api/auth/registration-status?invite=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      registrationOpen: boolean;
      reason: string;
    };
    expect(data.registrationOpen).toBe(false);
    expect(data.reason).toBe("invalid_invite");
  });

  it("returns open for valid invite", async () => {
    // Create admin to create invite (factory generates unique email)
    const admin = await createUser({ isAdmin: true });

    // Create valid invite with unique code
    const db = getDbClient();
    const inviteCode = `VALID${crypto.randomUUID().slice(0, 27)}`;
    const inviteEmail = `invite-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await db`
      INSERT INTO invites (code, email, role, expires_at, created_by_user_id)
      VALUES (${inviteCode}, ${inviteEmail}, 'viewer', NOW() + INTERVAL '7 days', ${admin.id})
    `;

    const res = await app.fetch(
      createRequestWithUniqueIp(
        `http://localhost/api/auth/registration-status?invite=${inviteCode}`,
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      registrationOpen: boolean;
      reason: string;
      email: string;
    };
    expect(data.registrationOpen).toBe(true);
    expect(data.reason).toBe("valid_invite");
    expect(data.email).toBe(inviteEmail);

    // Cleanup
    await cleanupUser(admin.id);
  });

  it("returns closed for used invite", async () => {
    // Create admin and invited user (factory generates unique emails)
    const admin = await createUser({ isAdmin: true });
    const invitedUser = await createUser();

    // Create used invite with unique code
    const db = getDbClient();
    const inviteCode = `USED${crypto.randomUUID().slice(0, 28)}`;
    await db`
      INSERT INTO invites (code, email, role, expires_at, created_by_user_id, used_at, used_by_user_id)
      VALUES (${inviteCode}, ${invitedUser.email}, 'viewer', NOW() + INTERVAL '7 days', ${admin.id}, NOW(), ${invitedUser.id})
    `;

    const res = await app.fetch(
      createRequestWithUniqueIp(
        `http://localhost/api/auth/registration-status?invite=${inviteCode}`,
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      registrationOpen: boolean;
      reason: string;
    };
    expect(data.registrationOpen).toBe(false);
    expect(data.reason).toBe("invite_used");

    // Cleanup
    await cleanupUser(admin.id);
    await cleanupUser(invitedUser.id);
  });

  it("returns closed for expired invite", async () => {
    // Create admin (factory generates unique email)
    const admin = await createUser({ isAdmin: true });

    // Create expired invite with unique code
    const db = getDbClient();
    const inviteCode = `EXPR${crypto.randomUUID().slice(0, 28)}`;
    const expiredEmail = `expired-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await db`
      INSERT INTO invites (code, email, role, expires_at, created_by_user_id)
      VALUES (${inviteCode}, ${expiredEmail}, 'viewer', NOW() - INTERVAL '1 day', ${admin.id})
    `;

    const res = await app.fetch(
      createRequestWithUniqueIp(
        `http://localhost/api/auth/registration-status?invite=${inviteCode}`,
      ),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      registrationOpen: boolean;
      reason: string;
    };
    expect(data.registrationOpen).toBe(false);
    expect(data.reason).toBe("invite_expired");

    // Cleanup
    await cleanupUser(admin.id);
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

// =============================================================================
// POST /change-password - Change current user's password
// =============================================================================

describe("POST /api/auth/change-password", () => {
  let userId: string | null = null;
  const originalPassword = "original-pass-123";
  const newPassword = "new-password-456";

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("requires authentication", async () => {
    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword,
        }),
      }),
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Unauthorized");
  });

  it("validates current password is required", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: "",
          newPassword: newPassword,
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toContain("required");
  });

  it("validates new password is required", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: "",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toContain("required");
  });

  it("validates new password minimum length", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: "short",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toContain("at least 8");
  });

  it("rejects same password", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: originalPassword,
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Bad Request");
    expect(data.message).toContain("different");
  });

  it("rejects incorrect current password", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: "wrong-password",
          newPassword: newPassword,
        }),
      }),
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Unauthorized");
    expect(data.message).toContain("incorrect");
  });

  it("successfully changes password", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    const res = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as SuccessResponse;
    expect(data.success).toBe(true);
    expect(data.message).toBeDefined();
  });

  it("can login with new password after change", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    // Change password
    const changeRes = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword,
        }),
      }),
    );

    expect(changeRes.status).toBe(200);

    // Try to login with new password
    const loginRes = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          password: newPassword,
        }),
      }),
    );

    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as AuthResponse;
    expect(loginData.token).toBeDefined();
    expect(loginData.user.id).toBe(userId);
  });

  it("cannot login with old password after change", async () => {
    const user = await createUser({
      password: originalPassword,
    });
    userId = user.id;

    const authHeader = await getUserAuthHeader(userId, user.email);

    // Change password
    const changeRes = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword,
        }),
      }),
    );

    expect(changeRes.status).toBe(200);

    // Try to login with old password
    const loginRes = await app.fetch(
      createRequestWithUniqueIp("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          password: originalPassword,
        }),
      }),
    );

    expect(loginRes.status).toBe(401);
    const loginData = (await loginRes.json()) as ErrorResponse;
    expect(loginData.error).toBe("Unauthorized");
    expect(loginData.message).toBe("Invalid credentials");
  });
});
