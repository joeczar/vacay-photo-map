import { Hono } from "hono";
import { getDbClient } from "../db/client";
import { requireAdmin } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";
import type { TripAccessRow } from "../types/rbac";
import { toTripAccess } from "../types/rbac";
import {
  isValidUUID,
  isValidRole,
  isUniqueViolation,
} from "../utils/validation";

// =============================================================================
// Routes
// =============================================================================

const tripAccess = new Hono<AuthEnv>();

// =============================================================================
// POST /api/trip-access - Grant access to user (admin only)
// =============================================================================
tripAccess.post("/trip-access", requireAdmin, async (c) => {
  const body = await c.req.json<{
    userId: string;
    tripId: string;
    role: string;
  }>();

  // Check required fields exist
  if (!body.userId || !body.tripId || !body.role) {
    return c.json(
      {
        error: "Bad Request",
        message: "userId, tripId, and role are required",
      },
      400,
    );
  }

  // Validate userId UUID
  if (!isValidUUID(body.userId)) {
    return c.json(
      { error: "Bad Request", message: "Invalid user ID format" },
      400,
    );
  }

  // Validate tripId UUID
  if (!isValidUUID(body.tripId)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format" },
      400,
    );
  }

  // Validate role
  if (!isValidRole(body.role)) {
    return c.json(
      {
        error: "Bad Request",
        message: "Role must be either 'editor' or 'viewer'",
      },
      400,
    );
  }

  const db = getDbClient();
  const currentUser = c.var.user!;

  // Check if user exists
  const userCheck = await db<{ id: string; is_admin: boolean }[]>`
    SELECT id, is_admin FROM user_profiles WHERE id = ${body.userId}
  `;

  if (userCheck.length === 0) {
    return c.json({ error: "Not Found", message: "User not found" }, 404);
  }

  // Prevent granting access to admins (they have implicit access to everything)
  if (userCheck[0].is_admin) {
    return c.json(
      {
        error: "Bad Request",
        message:
          "Cannot grant trip access to admin users (they have implicit access to all trips)",
      },
      400,
    );
  }

  // Check if trip exists
  const tripCheck = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${body.tripId}
  `;

  if (tripCheck.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  try {
    // Insert trip access
    const [row] = await db<TripAccessRow[]>`
      INSERT INTO trip_access (user_id, trip_id, role, granted_by_user_id)
      VALUES (${body.userId}, ${body.tripId}, ${body.role}, ${currentUser.id})
      RETURNING id, user_id, trip_id, role, granted_at, granted_by_user_id
    `;

    const tripAccess = toTripAccess(row);

    return c.json({ tripAccess }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        {
          error: "Conflict",
          message:
            "User already has access to this trip. Use PATCH to update their role.",
        },
        409,
      );
    }
    throw error;
  }
});

// =============================================================================
// GET /api/trips/:tripId/access - List users with access to trip (admin only)
// =============================================================================
tripAccess.get("/trips/:tripId/access", requireAdmin, async (c) => {
  const tripId = c.req.param("tripId");

  // Validate UUID
  if (!isValidUUID(tripId)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip ID format" },
      400,
    );
  }

  const db = getDbClient();

  // Check if trip exists
  const tripCheck = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `;

  if (tripCheck.length === 0) {
    return c.json({ error: "Not Found", message: "Trip not found" }, 404);
  }

  // Fetch all users with access to this trip
  // Join with user_profiles to get email and display_name
  const rows = await db<
    (TripAccessRow & { email: string; display_name: string | null })[]
  >`
    SELECT
      ta.id, ta.user_id, ta.trip_id, ta.role, ta.granted_at, ta.granted_by_user_id,
      up.email, up.display_name
    FROM trip_access ta
    JOIN user_profiles up ON up.id = ta.user_id
    WHERE ta.trip_id = ${tripId}
    ORDER BY ta.granted_at DESC
  `;

  const users = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    grantedAt: row.granted_at,
    grantedByUserId: row.granted_by_user_id,
  }));

  return c.json({ users });
});

// =============================================================================
// PATCH /api/trip-access/:id - Update user's role (admin only)
// =============================================================================
tripAccess.patch("/trip-access/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ role: string }>();

  // Check required fields exist
  if (!body.role) {
    return c.json({ error: "Bad Request", message: "role is required" }, 400);
  }

  // Validate UUID
  if (!isValidUUID(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip access ID format" },
      400,
    );
  }

  // Validate role
  if (!isValidRole(body.role)) {
    return c.json(
      {
        error: "Bad Request",
        message: "Role must be either 'editor' or 'viewer'",
      },
      400,
    );
  }

  const db = getDbClient();

  // Update role - RETURNING will be empty if record doesn't exist
  const rows = await db<TripAccessRow[]>`
    UPDATE trip_access
    SET role = ${body.role}
    WHERE id = ${id}
    RETURNING id, user_id, trip_id, role, granted_at, granted_by_user_id
  `;

  if (rows.length === 0) {
    return c.json(
      { error: "Not Found", message: "Trip access record not found" },
      404,
    );
  }

  return c.json({ tripAccess: toTripAccess(rows[0]) });
});

// =============================================================================
// DELETE /api/trip-access/:id - Revoke access (admin only)
// =============================================================================
tripAccess.delete("/trip-access/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  // Validate UUID
  if (!isValidUUID(id)) {
    return c.json(
      { error: "Bad Request", message: "Invalid trip access ID format" },
      400,
    );
  }

  const db = getDbClient();

  // Delete and check if record existed - RETURNING will be empty if not found
  const deleted = await db<{ id: string }[]>`
    DELETE FROM trip_access WHERE id = ${id} RETURNING id
  `;

  if (deleted.length === 0) {
    return c.json(
      { error: "Not Found", message: "Trip access record not found" },
      404,
    );
  }

  return c.json({ success: true, message: "Trip access revoked" });
});

// =============================================================================
// GET /api/users - List all users (admin only)
// =============================================================================
tripAccess.get("/users", requireAdmin, async (c) => {
  const db = getDbClient();

  const users = await db<
    {
      id: string;
      email: string;
      display_name: string | null;
      is_admin: boolean;
    }[]
  >`
    SELECT id, email, display_name, is_admin
    FROM user_profiles
    ORDER BY email ASC
  `;

  return c.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      isAdmin: u.is_admin,
    })),
  });
});

export { tripAccess };
