import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { z } from "zod";
import { getDbClient } from "../db/client";
import { signToken } from "../utils/jwt";
import { requireAuth, requireAdmin } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";

// =============================================================================
// Validation Helpers
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function sanitizeDisplayName(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return trimmed || null;
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
// Database Types
// =============================================================================

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Rate Limiting (Simple in-memory implementation)
// =============================================================================
// NOTE: For production, use a proper rate limiting middleware with Redis

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Cleanup rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

// Generic auth error message to prevent user enumeration
const AUTH_ERROR = { error: "Unauthorized", message: "Invalid credentials" };

// =============================================================================
// Routes
// =============================================================================

const auth = new Hono<AuthEnv>();

// Rate limiting middleware for auth routes
// SECURITY: Only enable TRUSTED_PROXY=true when deployed behind a trusted
// reverse proxy (e.g., Cloudflare, nginx). Without this, clients can spoof
// X-Forwarded-For headers to bypass rate limiting.
auth.use("*", async (c, next) => {
  const trustedProxy = process.env.TRUSTED_PROXY === "true";

  let ip: string;
  if (trustedProxy) {
    // Trust X-Forwarded-For when behind known proxy
    const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = c.req.header("x-real-ip");

    if (forwardedFor) {
      ip = forwardedFor;
    } else if (realIp) {
      ip = realIp;
    } else {
      // SECURITY: Fail closed - if proxy headers missing, reject request
      // This indicates misconfiguration when TRUSTED_PROXY=true
      console.warn(
        "[RATE_LIMIT] Missing proxy headers with TRUSTED_PROXY=true",
      );
      return c.json(
        { error: "Bad Request", message: "Missing required proxy headers" },
        400,
      );
    }
  } else {
    // Direct access - use actual client IP from connection
    // Falls back to 'unknown' only in test environments where connInfo unavailable
    try {
      const connInfo = getConnInfo(c);
      ip = connInfo.remote.address || "unknown";
    } catch {
      // In test environment, getConnInfo may not work - use header or fallback
      ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        c.req.header("x-real-ip") ||
        "unknown";
    }
  }

  if (!checkRateLimit(ip)) {
    return c.json(
      { error: "Too Many Requests", message: "Please try again later" },
      429,
    );
  }

  await next();
});

// =============================================================================
// POST /register - Register new user with email and password
// =============================================================================
auth.post("/register", async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    displayName?: string;
    inviteCode?: string;
  }>();

  const { email, password, displayName, inviteCode } = body;

  // Validate email format
  if (!email || !isValidEmail(email)) {
    return c.json(
      { error: "Bad Request", message: "Invalid email format" },
      400,
    );
  }

  // Validate password length
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      {
        error: "Bad Request",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      },
      400,
    );
  }

  // Require invite code (registration is invite-only)
  if (!inviteCode) {
    return c.json(
      { error: "Bad Request", message: "Invite code required" },
      400,
    );
  }

  const db = getDbClient();
  const sanitizedEmail = sanitizeEmail(email);

  // Validate invite code
  let validatedInviteCode: string | undefined;
  if (inviteCode) {
    const [invite] = await db<
      {
        id: string;
        email: string | null;
      }[]
    >`
      SELECT id, email
      FROM invites
      WHERE code = ${inviteCode}
        AND used_at IS NULL
        AND expires_at > NOW()
    `;

    if (!invite) {
      return c.json(
        { error: "Bad Request", message: "Invalid or expired invite code" },
        400,
      );
    }

    if (
      invite.email !== null &&
      invite.email.toLowerCase() !== sanitizedEmail
    ) {
      return c.json(
        {
          error: "Bad Request",
          message: "Invite email does not match registration email",
        },
        400,
      );
    }

    validatedInviteCode = inviteCode;
  }

  // Check if email already exists
  const existing = await db<Pick<DbUser, "id">[]>`
    SELECT id
    FROM user_profiles
    WHERE email = ${sanitizedEmail}
  `;

  if (existing.length > 0) {
    return c.json(
      { error: "Conflict", message: "Email already registered" },
      409,
    );
  }

  const sanitizedDisplayName = sanitizeDisplayName(displayName);

  try {
    // Hash password
    const passwordHash = await Bun.password.hash(password);

    // Create user and process invite in transaction
    const user = await db.begin(async (tx) => {
      // Create user (always non-admin - admins created via CLI)
      const [newUser] = await tx<DbUser[]>`
        INSERT INTO user_profiles (email, password_hash, display_name, is_admin)
        VALUES (${sanitizedEmail}, ${passwordHash}, ${sanitizedDisplayName}, false)
        RETURNING id, email, display_name, is_admin, created_at, updated_at
      `;

      // Process invite if provided
      if (validatedInviteCode) {
        // Re-validate invite (could have been used between check and insert)
        const [invite] = await tx<
          {
            id: string;
            role: string;
            created_by_user_id: string;
          }[]
        >`
          SELECT id, role, created_by_user_id
          FROM invites
          WHERE code = ${validatedInviteCode}
            AND used_at IS NULL
            AND expires_at > NOW()
        `;

        if (!invite) {
          throw new Error("Invite no longer valid");
        }

        // Fetch all trips associated with this invite
        const tripAccess = await tx<{ trip_id: string }[]>`
          SELECT trip_id
          FROM invite_trip_access
          WHERE invite_id = ${invite.id}
        `;

        // Grant trip access for each trip (bulk insert)
        if (tripAccess.length > 0) {
          const accessRows = tripAccess.map((ta) => ({
            user_id: newUser.id,
            trip_id: ta.trip_id,
            role: invite.role,
            granted_by_user_id: invite.created_by_user_id,
          }));
          await tx`INSERT INTO trip_access ${tx(accessRows)}`;
        }

        // Mark invite as used
        await tx`
          UPDATE invites
          SET used_at = NOW(), used_by_user_id = ${newUser.id}
          WHERE id = ${invite.id}
        `;
      }

      return newUser;
    });

    // Generate JWT
    const token = await signToken({
      sub: user.id,
      email: user.email,
      isAdmin: user.is_admin,
    });

    return c.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          isAdmin: user.is_admin,
        },
        token,
      },
      201,
    );
  } catch (error) {
    // Handle race condition - email was registered between check and insert
    if (isUniqueViolation(error)) {
      return c.json(
        { error: "Conflict", message: "Email already registered" },
        409,
      );
    }

    console.error(
      "[AUTH] Registration error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return c.json(
      { error: "Internal Server Error", message: "Registration failed" },
      500,
    );
  }
});

