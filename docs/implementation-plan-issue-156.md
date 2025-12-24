# Implementation Plan: Invite Management API

**Issue:** #156
**Branch:** `feature/issue-156-invite-management-api`
**Complexity:** Medium
**Total Commits:** 5

## Overview

Implement a complete invite management API that allows admins to create, list, validate, and revoke trip access invitations. The system generates cryptographically secure 192-bit invite codes, enforces 7-day expiration, validates email addresses, prevents duplicates for pending invites, and includes rate limiting on the public validation endpoint to prevent abuse.

## Prerequisites

- [x] Database schema exists (created in issue #155)
- [x] RBAC types exist in `/api/src/types/rbac.ts`
- [x] Auth middleware exists (`requireAuth`, `requireAdmin`)
- [x] Rate limiting pattern exists in `auth.ts`

## Architecture

### Components
- `invites.ts` - New Hono router for all invite endpoints
- Token generation utility - Cryptographically secure 192-bit random tokens
- Rate limiting - Reusable rate limiter for validation endpoint (5 req/min per IP)

### Data Flow
```
Admin creates invite → Generate 192-bit token → Validate email → Check duplicates →
Insert invite + trip assignments → Return invite + code

User validates code → Rate limit check → Query invite + trips → Return status

Admin lists invites → Query all invites with trip counts → Return list

Admin revokes invite → Check ownership → Soft delete (mark used) → Return success
```

### Database Tables (Already Exist)
- `invites` - Core invite records with code, email, role, expiration
- `invite_trip_access` - Junction table linking invites to trips

## Atomic Commits

Each commit is independently testable and leaves the codebase in a working state.

---

### Commit 1: Create invite routes file with token generation and POST endpoint

**Type:** feat
**Scope:** api
**Message:** `feat(api): add invite creation endpoint with secure token generation`

**Files:**
- `api/src/routes/invites.ts` - Create
- `api/src/index.ts` - Modify

**Changes:**

1. **Create `/api/src/routes/invites.ts`** with:

```typescript
import { Hono } from "hono";
import { getDbClient } from "../db/client";
import { requireAdmin } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";
import type {
  InviteRow,
  InviteTripAccessRow,
  toInvite,
  Role,
} from "../types/rbac";

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Generate cryptographically secure 192-bit invite code
 * Uses crypto.getRandomValues for true randomness
 * Encodes as URL-safe base64 (- and _ instead of + and /)
 */
function generateInviteCode(): string {
  const buffer = new Uint8Array(24); // 192 bits = 24 bytes
  crypto.getRandomValues(buffer);
  const binary = String.fromCharCode(...buffer);
  const base64 = btoa(binary);
  // Make URL-safe: replace + with -, / with _, remove padding =
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// =============================================================================
// Validation Helpers
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_REGEX.test(email);
}

function isValidRole(role: string): role is Role {
  return role === "editor" || role === "viewer";
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Check if error is a unique constraint violation
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

// =============================================================================
// Routes
// =============================================================================

const invites = new Hono<AuthEnv>();

// =============================================================================
// POST /api/invites - Create invite (admin only)
// =============================================================================
invites.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<{
    email: string;
    role: string;
    tripIds: string[];
  }>();

  const { email, role, tripIds } = body;

  // Validate email
  if (!isValidEmail(email)) {
    return c.json(
      { error: "Bad Request", message: "Valid email is required" },
      400,
    );
  }

  // Validate role
  if (!isValidRole(role)) {
    return c.json(
      {
        error: "Bad Request",
        message: "Role must be either 'editor' or 'viewer'",
      },
      400,
    );
  }

  // Validate tripIds array
  if (!Array.isArray(tripIds) || tripIds.length === 0) {
    return c.json(
      {
        error: "Bad Request",
        message: "At least one trip ID is required",
      },
      400,
    );
  }

  // Validate all trip IDs are UUIDs
  for (const tripId of tripIds) {
    if (!isValidUUID(tripId)) {
      return c.json(
        {
          error: "Bad Request",
          message: `Invalid trip ID format: ${tripId}`,
        },
        400,
      );
    }
  }

  const db = getDbClient();
  const currentUser = c.var.user!;

  // Check for existing pending invite with same email
  const existingInvites = await db<InviteRow[]>`
    SELECT id, code, email, role, expires_at, used_at
    FROM invites
    WHERE email = ${email.toLowerCase()}
      AND used_at IS NULL
      AND expires_at > NOW()
  `;

  if (existingInvites.length > 0) {
    return c.json(
      {
        error: "Conflict",
        message: "An active invite already exists for this email",
      },
      409,
    );
  }

  // Verify all trips exist (prevents creating invalid invite)
  const tripCheck = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ANY(${tripIds})
  `;

  if (tripCheck.length !== tripIds.length) {
    return c.json(
      {
        error: "Bad Request",
        message: "One or more trip IDs do not exist",
      },
      400,
    );
  }

  // Generate secure invite code
  const code = generateInviteCode();

  // Set expiration to 7 days from now
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    // Create invite and trip assignments in a transaction
    const result = await db.begin(async (tx) => {
      // Insert invite
      const [invite] = await tx<InviteRow[]>`
        INSERT INTO invites (code, created_by_user_id, email, role, expires_at)
        VALUES (
          ${code},
          ${currentUser.id},
          ${email.toLowerCase()},
          ${role},
          ${expiresAt}
        )
        RETURNING id, code, created_by_user_id, email, role, expires_at,
                  used_at, used_by_user_id, created_at, updated_at
      `;

      // Insert trip access assignments
      const tripAccessRows = tripIds.map((tripId) => ({
        invite_id: invite.id,
        trip_id: tripId,
      }));

      await tx`
        INSERT INTO invite_trip_access ${tx(tripAccessRows)}
      `;

      return invite;
    });

    const inviteResponse = toInvite(result);

    return c.json(
      {
        invite: inviteResponse,
        tripIds,
      },
      201,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Extremely unlikely (192-bit collision), but handle gracefully
      return c.json(
        {
          error: "Internal Error",
          message: "Failed to generate unique invite code, please retry",
        },
        500,
      );
    }
    throw error;
  }
});

