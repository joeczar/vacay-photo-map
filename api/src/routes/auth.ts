import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { getDbClient } from "../db/client";
import { signToken } from "../utils/jwt";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../types/auth";
import {
  sendTelegramMessage,
  generateRecoveryCode,
} from "../services/telegram";

// WebAuthn Relying Party configuration
const getConfig = () => {
  const rpID = process.env.RP_ID;
  const rpName = process.env.RP_NAME || "Vacay Photo Map";
  const origin = process.env.RP_ORIGIN;

  if (!rpID) throw new Error("RP_ID environment variable is required");
  if (!origin) throw new Error("RP_ORIGIN environment variable is required");

  return { rpID, rpName, origin };
};

// =============================================================================
// Challenge Storage
// =============================================================================
// NOTE: In-memory storage only works for single-instance deployments.
// For multi-instance deployments, use Redis or database-backed storage.
// =============================================================================

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

interface ChallengeEntry {
  challenge: string;
  expires: number;
  userId?: string; // For adding passkeys to existing users
  webauthnUserId?: string; // Stable WebAuthn user ID (base64url encoded)
  inviteCode?: string; // Validated invite code for registration
}

const challenges = new Map<string, ChallengeEntry>();

// Periodic cleanup of expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challenges.entries()) {
    if (now > entry.expires) {
      challenges.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

function storeChallenge(
  email: string,
  challenge: string,
  options?: { userId?: string; webauthnUserId?: string; inviteCode?: string },
): void {
  challenges.set(email.toLowerCase(), {
    challenge,
    expires: Date.now() + CHALLENGE_TTL_MS,
    userId: options?.userId,
    webauthnUserId: options?.webauthnUserId,
    inviteCode: options?.inviteCode,
  });
}

function getStoredChallenge(email: string): ChallengeEntry | null {
  const entry = challenges.get(email.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    challenges.delete(email.toLowerCase());
    return null;
  }
  return entry;
}

function clearChallenge(email: string): void {
  challenges.delete(email.toLowerCase());
}

// =============================================================================
// Validation Helpers
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DISPLAY_NAME_LENGTH = 100;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
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

// Generate a random user ID for WebAuthn (not the database ID)
function generateWebAuthnUserId(): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(32);
  const array = new Uint8Array(buffer);
  crypto.getRandomValues(array);
  return array;
}

// =============================================================================
// Database Types
// =============================================================================