// =============================================================================
// POST /login - Login with email and password
// =============================================================================
auth.post("/login", async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
  }>();

  const { email, password } = body;

  if (!email || !password) {
    return c.json(
      { error: "Bad Request", message: "Email and password required" },
      400,
    );
  }

  try {
    const db = getDbClient();
    const sanitizedEmail = sanitizeEmail(email);

    // Find user by email
    const users = await db<DbUser[]>`
      SELECT id, email, password_hash, display_name, is_admin
      FROM user_profiles
      WHERE email = ${sanitizedEmail}
    `;

    // Return generic error to prevent user enumeration
    if (users.length === 0) {
      return c.json(AUTH_ERROR, 401);
    }

    const user = users[0];

    // Verify password
    const isValid = await Bun.password.verify(password, user.password_hash);

    if (!isValid) {
      return c.json(AUTH_ERROR, 401);
    }

    // Generate JWT
    const token = await signToken({
      sub: user.id,
      email: user.email,
      isAdmin: user.is_admin,
    });

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin,
      },
      token,
    });
  } catch (error) {
    console.error(
      "[AUTH] Login error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return c.json(
      { error: "Internal Server Error", message: "Login failed" },
      500,
    );
  }
});

// =============================================================================
// POST /admin/reset-password - Admin-only password reset
// =============================================================================
auth.post("/admin/reset-password", requireAdmin, async (c) => {
  const body = await c.req.json<{
    userId: string;
    newPassword: string;
  }>();

  const { userId, newPassword } = body;

  if (!userId || !newPassword) {
    return c.json(
      { error: "Bad Request", message: "User ID and new password required" },
      400,
    );
  }

  // Validate password length
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      {
        error: "Bad Request",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      },
      400,
    );
  }

  try {
    const db = getDbClient();

    // Check if user exists
    const users = await db<Pick<DbUser, "id">[]>`
      SELECT id FROM user_profiles WHERE id = ${userId}
    `;

    if (users.length === 0) {
      return c.json({ error: "Not Found", message: "User not found" }, 404);
    }

    // Hash new password
    const passwordHash = await Bun.password.hash(newPassword);

    // Update user's password
    await db`
      UPDATE user_profiles
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${userId}
    `;

    return c.json({ success: true });
  } catch (error) {
    console.error(
      "[AUTH] Password reset error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return c.json(
      { error: "Internal Server Error", message: "Password reset failed" },
      500,
    );
  }
});

