// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, spyOn, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import {
  requireAuth,
  requireAdmin,
  optionalAuth,
  checkTripAccess,
  requireEditor,
  requireViewer,
} from "./auth";
import type { AuthEnv } from "../types/auth";
import * as dbClient from "../db/client";
import {
  getAdminAuthHeader,
  getUserAuthHeader,
  uniqueIp,
} from "../test-helpers";

interface UserResponse {
  userId: string;
  email?: string;
  isAdmin?: boolean;
}

interface OptionalResponse {
  authenticated: boolean;
  userId: string | null;
}

interface ErrorResponse {
  error: string;
  message: string;
}

interface SuccessResponse {
  success: boolean;
}

// Test app setup for basic auth middleware
function createTestApp() {
  const app = new Hono<AuthEnv>();

  app.get("/protected", requireAuth, (c) => {
    const user = c.var.user!;
    return c.json({ userId: user.id, email: user.email });
  });

  app.get("/admin", requireAdmin, (c) => {
    const user = c.var.user!;
    return c.json({ userId: user.id, isAdmin: user.isAdmin });
  });

  app.get("/optional", optionalAuth, (c) => {
    const user = c.var.user;
    return c.json({ authenticated: !!user, userId: user?.id ?? null });
  });

  return app;
}

// Test app setup for RBAC middleware
function createRbacTestApp() {
  const app = new Hono<AuthEnv>();

  // Apply requireAuth first, then RBAC middleware
  app.get("/trips/:id/view", requireAuth, requireViewer, (c) => {
    return c.json({ success: true });
  });

  app.post("/trips/:id/edit", requireAuth, requireEditor, (c) => {
    return c.json({ success: true });
  });

  app.get(
    "/custom/:tripId/view",
    requireAuth,
    checkTripAccess("viewer", (c) => c.req.param("tripId")),
    (c) => {
      return c.json({ success: true });
    },
  );

  return app;
}