interface DbUser {
  id: string;
  email: string;
  webauthn_user_id: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DbAuthenticator {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
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
const AUTH_ERROR = { error: "Unauthorized", message: "Authentication failed" };

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
// POST /register/options - Generate registration challenge for new user
// =============================================================================
auth.post("/register/options", async (c) => {
  const body = await c.req.json<{
    email: string;
    displayName?: string;
    inviteCode?: string;
  }>();

  const { email, displayName, inviteCode } = body;

  if (!email || !isValidEmail(email)) {
    return c.json(
      { error: "Bad Request", message: "Invalid email format" },
      400,
    );
  }

  const db = getDbClient();
  const config = getConfig();

  // Validate invite code if provided
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
      invite.email.toLowerCase() !== email.toLowerCase()
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
  const existing = await db<(DbUser & { authenticator_count: number })[]>`
    SELECT u.id, u.webauthn_user_id, u.display_name, u.is_admin,
           COUNT(a.credential_id)::int as authenticator_count
    FROM user_profiles u
    LEFT JOIN authenticators a ON a.user_id = u.id
    WHERE u.email = ${email.toLowerCase()}
    GROUP BY u.id
  `;

  let webauthnUserIdBytes: Uint8Array<ArrayBuffer>;
  let webauthnUserIdBase64: string;
  let existingUserId: string | undefined;

  if (existing.length > 0) {
    const user = existing[0];
    if (user.authenticator_count > 0) {
      // User exists and has authenticators - must use login
      return c.json(
        {
          error: "Conflict",
          message: "Email already registered. Please use login.",
        },
        409,
      );
    }
    // User exists but has no authenticators - recovery mode
    // Use their existing webauthn_user_id for consistency
    webauthnUserIdBase64 = user.webauthn_user_id;
    webauthnUserIdBytes = Buffer.from(webauthnUserIdBase64, "base64url");
    existingUserId = user.id;
  } else {
    // New user - generate fresh webauthn user ID
    webauthnUserIdBytes = generateWebAuthnUserId();
    webauthnUserIdBase64 =
      Buffer.from(webauthnUserIdBytes).toString("base64url");
  }

  const sanitizedDisplayName = sanitizeDisplayName(displayName);

  // Generate registration options with the stable userID
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: webauthnUserIdBytes,
    userName: email,
    userDisplayName: sanitizedDisplayName || existing[0]?.display_name || email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Store challenge with webauthn user ID and existing user ID (if recovery)
  storeChallenge(email, options.challenge, {
    webauthnUserId: webauthnUserIdBase64,
    userId: existingUserId,
    inviteCode: validatedInviteCode,
  });

  return c.json({ options });
});

// =============================================================================
// POST /register/verify - Verify registration and create user
// =============================================================================
auth.post("/register/verify", async (c) => {
  const body = await c.req.json<{
    email: string;
    displayName?: string;
    credential: RegistrationResponseJSON;
  }>();

  const { email, displayName, credential } = body;

  if (!email || !credential) {
    return c.json(
      { error: "Bad Request", message: "Missing email or credential" },
      400,
    );
  }

  const entry = getStoredChallenge(email);
  if (!entry || !entry.webauthnUserId) {
    return c.json(
      { error: "Bad Request", message: "Challenge expired or not found" },
      400,
    );
  }

  // Store in local variable to help TypeScript narrow the type
  const webauthnUserId = entry.webauthnUserId;

  const config = getConfig();

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: entry.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: false, // Match "preferred" setting in options
    });

    if (!verification.verified || !verification.registrationInfo) {
      return c.json(
        { error: "Unauthorized", message: "Registration verification failed" },
        401,
      );
    }

    const { credential: verifiedCredential } = verification.registrationInfo;
    const sanitizedDisplayName = sanitizeDisplayName(displayName);

    // Clear challenge before DB operations
    clearChallenge(email);

    const db = getDbClient();

    let result: DbUser;

    if (entry.userId) {
      // Recovery mode - add passkey to existing user
      const [existingUser] = await db<DbUser[]>`
        SELECT id, email, webauthn_user_id, display_name, is_admin, created_at, updated_at
        FROM user_profiles
        WHERE id = ${entry.userId}
      `;

      if (!existingUser) {
        return c.json({ error: "Not Found", message: "User not found" }, 404);
      }

      // Add the new authenticator
      try {
        await db`
          INSERT INTO authenticators (credential_id, user_id, public_key, counter, transports)
          VALUES (
            ${verifiedCredential.id},
            ${existingUser.id},
            ${Buffer.from(verifiedCredential.publicKey).toString("base64url")},
            ${verifiedCredential.counter},
            ${credential.response.transports || null}
          )
        `;
      } catch (error) {
        if (isUniqueViolation(error)) {
          return c.json(
            {
              error: "Conflict",
              message: "This passkey is already registered.",
            },
            409,
          );
        }
        throw error;
      }

      result = existingUser;
    } else {
      // New user - create user and authenticator in transaction
      result = await db.begin(async (tx) => {
        // Lock table to prevent race condition on first user creation
        await tx`LOCK TABLE user_profiles IN SHARE ROW EXCLUSIVE MODE`;

        // Check if this is the first user - they become admin automatically
        const [{ exists }] = await tx<{ exists: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM user_profiles) as exists
        `;
        const isFirstUser = !exists;

        const [user] = await tx<DbUser[]>`
          INSERT INTO user_profiles (email, webauthn_user_id, display_name, is_admin)
          VALUES (${email.toLowerCase()}, ${webauthnUserId}, ${sanitizedDisplayName}, ${isFirstUser})
          RETURNING id, email, webauthn_user_id, display_name, is_admin, created_at, updated_at
        `;

        // Store authenticator
        // Note: In SimpleWebAuthn v10+, credential.id is already a Base64URLString
        await tx`
          INSERT INTO authenticators (credential_id, user_id, public_key, counter, transports)
          VALUES (
            ${verifiedCredential.id},
            ${user.id},
            ${Buffer.from(verifiedCredential.publicKey).toString("base64url")},
            ${verifiedCredential.counter},
            ${credential.response.transports || null}
          )
        `;

        // Process invite if provided
        if (entry.inviteCode) {
          // Re-validate invite (could have been used between options and verify)
          const [invite] = await tx<
            {
              id: string;
              role: string;
              created_by_user_id: string;
            }[]
          >`
            SELECT id, role, created_by_user_id
            FROM invites
            WHERE code = ${entry.inviteCode}
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
              user_id: user.id,
              trip_id: ta.trip_id,
              role: invite.role,
              granted_by_user_id: invite.created_by_user_id,
            }));
            await tx`INSERT INTO trip_access ${tx(accessRows)}`;
          }