// =============================================================================
// POST /change-password - Change current user's password
// =============================================================================

// Zod schema for change password validation
const ChangePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password and new password are required"),
    newPassword: z
      .string()
      .min(1, "Current password and new password are required")
      .min(
        MIN_PASSWORD_LENGTH,
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      ),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

auth.post("/change-password", requireAuth, async (c) => {
  // requireAuth middleware guarantees c.var.user is populated
  const currentUser = c.var.user!;

  const body = await c.req.json();

  // Validate request body with zod
  const parseResult = ChangePasswordSchema.safeParse(body);
  if (!parseResult.success) {
    // Zod 4 uses 'issues' instead of 'errors'
    const errorMessage = parseResult.error.issues
      .map((e) => e.message)
      .join(". ");
    return c.json(
      {
        error: "Bad Request",
        message: errorMessage,
      },
      400,
    );
  }

  const { currentPassword, newPassword } = parseResult.data;

  try {
    const db = getDbClient();

    // Fetch user's current password hash
    const users = await db<Pick<DbUser, "id" | "password_hash">[]>`
      SELECT id, password_hash
      FROM user_profiles
      WHERE id = ${currentUser.id}
    `;

    if (users.length === 0) {
      return c.json({ error: "Not Found", message: "User not found" }, 404);
    }

    const user = users[0];

    // Verify current password
    const isValid = await Bun.password.verify(
      currentPassword,
      user.password_hash,
    );

    if (!isValid) {
      return c.json(
        { error: "Unauthorized", message: "Current password is incorrect" },
        401,
      );
    }

    // Hash new password
    const newPasswordHash = await Bun.password.hash(newPassword);

    // Update password in database
    await db`
      UPDATE user_profiles
      SET password_hash = ${newPasswordHash}, updated_at = NOW()
      WHERE id = ${currentUser.id}
    `;

    console.log(`[AUTH] Password changed for user ${currentUser.id}`);

    return c.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error(
      "[AUTH] Change password error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return c.json(
      { error: "Internal Server Error", message: "Password change failed" },
      500,
    );
  }
});

// =============================================================================
// GET /me - Get current user profile
// =============================================================================
auth.get("/me", requireAuth, async (c) => {
  const currentUser = c.var.user!;
  const db = getDbClient();

  const users = await db<DbUser[]>`
    SELECT id, email, display_name, is_admin, created_at, updated_at
    FROM user_profiles
    WHERE id = ${currentUser.id}
  `;

  if (users.length === 0) {
    return c.json({ error: "Not Found", message: "User not found" }, 404);
  }

  const user = users[0];

  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    isAdmin: user.is_admin,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  });
});

// =============================================================================
// POST /logout - Client-side logout (just returns success)
// =============================================================================
auth.post("/logout", (_c) => {
  return _c.json({ success: true });
});

// =============================================================================
// GET /registration-status - Check if registration is open
// Registration requires a valid invite code
// =============================================================================
auth.get("/registration-status", async (c) => {
  const db = getDbClient();
  const inviteCode = c.req.query("invite");

  // No invite code provided - registration requires invite
  if (!inviteCode) {
    return c.json({
      registrationOpen: false,
      reason: "invite_required",
    });
  }

  // Validate invite code format
  if (inviteCode.length !== 32 || !/^[A-Za-z0-9_-]+$/.test(inviteCode)) {
    return c.json({
      registrationOpen: false,
      reason: "invalid_invite",
    });
  }

  // Check if invite exists and is valid
  const inviteRows = await db<
    {
      id: string;
      email: string | null;
      used_at: Date | null;
      expires_at: Date;
    }[]
  >`
    SELECT id, email, used_at, expires_at
    FROM invites
    WHERE code = ${inviteCode}
  `;

  if (inviteRows.length === 0) {
    return c.json({
      registrationOpen: false,
      reason: "invalid_invite",
    });
  }

  const invite = inviteRows[0];
  const isUsed = invite.used_at !== null;
  const isExpired = new Date(invite.expires_at) <= new Date();

  if (isUsed) {
    return c.json({
      registrationOpen: false,
      reason: "invite_used",
    });
  }

  if (isExpired) {
    return c.json({
      registrationOpen: false,
      reason: "invite_expired",
    });
  }

  // Valid invite - registration open
  return c.json({
    registrationOpen: true,
    reason: "valid_invite",
    email: invite.email,
  });
});

export { auth };
