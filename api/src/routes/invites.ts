import { Hono } from "hono";
import { getDbClient } from "../db/client";
import { requireAdmin } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";
import type { InviteRow, Role } from "../types/rbac";
import { toInvite } from "../types/rbac";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// GET /api/invites - List all invites (admin only)
// =============================================================================
invites.get("/", requireAdmin, async (c) => {
  const db = getDbClient();

  // Fetch all invites with trip counts
  const inviteRows = await db<(InviteRow & { trip_count: string })[]>`
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
    return c.json({ error: "Not Found", message: "Invite not found" }, 404);
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

export { invites };