          // Mark invite as used
          await tx`
            UPDATE invites
            SET used_at = NOW(), used_by_user_id = ${user.id}
            WHERE id = ${invite.id}
          `;
        }

        return user;
      });
    }

    // Generate JWT
    const token = await signToken({
      sub: result.id,
      email: result.email,
      isAdmin: result.is_admin,
    });

    return c.json(
      {
        user: {
          id: result.id,
          email: result.email,
          displayName: result.display_name,
          isAdmin: result.is_admin,
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
      { error: "Unauthorized", message: "Registration verification failed" },
      401,
    );
  }
});

// =============================================================================
// POST /passkeys/options - Generate challenge to add passkey to existing user
// =============================================================================
auth.post("/passkeys/options", requireAuth, async (c) => {
  const currentUser = c.var.user!;
  const config = getConfig();
  const db = getDbClient();

  // Fetch user's stable WebAuthn user ID and existing authenticators
  const [user] = await db<{ webauthn_user_id: string }[]>`
    SELECT webauthn_user_id FROM user_profiles WHERE id = ${currentUser.id}
  `;

  if (!user?.webauthn_user_id) {
    return c.json(
      { error: "Internal Error", message: "User WebAuthn ID not found" },
      500,
    );
  }

  const existingAuthenticators = await db<DbAuthenticator[]>`
    SELECT credential_id, transports
    FROM authenticators
    WHERE user_id = ${currentUser.id}
  `;

  // Convert stored base64url back to Uint8Array for WebAuthn
  const webauthnUserIdBytes = new Uint8Array(
    Buffer.from(user.webauthn_user_id, "base64url"),
  );

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: webauthnUserIdBytes,
    userName: currentUser.email,
    userDisplayName: currentUser.email,
    attestationType: "none",
    excludeCredentials: existingAuthenticators.map((auth) => ({
      id: auth.credential_id,
      transports: auth.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Store challenge with user ID for verification
  storeChallenge(currentUser.email, options.challenge, {
    userId: currentUser.id,
  });

  return c.json({ options });
});

// =============================================================================
// POST /passkeys/verify - Verify and add new passkey to existing user
// =============================================================================
auth.post("/passkeys/verify", requireAuth, async (c) => {
  const currentUser = c.var.user!;
  const body = await c.req.json<{ credential: RegistrationResponseJSON }>();
  const { credential } = body;

  if (!credential) {
    return c.json({ error: "Bad Request", message: "Missing credential" }, 400);
  }

  const entry = getStoredChallenge(currentUser.email);
  if (!entry || entry.userId !== currentUser.id) {
    return c.json(
      { error: "Bad Request", message: "Challenge expired or not found" },
      400,
    );
  }

  const config = getConfig();

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: entry.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: false, // Match "preferred" setting in options
    });

    if (!verification.verified || !verification.registrationInfo) {
      return c.json(
        { error: "Unauthorized", message: "Verification failed" },
        401,
      );
    }

    const { credential: verifiedCredential } = verification.registrationInfo;
    clearChallenge(currentUser.email);

    const db = getDbClient();

    // Store new authenticator
    // Note: In SimpleWebAuthn v10+, credential.id is already a Base64URLString
    await db`
      INSERT INTO authenticators (credential_id, user_id, public_key, counter, transports)
      VALUES (
        ${verifiedCredential.id},
        ${currentUser.id},
        ${Buffer.from(verifiedCredential.publicKey).toString("base64url")},
        ${verifiedCredential.counter},
        ${credential.response.transports || null}
      )
    `;

    return c.json({ success: true }, 201);
  } catch (error) {
    console.error(
      "[AUTH] Add passkey error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return c.json(
      { error: "Unauthorized", message: "Verification failed" },
      401,
    );
  }
});

// =============================================================================
// GET /passkeys - List user's passkeys
// =============================================================================
auth.get("/passkeys", requireAuth, async (c) => {
  const currentUser = c.var.user!;
  const db = getDbClient();

  const authenticators = await db<
    { credential_id: string; created_at: Date; last_used_at: Date | null }[]
  >`
    SELECT credential_id, created_at, last_used_at
    FROM authenticators
    WHERE user_id = ${currentUser.id}
    ORDER BY created_at DESC
  `;

  return c.json({
    passkeys: authenticators.map((auth) => ({
      id: auth.credential_id,
      createdAt: auth.created_at,
      lastUsedAt: auth.last_used_at,
    })),
  });
});

