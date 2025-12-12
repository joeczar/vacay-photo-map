import * as jose from 'jose'
import type { JWTPayload } from '../types/auth'

// Token expiration time (e.g., '24h', '7d')
const TOKEN_EXPIRATION = process.env.JWT_EXPIRATION || '24h'

/**
 * Get the secret key, throwing if not configured
 * Lazy evaluation allows tests to set env var before use
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return new TextEncoder().encode(secret)
}

/**
 * Sign a JWT token for a user
 */
export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>
): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRATION)
    .sign(getSecretKey())
}

/**
 * Verify and decode a JWT token
 * @throws {jose.errors.JWTExpired} if token is expired
 * @throws {jose.errors.JWTInvalid} if token is invalid
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey())
  return payload as unknown as JWTPayload
}