export { invites };
```

2. **Modify `/api/src/index.ts`** to register the invites route:

```typescript
// Add import at top
import { invites } from './routes/invites'

// Add route registration after other routes
app.route('/api/invites', invites)
```

**Acceptance Criteria:**
- [ ] Token generation produces 32-character URL-safe base64 strings
- [ ] POST /api/invites requires admin authentication
- [ ] Email validation rejects invalid formats
- [ ] Duplicate pending invites are rejected with 409
- [ ] All trip IDs are validated before insert
- [ ] Invite + trip assignments created atomically
- [ ] Response includes invite object and trip IDs
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 2: Add GET /api/invites (list) endpoint

**Type:** feat
**Scope:** api
**Message:** `feat(api): add invite listing endpoint for admins`

**Files:**
- `api/src/routes/invites.ts` - Modify

**Changes:**

Add the list endpoint to `invites.ts`:

```typescript
// Add this interface near the top with other types
interface InviteListItem {
  id: string;
  code: string;
  email: string | null;
  role: Role;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tripCount: number;
  status: "pending" | "used" | "expired";
}

// Add this route after the POST endpoint
// =============================================================================
// GET /api/invites - List all invites (admin only)
// =============================================================================
invites.get("/", requireAdmin, async (c) => {
  const db = getDbClient();

  // Fetch all invites with trip counts
  const inviteRows = await db<
    (InviteRow & { trip_count: string })[]
  >`
    SELECT
      i.id, i.code, i.created_by_user_id, i.email, i.role,
      i.expires_at, i.used_at, i.used_by_user_id,
      i.created_at, i.updated_at,
      COUNT(ita.trip_id)::text as trip_count
    FROM invites i
    LEFT JOIN invite_trip_access ita ON ita.invite_id = i.id
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `;

  const now = new Date();

  const inviteList: InviteListItem[] = inviteRows.map((row) => {
    const invite = toInvite(row);

    // Determine status
    let status: "pending" | "used" | "expired";
    if (invite.usedAt) {
      status = "used";
    } else if (invite.expiresAt < now) {
      status = "expired";
    } else {
      status = "pending";
    }

    return {
      ...invite,
      tripCount: parseInt(row.trip_count, 10),
      status,
    };
  });

  return c.json({
    invites: inviteList,
  });
});
```

**Acceptance Criteria:**
- [ ] GET /api/invites requires admin authentication
- [ ] Returns all invites ordered by creation date (newest first)
- [ ] Each invite includes trip count
- [ ] Status calculated correctly (pending/used/expired)
- [ ] Empty array returned when no invites exist
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 3: Add DELETE /api/invites/:id endpoint

**Type:** feat
**Scope:** api
**Message:** `feat(api): add invite revocation endpoint`

**Files:**
- `api/src/routes/invites.ts` - Modify

**Changes:**

Add the delete endpoint to `invites.ts`:

```typescript
// Add this route after the GET / endpoint
// =============================================================================
// DELETE /api/invites/:id - Revoke invite (admin only)
// =============================================================================
/**
 * Revoke a pending invite by marking it as used
 * This prevents the code from being accepted while maintaining audit trail
 * Only pending (unused, unexpired) invites can be revoked
 */