// =============================================================================
// DELETE /passkeys/:id - Remove a passkey
// =============================================================================
auth.delete("/passkeys/:id", requireAuth, async (c) => {
  const currentUser = c.var.user!;
  const credentialId = c.req.param("id");
  const db = getDbClient();

  // Check user has more than one passkey (can't delete last one)
  const count = await db<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM authenticators WHERE user_id = ${currentUser.id}
  `;

  if (count[0].count <= 1) {
    return c.json(
      { error: "Bad Request", message: "Cannot delete your only passkey" },
      400,
    );
  }

  const result = await db`
    DELETE FROM authenticators
    WHERE credential_id = ${credentialId}
      AND user_id = ${currentUser.id}
    RETURNING credential_id
  `;

  if (result.length === 0) {
    return c.json({ error: "Not Found", message: "Passkey not found" }, 404);
  }

  return c.json({ success: true });
});

// =============================================================================
// POST /login/options - Generate authentication challenge
// =============================================================================
auth.post("/login/options", async (c) => {
  const body = await c.req.json<{ email: string }>();
  const { email } = body;

  if (!email || !isValidEmail(email)) {
    return c.json(
      { error: "Bad Request", message: "Invalid email format" },
      400,
    );
  }

  const db = getDbClient();
  const config = getConfig();

  // Find user and their authenticators in one query
  const authenticators = await db<DbAuthenticator[]>`
    SELECT a.credential_id, a.public_key, a.counter, a.transports
    FROM authenticators a
    JOIN user_profiles u ON u.id = a.user_id
    WHERE u.email = ${email.toLowerCase()}
  `;

  // Return generic error to prevent user enumeration
  if (authenticators.length === 0) {
    return c.json(AUTH_ERROR, 401);
  }

  // Generate authentication options
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: authenticators.map((auth) => ({
      id: auth.credential_id,
      transports: auth.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    userVerification: "preferred",
  });

  // Store challenge
  storeChallenge(email, options.challenge);

  return c.json({ options });
});

// =============================================================================
// POST /login/verify - Verify authentication and return JWT
// =============================================================================
auth.post("/login/verify", async (c) => {
  const body = await c.req.json<{
    email: string;
    credential: AuthenticationResponseJSON;
  }>();

  const { email, credential } = body;

  if (!email || !credential) {
    return c.json(
      { error: "Bad Request", message: "Missing email or credential" },
      400,
    );
  }

  const entry = getStoredChallenge(email);
  if (!entry) {
    return c.json(
      { error: "Bad Request", message: "Challenge expired or not found" },
      400,
    );
  }

  const config = getConfig();
  const db = getDbClient();

  // Find user and matching authenticator
  const results = await db<(DbUser & DbAuthenticator)[]>`
    SELECT u.id, u.email, u.display_name, u.is_admin,
           a.credential_id, a.public_key, a.counter, a.transports
    FROM user_profiles u
    JOIN authenticators a ON a.user_id = u.id
    WHERE u.email = ${email.toLowerCase()}
      AND a.credential_id = ${credential.id}
  `;

  if (results.length === 0) {
    clearChallenge(email);
    return c.json(AUTH_ERROR, 401);
  }

  const result = results[0];

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: entry.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: false, // Match "preferred" setting in options
      credential: {
        id: result.credential_id,
        publicKey: Buffer.from(result.public_key, "base64url"),
        counter: result.counter,
        transports: result.transports as
          | AuthenticatorTransportFuture[]
          | undefined,
      },
    });

    if (!verification.verified) {
      clearChallenge(email);
      return c.json(AUTH_ERROR, 401);
    }

    // Clear challenge
    clearChallenge(email);

    // Update counter and last_used_at
    await db`
      UPDATE authenticators
      SET counter = ${verification.authenticationInfo.newCounter},
          last_used_at = NOW()
      WHERE credential_id = ${result.credential_id}
    `;

    // Generate JWT
    const token = await signToken({
      sub: result.id,
      email: result.email,
      isAdmin: result.is_admin,
    });

    return c.json({
      user: {
        id: result.id,
        email: result.email,
        displayName: result.display_name,
        isAdmin: result.is_admin,
      },
      token,
    });
  } catch (error) {
    console.error(
      "[AUTH] Login error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    clearChallenge(email);
    return c.json(AUTH_ERROR, 401);
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
// GET /registration-status - Check if registration is open (first-user-only)
// =============================================================================
auth.get("/registration-status", async (c) => {
  const db = getDbClient();

  const [{ exists }] = await db<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM user_profiles) as exists
  `;

  return c.json({
    registrationOpen: !exists,
    reason: exists ? "first_user_registered" : "no_users_yet",
  });
});

