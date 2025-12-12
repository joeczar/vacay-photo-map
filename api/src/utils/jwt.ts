import * as jose from 'jose'
import type { JWTPayload } from '../types/auth'

// Validate and get token expiration time
const TOKEN_EXPIRATION = (() => {
  const expiration = process.env.JWT_EXPIRATION || '1h'
  // Validate format: number followed by s/m/h/d (e.g., '1h', '7d', '30m')
  if (!/^\d+[smhd]$/.test(expiration)) {
    throw new Error('JWT_EXPIRATION must be in format: 1h, 7d, 30m, 60s, etc.')
  }
  return expiration
})()

/**
 * Get the secret key, throwing if not configured or invalid length
 * Lazy evaluation allows tests to set env var before use
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  const secretBytes = new TextEncoder().encode(secret)
  if (secretBytes.byteLength < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes long for HS256')
  }
  if (secretBytes.byteLength > 512) {
    throw new Error('JWT_SECRET must not exceed 512 bytes')
  }
  return secretBytes
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
 * @throws {jose.errors.JWTInvalid} if token is invalid or missing required claims
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey())

  // Validate required claims
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.isAdmin !== 'boolean'
  ) {
    throw new jose.errors.JWTInvalid('Token payload is missing required claims')
  }

  return payload as unknown as JWTPayload
}