invites.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  // Validate UUID format
  if (!isValidUUID(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid invite ID format" },
      400,
    );
  }

  const db = getDbClient();

  // Check if invite exists and is pending
  const inviteCheck = await db<InviteRow[]>`
    SELECT id, used_at, expires_at
    FROM invites
    WHERE id = ${id}
  `;

  if (inviteCheck.length === 0) {
    return c.json(
      { error: "Not Found", message: "Invite not found" },
      404,
    );
  }

  const invite = inviteCheck[0];

  // Check if already used
  if (invite.used_at) {
    return c.json(
      {
        error: "Bad Request",
        message: "Cannot revoke an invite that has already been used",
      },
      400,
    );
  }

  // Check if already expired
  if (invite.expires_at < new Date()) {
    return c.json(
      {
        error: "Bad Request",
        message: "Cannot revoke an expired invite (already inactive)",
      },
      400,
    );
  }

  // Mark invite as used (soft delete - maintains audit trail)
  await db`
    UPDATE invites
    SET used_at = NOW()
    WHERE id = ${id}
  `;

  return c.json({ success: true });
});
```

**Acceptance Criteria:**
- [ ] DELETE /api/invites/:id requires admin authentication
- [ ] Invalid UUID format returns 400
- [ ] Non-existent invite returns 404
- [ ] Already-used invite returns 400
- [ ] Expired invite returns 400
- [ ] Pending invite is marked as used (soft delete)
- [ ] Returns success response
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 4: Add GET /api/invites/validate/:token with rate limiting

**Type:** feat
**Scope:** api
**Message:** `feat(api): add invite validation endpoint with rate limiting`

**Files:**
- `api/src/routes/invites.ts` - Modify

**Changes:**

Add rate limiting and validation endpoint to `invites.ts`:

```typescript
// Add after the imports at the top
import { getConnInfo } from "hono/bun";

// Add rate limiting implementation after validation helpers
// =============================================================================
// Rate Limiting for Validation Endpoint
// =============================================================================
// SECURITY: Prevents brute-force guessing of invite codes
// Limit: 5 validation attempts per minute per IP

const VALIDATION_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const VALIDATION_RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per minute

const validationRateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

// Cleanup rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of validationRateLimitMap.entries()) {
    if (now > entry.resetAt) {
      validationRateLimitMap.delete(key);
    }
  }
}, VALIDATION_RATE_LIMIT_WINDOW_MS);

function checkValidationRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = validationRateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    validationRateLimitMap.set(ip, {
      count: 1,
      resetAt: now + VALIDATION_RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (entry.count >= VALIDATION_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Extract client IP address for rate limiting
 * Follows same pattern as auth.ts
 */
function getClientIp(c: any): string {
  const trustedProxy = process.env.TRUSTED_PROXY === "true";

  if (trustedProxy) {
    const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = c.req.header("x-real-ip");
    return forwardedFor || realIp || "unknown";
  }

  try {
    const connInfo = getConnInfo(c);
    return connInfo.remote.address || "unknown";
  } catch {
    return (
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown"
    );
  }
}

// Add this route before the DELETE endpoint (route ordering matters)
// =============================================================================
// GET /api/invites/validate/:token - Validate invite token (public, rate-limited)
// =============================================================================
/**
 * Public endpoint to validate an invite code
 * Returns invite details and associated trips if valid
 * Rate limited to 5 requests/minute per IP to prevent brute force
 */
invites.get("/validate/:token", async (c) => {
  const token = c.req.param("token");

  // Rate limiting
  const ip = getClientIp(c);
  if (!checkValidationRateLimit(ip)) {
    return c.json(
      {
        error: "Too Many Requests",
        message: "Too many validation attempts. Please try again later.",
      },
      429,
    );
  }

  // Validate token format (should be 32 characters, URL-safe base64)
  if (!token || token.length !== 32 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return c.json(
      {
        error: "Bad Request",
        message: "Invalid invite code format",
      },
      400,
    );
  }

  const db = getDbClient();

  // Find invite with trip assignments
  const inviteRows = await db<InviteRow[]>`
    SELECT id, code, created_by_user_id, email, role,
           expires_at, used_at, used_by_user_id,
           created_at, updated_at
    FROM invites
    WHERE code = ${token}
  `;

  if (inviteRows.length === 0) {
    return c.json(
      {
        valid: false,
        reason: "not_found",
        message: "Invalid invite code",
      },
      404,
    );
  }

  const inviteRow = inviteRows[0];
  const invite = toInvite(inviteRow);

  // Check if already used
  if (invite.usedAt) {
    return c.json({
      valid: false,
      reason: "already_used",
      message: "This invite has already been used",
    });
  }

  // Check if expired
  if (invite.expiresAt < new Date()) {
    return c.json({
      valid: false,
      reason: "expired",
      message: "This invite has expired",
    });
  }

  // Fetch associated trips
  const tripAccessRows = await db<InviteTripAccessRow[]>`
    SELECT id, invite_id, trip_id, created_at
    FROM invite_trip_access
    WHERE invite_id = ${invite.id}
  `;

  const tripIds = tripAccessRows.map((row) => row.trip_id);

  // Fetch trip details for display
  const trips = await db<{ id: string; slug: string; title: string }[]>`
    SELECT id, slug, title
    FROM trips
    WHERE id = ANY(${tripIds})
  `;

  return c.json({
    valid: true,
    invite: {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
    trips: trips.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
    })),
  });
});
```

**Acceptance Criteria:**
- [ ] GET /api/invites/validate/:token is public (no auth required)
- [ ] Rate limiting enforces 5 requests/minute per IP
- [ ] Invalid token format returns 400
- [ ] Non-existent code returns 404 with valid:false
- [ ] Used invite returns valid:false with reason
- [ ] Expired invite returns valid:false with reason
- [ ] Valid invite returns invite details + trip list
- [ ] IP extraction follows same pattern as auth.ts
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 5: Add comprehensive tests for invite endpoints

**Type:** test
**Scope:** api
**Message:** `test(api): add comprehensive tests for invite management`

**Files:**
- `api/src/routes/invites.test.ts` - Create

**Changes:**

Create comprehensive test suite following the pattern from `trips.test.ts`:

```typescript
// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { invites } from "./invites";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import { getAdminAuthHeader, getUserAuthHeader } from "../test-helpers";

// Response types
interface ErrorResponse {
  error: string;
  message: string;
}

interface CreateInviteRequest {
  email: string;
  role: "editor" | "viewer";
  tripIds: string[];
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
  // Setup: Create a test trip for invite assignments
  beforeAll(async () => {
    const db = getDbClient();
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (slug, title, is_public)
      VALUES ('test-trip-for-invites', 'Test Trip for Invites', true)
      RETURNING id
    `;
    testTripId = trip.id;
  });

  // Cleanup: Delete test trip
  afterAll(async () => {
    const db = getDbClient();
    await db`DELETE FROM trips WHERE id = ${testTripId}`;
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
      expect(data.message).toContain("email");
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
      expect(data.message).toContain("role");
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
      expect(data.message).toContain("trip");
    });

    it("creates invite successfully for admin", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const email = `test-${Date.now()}@example.com`;

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
      expect(data.invite.email).toBe(email);
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

    it("returns 404 for non-existent token", async () => {
      const app = createTestApp();
      // Valid format but doesn't exist
      const fakeToken = "A".repeat(32);
      const res = await app.fetch(
        new Request(`http://localhost/api/invites/validate/${fakeToken}`, {
          method: "GET",
        }),
      );
      expect(res.status).toBe(404);
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
      expect(validateData.invite?.email).toBe(email);
      expect(validateData.trips).toHaveLength(1);

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
```

**Acceptance Criteria:**
- [ ] All POST /api/invites tests pass (auth, validation, creation, duplicates)
- [ ] All GET /api/invites tests pass (auth, list functionality)
- [ ] All DELETE /api/invites/:id tests pass (auth, validation, revocation)
- [ ] All GET /api/invites/validate/:token tests pass (validation, rate limiting)
- [ ] Rate limiting test verifies 5 req/min limit
- [ ] Test suite follows existing patterns from trips.test.ts
- [ ] All tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

## Testing Strategy

Tests are included in Commit 5 following the TDD-adjacent approach:
1. Commits 1-4: Implement features with clear acceptance criteria
2. Commit 5: Comprehensive test suite validates all functionality
3. Each commit should be manually testable before final test suite

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes (`pnpm test`)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Manual verification:
  - [ ] Create invite returns 32-char code
  - [ ] Duplicate email rejected
  - [ ] List shows all invites with counts
  - [ ] Revoke marks invite as used
  - [ ] Validate returns correct status
  - [ ] Rate limiting blocks after 5 requests

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Token collision (192-bit) | Extremely unlikely (2^96 space), but unique constraint catches it |
| Rate limiting bypass via IP spoofing | Document TRUSTED_PROXY setting, warn in comments |
| Email enumeration via duplicate check | Timing should be consistent, but accept minor info leakage for UX |
| Expired invites accumulating | Future: Add cleanup job (not in this issue) |

## Open Questions

None - all requirements are well-defined.

## Notes

- **Token format**: 192 bits = 24 bytes → base64 = 32 characters (URL-safe)
- **Expiration**: 7 days = `7 * 24 * 60 * 60 * 1000` milliseconds
- **Rate limiting**: Follows auth.ts pattern, uses in-memory Map (fine for single-instance)
- **Soft delete**: Revoke marks `used_at` instead of DELETE (maintains audit trail)
- **Email case**: Normalized to lowercase for duplicate checks
- **Route ordering**: `/validate/:token` must come before `/:id` in Hono routing