// =============================================================================
// POST /recovery/request - Request account recovery via Telegram
// =============================================================================
auth.post("/recovery/request", async (c) => {
  const { email } = await c.req.json<{ email: string }>();

  if (!email || !isValidEmail(email)) {
    return c.json(
      { error: "Bad Request", message: "Invalid email format" },
      400,
    );
  }

  const db = getDbClient();

  // Find user by email
  const [user] = await db<{ id: string; email: string }[]>`
    SELECT id, email FROM user_profiles WHERE email = ${email.toLowerCase()}
  `;

  // Generate code and expiry ALWAYS to prevent timing attacks
  const code = generateRecoveryCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  if (user) {
    // Delete any existing unused tokens for this user (enforces one active token)
    await db`
      DELETE FROM recovery_tokens
      WHERE user_id = ${user.id}
        AND used_at IS NULL
        AND locked_at IS NULL
    `;

    // Store token
    await db`
      INSERT INTO recovery_tokens (user_id, code, expires_at)
      VALUES (${user.id}, ${code}, ${expiresAt})
    `;

    // Send via Telegram with ISO timestamp
    const success = await sendTelegramMessage(
      `🔐 <b>Recovery Code</b>\n\nAccount: ${user.email}\nCode: <code>${code}</code>\n\nExpires at: ${expiresAt.toISOString()}\n(10 minutes from now)`,
    );

    if (!success) {
      // Log failure for monitoring
      console.error(
        `[RECOVERY] Failed to send Telegram notification for ${user.email}`,
      );
    }
  }

  // Always return success to prevent user enumeration
  // Add small random delay to mask timing differences
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50));

  return c.json({
    success: true,
    message: "If account exists, recovery code sent",
  });
});

// =============================================================================
// POST /recovery/verify - Verify recovery code and clear authenticators
// =============================================================================
auth.post("/recovery/verify", async (c) => {
  const { email, code } = await c.req.json<{ email: string; code: string }>();

  if (!email || !code) {
    return c.json(
      { error: "Bad Request", message: "Email and code required" },
      400,
    );
  }

  const db = getDbClient();

  // Atomically find valid token AND mark as used (CTE prevents race condition)
  const [validToken] = await db<{ user_id: string }[]>`
    WITH valid_token AS (
      SELECT rt.id
      FROM recovery_tokens rt
      JOIN user_profiles u ON rt.user_id = u.id
      WHERE u.email = ${email.toLowerCase()}
        AND rt.code = ${code}
        AND rt.expires_at > NOW()
        AND rt.used_at IS NULL
        AND rt.locked_at IS NULL
      ORDER BY rt.created_at DESC
      LIMIT 1
    )
    UPDATE recovery_tokens
    SET used_at = NOW()
    WHERE id = (SELECT id FROM valid_token)
    RETURNING user_id
  `;

  if (!validToken) {
    // Code didn't match - find token by email only to track attempts
    const [tokenForAttempts] = await db<
      { id: string; attempts: number; locked_at: Date | null }[]
    >`
      SELECT id, attempts, locked_at
      FROM recovery_tokens rt
      JOIN user_profiles u ON rt.user_id = u.id
      WHERE u.email = ${email.toLowerCase()}
        AND rt.expires_at > NOW()
        AND rt.used_at IS NULL
      ORDER BY rt.created_at DESC
      LIMIT 1
    `;

    if (!tokenForAttempts) {
      return c.json(
        { error: "Bad Request", message: "Invalid or expired code" },
        400,
      );
    }

    if (tokenForAttempts.locked_at) {
      return c.json(
        {
          error: "Bad Request",
          message:
            "Too many failed attempts. Please request a new recovery code.",
        },
        400,
      );
    }

    // Increment attempt counter
    const newAttempts = tokenForAttempts.attempts + 1;

    if (newAttempts >= 5) {
      await db`
        UPDATE recovery_tokens
        SET attempts = ${newAttempts}, locked_at = NOW()
        WHERE id = ${tokenForAttempts.id}
      `;
      return c.json(
        {
          error: "Bad Request",
          message:
            "Too many failed attempts. Please request a new recovery code.",
        },
        400,
      );
    }

    await db`
      UPDATE recovery_tokens
      SET attempts = ${newAttempts}
      WHERE id = ${tokenForAttempts.id}
    `;
    return c.json(
      {
        error: "Bad Request",
        message: `Invalid code. ${5 - newAttempts} attempts remaining.`,
      },
      400,
    );
  }

  // Token was atomically claimed - delete authenticators
  await db`DELETE FROM authenticators WHERE user_id = ${validToken.user_id}`;

  // Send confirmation via Telegram (outside transaction)
  await sendTelegramMessage(
    `✅ Recovery successful for ${email}. Passkeys cleared.`,
  );

  return c.json({
    success: true,
    message: "Recovery successful. Please register a new passkey.",
    redirectTo: "/register",
  });
});

export { auth };
