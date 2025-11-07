/**
 * Token Generator Utility
 * Generates cryptographically secure random tokens for trip protection
 * Tokens are URL-safe and suitable for use in share links
 */

/**
 * Generates a cryptographically secure random token for trip access protection
 *
 * The token is generated using crypto.getRandomValues() and encoded in base64url format,
 * making it URL-safe for use in share links (e.g., /trip/slug?token=abc123...)
 *
 * Token properties:
 * - 32 bytes of entropy (256 bits)
 * - 43 characters when base64url encoded
 * - URL-safe (contains only: A-Z, a-z, 0-9, -, _)
 * - Cryptographically secure random generation
 *
 * @returns A URL-safe random token string (43 characters)
 *
 * @example
 * const token = generateTripToken()
 * // Returns: "np8xK2mV7qR4sL9wT3fH6gC1bN5pX0yZaB2dE4fG"
 */
export function generateTripToken(): string {
  // Generate 32 random bytes (256 bits of entropy)
  const buffer = new Uint8Array(32)
  crypto.getRandomValues(buffer)

  // Convert to base64url format (URL-safe)
  return base64UrlEncode(buffer)
}

/**
 * Encodes a Uint8Array to base64url format (URL-safe base64)
 *
 * Standard base64 uses +, /, and = which are not URL-safe
 * base64url uses -, _, and no padding (=)
 *
 * @param buffer - The byte array to encode
 * @returns base64url encoded string
 */
function base64UrlEncode(buffer: Uint8Array): string {
  // Convert buffer to binary string
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }

  // Encode to base64
  const base64 = btoa(binary)

  // Convert to base64url (replace +/= with URL-safe characters)
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Calculate the total number of possible token combinations
 *
 * With 32 bytes (256 bits) of entropy:
 * - Possible combinations: 2^256
 * - Approximate: 1.16 × 10^77 combinations
 *
 * For comparison:
 * - Total atoms in observable universe: ~10^80
 * - Collision probability is astronomically low
 *
 * @returns The number of possible unique tokens
 */
export function getTokenCombinations(): number {
  // 2^256 is too large for JavaScript Number type
  // Return a string representation for documentation purposes
  return Math.pow(2, 256)
}