describe("Auth Middleware", () => {
  describe("requireAuth", () => {
    it("returns 401 without token", async () => {
      const app = createTestApp();
      const res = await app.fetch(new Request("http://localhost/protected"));
      expect(res.status).toBe(401);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 with malformed header", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Basic invalid" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );
      expect(res.status).toBe(401);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Invalid or expired token");
    });

    it("succeeds with valid token", async () => {
      const app = createTestApp();
      const headers = await getUserAuthHeader("user-123", "test@example.com");
      const res = await app.fetch(
        new Request("http://localhost/protected", { headers }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as UserResponse;
      expect(data.userId).toBe("user-123");
      expect(data.email).toBe("test@example.com");
    });
  });

  describe("requireAdmin", () => {
    it("returns 401 without token", async () => {
      const app = createTestApp();
      const res = await app.fetch(new Request("http://localhost/admin"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      const app = createTestApp();
      const headers = await getUserAuthHeader("user-123", "test@example.com");
      const res = await app.fetch(
        new Request("http://localhost/admin", { headers }),
      );
      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toBe("Admin access required");
    });

    it("succeeds for admin user", async () => {
      const app = createTestApp();
      const headers = await getAdminAuthHeader(
        "admin-123",
        "admin@example.com",
      );
      const res = await app.fetch(
        new Request("http://localhost/admin", { headers }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as UserResponse;
      expect(data.isAdmin).toBe(true);
    });
  });

  describe("optionalAuth", () => {
    it("succeeds without token", async () => {
      const app = createTestApp();
      const res = await app.fetch(new Request("http://localhost/optional"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as OptionalResponse;
      expect(data.authenticated).toBe(false);
      expect(data.userId).toBeNull();
    });

    it("returns 401 with invalid token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        new Request("http://localhost/optional", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("sets user with valid token", async () => {
      const app = createTestApp();
      const headers = await getUserAuthHeader(
        "user-456",
        "optional@example.com",
      );
      const res = await app.fetch(
        new Request("http://localhost/optional", { headers }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as OptionalResponse;
      expect(data.authenticated).toBe(true);
      expect(data.userId).toBe("user-456");
    });
  });
});

describe("RBAC Middleware", () => {
  const testTripId = "550e8400-e29b-41d4-a716-446655440000";
  let dbSpy: ReturnType<typeof spyOn> | null = null;

  // Clean up mocks after each test
  afterEach(() => {
    if (dbSpy) {
      dbSpy.mockRestore();
      dbSpy = null;
    }
    mock.restore();
  });

  // Helper to create mock db client that returns specified role
  function mockDbWithRole(role: string | null) {
    const mockResult = role ? [{ role }] : [];
    const mockTaggedTemplate = () => Promise.resolve(mockResult);
    dbSpy = spyOn(dbClient, "getDbClient").mockReturnValue(
      mockTaggedTemplate as any,
    );
  }

  describe("Admin bypass", () => {
    it("allows admin access without trip_access record", async () => {
      // Admin bypass doesn't query DB, so no mock needed
      // But we mock it to return empty to prove bypass works
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const headers = await getAdminAuthHeader(
        "admin-123",
        "admin@example.com",
      );

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, { headers }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as SuccessResponse;
      expect(data.success).toBe(true);
    });

    it("allows admin to edit without trip_access record", async () => {
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const headers = await getAdminAuthHeader(
        "admin-123",
        "admin@example.com",
      );

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers,
        }),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("requireViewer", () => {
    it("returns 401 without auth token", async () => {
      const app = createRbacTestApp();
      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`),
      );
      expect(res.status).toBe(401);
    });

    it("allows viewer role to view", async () => {
      mockDbWithRole("viewer");

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "viewer@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, { headers }),
      );

      expect(res.status).toBe(200);
    });

    it("allows editor role to view (editor > viewer)", async () => {
      mockDbWithRole("editor");

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "editor@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, { headers }),
      );

      expect(res.status).toBe(200);
    });

    it("returns 403 for user without trip_access", async () => {
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "noone@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, { headers }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Viewer access required");
    });
  });

  describe("requireEditor", () => {
    it("allows editor role to edit", async () => {
      mockDbWithRole("editor");

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "editor@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers,
        }),
      );

      expect(res.status).toBe(200);
    });

    it("returns 403 for viewer role trying to edit", async () => {
      mockDbWithRole("viewer");

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "viewer@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toContain("Editor access required");
    });

    it("returns 403 for user without trip_access", async () => {
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "noone@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers,
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe("checkTripAccess with custom extractor", () => {
    it("extracts trip ID from custom param name", async () => {
      mockDbWithRole("viewer");

      const app = createRbacTestApp();
      const headers = await getUserAuthHeader("user-123", "viewer@example.com");

      const res = await app.fetch(
        new Request(`http://localhost/custom/${testTripId}/view`, { headers }),
      );

      expect(res.status).toBe(200);
    });
  });
});

// =============================================================================
// Protected Endpoints Auth Enforcement
// =============================================================================
// This comprehensive test verifies all protected endpoints return proper auth errors.
// Individual route files should NOT duplicate these tests.

import { Hono as HonoFull } from "hono";
import { trips } from "../routes/trips";
import { auth as authRoutes } from "../routes/auth";
import { invites } from "../routes/invites";
import { tripAccess } from "../routes/trip-access";
import { upload } from "../routes/upload";

// Mock R2 to use local filesystem
mock.module("../utils/r2", () => ({
  uploadToR2: async () => false,
  getFromR2: async () => null,
  isR2Available: () => false,
  deleteMultipleFromR2: async () => 0,
  PHOTOS_URL_PREFIX: "/api/photos/",
}));

// Create full test app with all routes
function createFullTestApp() {
  const app = new HonoFull<AuthEnv>();
  app.route("/api/auth", authRoutes);
  app.route("/api/trips", trips);
  app.route("/api/invites", invites);
  app.route("/api", tripAccess);
  app.route("/api", upload);
  return app;
}

const testUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("Protected Endpoints Auth Enforcement", () => {
  // Endpoints that require authentication (return 401 without token)
  const authRequiredEndpoints = [
    // Auth routes (requireAuth)
    {
      method: "POST",
      path: "/api/auth/passkeys/options",
      desc: "Generate passkey options",
    },
    {
      method: "POST",
      path: "/api/auth/passkeys/verify",
      desc: "Verify passkey",
    },
    { method: "GET", path: "/api/auth/passkeys", desc: "List passkeys" },
    {
      method: "DELETE",
      path: `/api/auth/passkeys/${testUuid}`,
      desc: "Delete passkey",
    },
    { method: "GET", path: "/api/auth/me", desc: "Get current user" },
    // Trip routes (requireAuth or requireAdmin)
    { method: "GET", path: "/api/trips", desc: "List trips" },
    {
      method: "GET",
      path: "/api/trips/slug/test-trip",
      desc: "Get trip by slug",
    },
    { method: "GET", path: "/api/trips/admin", desc: "Admin list trips" },
    {
      method: "GET",
      path: `/api/trips/id/${testUuid}`,
      desc: "Get trip by UUID",
    },
    { method: "POST", path: "/api/trips", desc: "Create trip" },
    { method: "PATCH", path: `/api/trips/${testUuid}`, desc: "Update trip" },
    { method: "DELETE", path: `/api/trips/${testUuid}`, desc: "Delete trip" },
    {
      method: "PATCH",
      path: `/api/trips/${testUuid}/protection`,
      desc: "Update trip protection",
    },
    {
      method: "DELETE",
      path: `/api/trips/photos/${testUuid}`,
      desc: "Delete photo",
    },
    // Trip access routes (requireAdmin)
    { method: "POST", path: "/api/trip-access", desc: "Grant trip access" },
    {
      method: "GET",
      path: `/api/trips/${testUuid}/access`,
      desc: "List trip access",
    },
    {
      method: "PATCH",
      path: `/api/trip-access/${testUuid}`,
      desc: "Update trip access",
    },
    {
      method: "DELETE",
      path: `/api/trip-access/${testUuid}`,
      desc: "Delete trip access",
    },
    { method: "GET", path: "/api/users", desc: "List users" },
    // Invite routes (requireAdmin)
    { method: "POST", path: "/api/invites", desc: "Create invite" },
    { method: "GET", path: "/api/invites", desc: "List invites" },
    {
      method: "DELETE",
      path: `/api/invites/${testUuid}`,
      desc: "Delete invite",
    },
    // Upload routes (requireAdmin)
    {
      method: "POST",
      path: `/api/trips/${testUuid}/photos/upload`,
      desc: "Upload photo",
    },
  ];

  describe("returns 401 without authentication", () => {
    authRequiredEndpoints.forEach(({ method, path, desc }) => {
      it(`${method} ${path} (${desc})`, async () => {
        const app = createFullTestApp();
        // Auth routes have rate limiting that requires proxy headers
        const headers: Record<string, string> = {};
        if (path.startsWith("/api/auth")) {
          headers["X-Forwarded-For"] = uniqueIp();
        }
        const res = await app.fetch(
          new Request(`http://localhost${path}`, { method, headers }),
        );
        expect(res.status).toBe(401);
      });
    });
  });

  // Endpoints that require admin (return 403 for non-admin users)
  const adminRequiredEndpoints = [
    // Trip routes (requireAdmin)
    { method: "GET", path: "/api/trips/admin", desc: "Admin list trips" },
    {
      method: "GET",
      path: `/api/trips/id/${testUuid}`,
      desc: "Get trip by UUID",
    },
    { method: "POST", path: "/api/trips", desc: "Create trip" },
    { method: "PATCH", path: `/api/trips/${testUuid}`, desc: "Update trip" },
    { method: "DELETE", path: `/api/trips/${testUuid}`, desc: "Delete trip" },
    {
      method: "PATCH",
      path: `/api/trips/${testUuid}/protection`,
      desc: "Update trip protection",
    },
    {
      method: "DELETE",
      path: `/api/trips/photos/${testUuid}`,
      desc: "Delete photo",
    },
    // Trip access routes (requireAdmin)
    { method: "POST", path: "/api/trip-access", desc: "Grant trip access" },
    {
      method: "GET",
      path: `/api/trips/${testUuid}/access`,
      desc: "List trip access",
    },
    {
      method: "PATCH",
      path: `/api/trip-access/${testUuid}`,
      desc: "Update trip access",
    },
    {
      method: "DELETE",
      path: `/api/trip-access/${testUuid}`,
      desc: "Delete trip access",
    },
    { method: "GET", path: "/api/users", desc: "List users" },
    // Invite routes (requireAdmin)
    { method: "POST", path: "/api/invites", desc: "Create invite" },
    { method: "GET", path: "/api/invites", desc: "List invites" },
    {
      method: "DELETE",
      path: `/api/invites/${testUuid}`,
      desc: "Delete invite",
    },
    // Upload routes (requireAdmin)
    {
      method: "POST",
      path: `/api/trips/${testUuid}/photos/upload`,
      desc: "Upload photo",
    },
  ];

  describe("returns 403 for non-admin users", () => {
    adminRequiredEndpoints.forEach(({ method, path, desc }) => {
      it(`${method} ${path} (${desc})`, async () => {
        const app = createFullTestApp();
        const headers = await getUserAuthHeader("user-123", "user@example.com");
        const res = await app.fetch(
          new Request(`http://localhost${path}`, { method, headers }),
        );
        expect(res.status).toBe(403);
      });
    });
  });
});
