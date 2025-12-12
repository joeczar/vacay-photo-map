/**
 * JWT payload structure for authentication tokens
 */
export interface JWTPayload {
  /** User ID (UUID) */
  sub: string
  /** User email */
  email: string
  /** Admin flag */
  isAdmin: boolean
  /** Issued at timestamp */
  iat?: number
  /** Expiration timestamp */
  exp?: number
}

/**
 * Authenticated user data available in request context
 */
export interface AuthUser {
  id: string
  email: string
  isAdmin: boolean
}

/**
 * Hono environment type for auth variables
 * Use with: new Hono<AuthEnv>() or createMiddleware<AuthEnv>()
 */
export type AuthEnv = {
  Variables: {
    user?: AuthUser
  }
}
