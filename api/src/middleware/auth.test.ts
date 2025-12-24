// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, mock, beforeEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { requireAuth, requireAdmin, optionalAuth, checkTripAccess, requireEditor, requireViewer } from "./auth";
import { signToken } from "../utils/jwt";
import type { AuthEnv } from "../types/auth";
import * as dbClient from "../db/client";

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

  app.get("/custom/:tripId/view", requireAuth, checkTripAccess("viewer", (c) => c.req.param("tripId")), (c) => {
    return c.json({ success: true });
  });

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
      const token = await signToken({
        sub: "user-123",
        email: "test@example.com",
        isAdmin: false,
      });
      const res = await app.fetch(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${token}` },
        }),
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
      const token = await signToken({
        sub: "user-123",
        email: "test@example.com",
        isAdmin: false,
      });
      const res = await app.fetch(
        new Request("http://localhost/admin", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
      expect(data.message).toBe("Admin access required");
    });

    it("succeeds for admin user", async () => {
      const app = createTestApp();
      const token = await signToken({
        sub: "admin-123",
        email: "admin@example.com",
        isAdmin: true,
      });
      const res = await app.fetch(
        new Request("http://localhost/admin", {
          headers: { Authorization: `Bearer ${token}` },
        }),
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
      const token = await signToken({
        sub: "user-456",
        email: "optional@example.com",
        isAdmin: false,
      });
      const res = await app.fetch(
        new Request("http://localhost/optional", {
          headers: { Authorization: `Bearer ${token}` },
        }),
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

  // Helper to create mock db client that returns specified role
  function mockDbWithRole(role: string | null) {
    const mockResult = role ? [{ role }] : [];
    const mockTaggedTemplate = () => Promise.resolve(mockResult);
    spyOn(dbClient, "getDbClient").mockReturnValue(mockTaggedTemplate as any);
  }

  describe("Admin bypass", () => {
    it("allows admin access without trip_access record", async () => {
      // Admin bypass doesn't query DB, so no mock needed
      // But we mock it to return empty to prove bypass works
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const token = await signToken({
        sub: "admin-123",
        email: "admin@example.com",
        isAdmin: true,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as SuccessResponse;
      expect(data.success).toBe(true);
    });

    it("allows admin to edit without trip_access record", async () => {
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const token = await signToken({
        sub: "admin-123",
        email: "admin@example.com",
        isAdmin: true,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
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
      const token = await signToken({
        sub: "user-123",
        email: "viewer@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(200);
    });

    it("allows editor role to view (editor > viewer)", async () => {
      mockDbWithRole("editor");

      const app = createRbacTestApp();
      const token = await signToken({
        sub: "user-123",
        email: "editor@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(200);
    });

    it("returns 403 for user without trip_access", async () => {
      mockDbWithRole(null);

      const app = createRbacTestApp();
      const token = await signToken({
        sub: "user-123",
        email: "noone@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
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
      const token = await signToken({
        sub: "user-123",
        email: "editor@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(200);
    });

    it("returns 403 for viewer role trying to edit", async () => {
      mockDbWithRole("viewer");

      const app = createRbacTestApp();
      const token = await signToken({
        sub: "user-123",
        email: "viewer@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
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
      const token = await signToken({
        sub: "user-123",
        email: "noone@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/trips/${testTripId}/edit`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe("checkTripAccess with custom extractor", () => {
    it("extracts trip ID from custom param name", async () => {
      mockDbWithRole("viewer");

      const app = createRbacTestApp();
      const token = await signToken({
        sub: "user-123",
        email: "viewer@example.com",
        isAdmin: false,
      });

      const res = await app.fetch(
        new Request(`http://localhost/custom/${testTripId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(res.status).toBe(200);
    });
  });
});
