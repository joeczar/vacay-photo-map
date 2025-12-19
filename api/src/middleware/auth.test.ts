// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { requireAuth, requireAdmin, optionalAuth } from "./auth";
import { signToken } from "../utils/jwt";
import type { AuthEnv } from "../types/auth";

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

// Test app setup
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
