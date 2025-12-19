// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { auth } from "./auth";
import { signToken } from "../utils/jwt";
import type { AuthEnv } from "../types/auth";
import { uniqueIp, createRequestWithUniqueIp } from "../test-helpers";

// Response types
interface ErrorResponse {
  error: string;
  message: string;
}

interface LogoutResponse {
  success: boolean;
}

// Create test app
function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api/auth", auth);
  return app;
}

// Helper to create auth header with unique IP (specific to rate limiting tests)
async function getAuthHeader(
  userId: string,
  email: string,
  isAdmin = false,
): Promise<{ Authorization: string; "X-Forwarded-For": string }> {
  const token = await signToken({ sub: userId, email, isAdmin });
  return { Authorization: `Bearer ${token}`, "X-Forwarded-For": uniqueIp() };
}

describe("Auth Routes", () => {
  describe("POST /api/auth/register/options", () => {
    it("returns 400 for missing email", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp(
          "http://localhost/api/auth/register/options",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
      expect(data.message).toBe("Invalid email format");
    });

    it("returns 400 for invalid email format", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp(
          "http://localhost/api/auth/register/options",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "not-an-email" }),
          },
        ),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Invalid email format");
    });
  });

  describe("POST /api/auth/register/verify", () => {
    it("returns 400 for missing email", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: {} }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Bad Request");
    });

    it("returns 400 for missing credential", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com" }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when no challenge exists", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            credential: { id: "test" },
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Challenge expired or not found");
    });
  });

  describe("POST /api/auth/login/options", () => {
    it("returns 400 for missing email", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/login/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Invalid email format");
    });

    it("returns 400 for invalid email format", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/login/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid" }),
        }),
      );
      expect(res.status).toBe(400);
    });

    // Note: Testing "returns generic auth error for non-existent user"
    // requires a database connection. Skipped in unit tests.
  });

  describe("POST /api/auth/login/verify", () => {
    it("returns 400 for missing email", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/login/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: {} }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when no challenge exists", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/login/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            credential: { id: "test" },
          }),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Challenge expired or not found");
    });
  });

  describe("POST /api/auth/passkeys/options", () => {
    it("returns 401 without auth token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp(
          "http://localhost/api/auth/passkeys/options",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/passkeys/verify", () => {
    it("returns 401 without auth token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/passkeys/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: {} }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing credential with valid auth", async () => {
      const app = createTestApp();
      const authHeader = await getAuthHeader("user-123", "test@example.com");
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/passkeys/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.message).toBe("Missing credential");
    });
  });

  describe("GET /api/auth/passkeys", () => {
    it("returns 401 without auth token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/passkeys", {
          method: "GET",
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/auth/passkeys/:id", () => {
    it("returns 401 without auth token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp(
          "http://localhost/api/auth/passkeys/some-id",
          {
            method: "DELETE",
          },
        ),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/me", {
          method: "GET",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/me", {
          method: "GET",
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("returns success", async () => {
      const app = createTestApp();
      const res = await app.fetch(
        createRequestWithUniqueIp("http://localhost/api/auth/logout", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as LogoutResponse;
      expect(data.success).toBe(true);
    });
  });

  describe("Rate Limiting", () => {
    it("returns 429 after too many requests from same IP", async () => {
      const app = createTestApp();
      const testIp = "192.168.99.99"; // Use specific IP for this test

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
});
