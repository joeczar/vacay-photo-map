import { createMiddleware } from 'hono/factory'
import { verifyToken } from '../utils/jwt'
import type { AuthEnv, AuthUser } from '../types/auth'

/**
 * Extract Bearer token from Authorization header (case-insensitive)
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null
  }
  return authHeader.slice(7).trim()
}

/**
 * Log authentication failure for security monitoring
 * Never logs the actual token to prevent credential leakage
 */
function logAuthFailure(error: unknown, path: string): void {
  console.error('[AUTH] Token verification failed:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    path,
  })
}

/**
 * Verify token and create AuthUser object
 * @throws Error if token is invalid or expired
 */
async function authenticateToken(token: string): Promise<AuthUser> {
  const payload = await verifyToken(token)
  return {
    id: payload.sub,
    email: payload.email,
    isAdmin: payload.isAdmin,
  }
}

/**
 * Middleware that requires a valid JWT token
 * Returns 401 if token is missing or invalid
 * Sets `c.var.user` with authenticated user data
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing authentication token' },
      401
    )
  }

  try {
    const user = await authenticateToken(token)
    c.set('user', user)
    await next()
  } catch (error) {
    logAuthFailure(error, c.req.path)
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    )
  }
})

/**
 * Middleware that requires a valid JWT with admin privileges
 * Returns 401 if token is missing/invalid, 403 if user is not admin
 * Sets `c.var.user` with authenticated user data
 */
export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing authentication token' },
      401
    )
  }

  try {
    const user = await authenticateToken(token)

    if (!user.isAdmin) {
      return c.json(
        { error: 'Forbidden', message: 'Admin access required' },
        403
      )
    }

    c.set('user', user)
    await next()
  } catch (error) {
    logAuthFailure(error, c.req.path)
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    )
  }
})

/**
 * Middleware that optionally parses JWT if present
 * Does NOT fail if token is missing - continues without user context
 * Fails with 401 only if token IS present but invalid
 * Sets `c.var.user` if valid token exists, undefined otherwise
 */
export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    await next()
    return
  }

  try {
    const user = await authenticateToken(token)
    c.set('user', user)
    await next()
  } catch (error) {
    logAuthFailure(error, c.req.path)
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    )
  }
})
