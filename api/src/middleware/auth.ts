import { createMiddleware } from 'hono/factory'
import { verifyToken } from '../utils/jwt'
import type { AuthEnv, AuthUser } from '../types/auth'

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7) // Remove 'Bearer ' prefix
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
    const payload = await verifyToken(token)
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      isAdmin: payload.isAdmin,
    }
    c.set('user', user)
    await next()
  } catch {
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
    const payload = await verifyToken(token)

    if (!payload.isAdmin) {
      return c.json(
        { error: 'Forbidden', message: 'Admin access required' },
        403
      )
    }

    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      isAdmin: payload.isAdmin,
    }
    c.set('user', user)
    await next()
  } catch {
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
    // No token provided - continue without auth
    await next()
    return
  }

  try {
    const payload = await verifyToken(token)
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      isAdmin: payload.isAdmin,
    }
    c.set('user', user)
    await next()
  } catch {
    // Token was provided but is invalid - fail
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    )
  }
})
