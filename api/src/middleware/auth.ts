import { createMiddleware } from "hono/factory";
import { verifyToken } from "../utils/jwt";
import { getDbClient } from "../db/client";
import type { AuthEnv, AuthUser } from "../types/auth";
import type { Role, TripAccessRow } from "../types/rbac";

/**
 * Extract Bearer token from Authorization header (case-insensitive)
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * Log authentication failure for security monitoring
 * Never logs the actual token to prevent credential leakage
 */
function logAuthFailure(error: unknown, path: string): void {
  console.error("[AUTH] Token verification failed:", {
    error: error instanceof Error ? error.message : "Unknown error",
    path,
  });
}

/**
 * Verify token and create AuthUser object
 * @throws Error if token is invalid or expired
 */
async function authenticateToken(token: string): Promise<AuthUser> {
  const payload = await verifyToken(token);
  return {
    id: payload.sub,
    email: payload.email,
    isAdmin: payload.isAdmin,
  };
}

/**
 * Middleware that requires a valid JWT token
 * Returns 401 if token is missing or invalid
 * Sets `c.var.user` with authenticated user data
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization"));

  if (!token) {
    return c.json(
      { error: "Unauthorized", message: "Missing authentication token" },
      401,
    );
  }

  try {
    const user = await authenticateToken(token);
    c.set("user", user);
    await next();
  } catch (error) {
    logAuthFailure(error, c.req.path);
    return c.json(
      { error: "Unauthorized", message: "Invalid or expired token" },
      401,
    );
  }
});

/**
 * Middleware that requires a valid JWT with admin privileges
 * Returns 401 if token is missing/invalid, 403 if user is not admin
 * Sets `c.var.user` with authenticated user data
 */
export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization"));

  if (!token) {
    return c.json(
      { error: "Unauthorized", message: "Missing authentication token" },
      401,
    );
  }

  try {
    const user = await authenticateToken(token);

    if (!user.isAdmin) {
      return c.json(
        { error: "Forbidden", message: "Admin access required" },
        403,
      );
    }

    c.set("user", user);
    await next();
  } catch (error) {
    logAuthFailure(error, c.req.path);
    return c.json(
      { error: "Unauthorized", message: "Invalid or expired token" },
      401,
    );
  }
});

/**
 * Middleware that optionally parses JWT if present
 * Does NOT fail if token is missing - continues without user context
 * Fails with 401 only if token IS present but invalid
 * Sets `c.var.user` if valid token exists, undefined otherwise
 */
export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization"));

  if (!token) {
    await next();
    return;
  }

  try {
    const user = await authenticateToken(token);
    c.set("user", user);
    await next();
  } catch (error) {
    logAuthFailure(error, c.req.path);
    return c.json(
      { error: "Unauthorized", message: "Invalid or expired token" },
      401,
    );
  }
});

// =============================================================================
// RBAC Middleware for Trip Access Control
// =============================================================================

/**
 * Check if user has access to a trip with minimum required role
 * Admins always have access (bypass trip_access table)
 *
 * Note: Does not verify trip existence. Non-existent trips return false
 * (same as insufficient access) to prevent information leakage about which
 * trips exist. Route handlers should verify trip existence after access check.
 *
 * @returns true if user has access, false otherwise
 */
async function userHasTripAccess(
  userId: string,
  tripId: string,
  isAdmin: boolean,
  minRole: Role,
): Promise<boolean> {
  // Admins bypass all checks
  if (isAdmin) {
    return true;
  }

  const db = getDbClient();
  const result = await db<TripAccessRow[]>`
    SELECT role FROM trip_access
    WHERE user_id = ${userId} AND trip_id = ${tripId}
  `;

  if (result.length === 0) {
    return false;
  }

  const userRole = result[0].role;

  // Validate role value from database
  if (userRole !== "editor" && userRole !== "viewer") {
    console.error(
      `[RBAC] Invalid role '${userRole}' found in trip_access for user ${userId}, trip ${tripId}`,
    );
    return false;
  }

  // Check role hierarchy: editor > viewer
  if (minRole === "viewer") {
    // Viewer access: either viewer or editor role works
    return userRole === "viewer" || userRole === "editor";
  } else if (minRole === "editor") {
    // Editor access: only editor role works
    return userRole === "editor";
  }

  return false;
}

/**
 * Middleware factory that checks if user has minimum required access to a trip
 * Extracts trip ID using the provided extractor function
 * Returns 401 if not authenticated, 403 if no access
 *
 * @param minRole - Minimum role required ('viewer' or 'editor')
 * @param tripIdExtractor - Function to extract trip ID from context (default: c.req.param('id'))
 *
 * @example
 * // For routes like /api/trips/:id
 * app.get('/trips/:id', requireAuth, checkTripAccess('viewer'), handler)
 *
 * @example
 * // For routes like /api/trips/:tripId/photos
 * app.post('/trips/:tripId/photos', requireAuth, checkTripAccess('editor', (c) => c.req.param('tripId')), handler)
 */
export function checkTripAccess(
  minRole: Role,
  tripIdExtractor: (c: {
    req: { param: (name: string) => string };
  }) => string = (c) => c.req.param("id"),
) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        { error: "Unauthorized", message: "Authentication required" },
        401,
      );
    }

    const tripId = tripIdExtractor(c);

    if (!tripId) {
      return c.json(
        { error: "Bad Request", message: "Trip ID is required" },
        400,
      );
    }

    const hasAccess = await userHasTripAccess(
      user.id,
      tripId,
      user.isAdmin,
      minRole,
    );

    if (!hasAccess) {
      return c.json(
        {
          error: "Forbidden",
          message: `${minRole === "editor" ? "Editor" : "Viewer"} access required for this trip`,
        },
        403,
      );
    }

    await next();
  });
}

/**
 * Middleware that requires editor access to trip specified in route params
 * Convenience wrapper around checkTripAccess('editor')
 * Use for endpoints that modify trip data (upload, edit, delete)
 *
 * Must be used AFTER requireAuth middleware
 */
export const requireEditor = checkTripAccess("editor");

/**
 * Middleware that requires viewer access to trip specified in route params
 * Convenience wrapper around checkTripAccess('viewer')
 * Use for endpoints that only read trip data
 *
 * Must be used AFTER requireAuth middleware
 */
export const requireViewer = checkTripAccess("viewer");
