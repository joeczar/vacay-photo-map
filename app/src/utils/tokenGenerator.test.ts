import { describe, it, expect, vi } from 'vitest'
import { generateTripToken, getTokenCombinations } from './tokenGenerator'

describe('tokenGenerator', () => {
  describe('generateTripToken', () => {
    it('should generate a token with exactly 43 characters', () => {
      const token = generateTripToken()
      expect(token).toHaveLength(43)
    })

    it('should generate URL-safe tokens (base64url format)', () => {
      for (let i = 0; i < 10; i++) {
        const token = generateTripToken()
        // base64url uses: A-Z, a-z, 0-9, -, _
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
        // Should not contain standard base64 characters: +, /, =
        expect(token).not.toContain('+')
        expect(token).not.toContain('/')
        expect(token).not.toContain('=')
      }
    })

    it('should generate different tokens on subsequent calls', () => {
      const token1 = generateTripToken()
      const token2 = generateTripToken()
      const token3 = generateTripToken()

      const tokens = new Set([token1, token2, token3])
      expect(tokens.size).toBe(3)
    })

    it('should use crypto.getRandomValues for cryptographic randomness', () => {
      const spy = vi.spyOn(crypto, 'getRandomValues')

      generateTripToken()

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('should generate highly unique tokens with no collisions', () => {
      const tokens = new Set<string>()
      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        tokens.add(generateTripToken())
      }

      // With 256 bits of entropy, collisions are astronomically unlikely
      expect(tokens.size).toBe(iterations)
    })

    it('should have consistent length across many generations', () => {
      const lengths = new Set<number>()

      for (let i = 0; i < 100; i++) {
        lengths.add(generateTripToken().length)
      }

      // All tokens should be exactly 43 characters
      expect(lengths.size).toBe(1)
      expect(lengths.has(43)).toBe(true)
    })

    it('should produce tokens suitable for URLs', () => {
      const token = generateTripToken()
      const url = `https://example.com/trip/slug?token=${token}`

      // Should not need URL encoding
      expect(encodeURIComponent(token)).toBe(token)

      // Should be parseable from URL
      const parsed = new URL(url)
      expect(parsed.searchParams.get('token')).toBe(token)
    })

    it('should have high entropy distribution', () => {
      // Generate multiple tokens and verify character distribution
      const tokens = Array.from({ length: 100 }, () => generateTripToken())
      const allChars = tokens.join('')

      // Count unique characters used
      const uniqueChars = new Set(allChars)

      // base64url alphabet has 64 characters (A-Z, a-z, 0-9, -, _)
      // With enough samples, we should see most of the alphabet
      expect(uniqueChars.size).toBeGreaterThan(50)
    })
  })

  describe('getTokenCombinations', () => {
    it('should return an astronomically large number', () => {
      const combinations = getTokenCombinations()

      // 2^256 = approximately 1.16 × 10^77
      expect(combinations).toBeGreaterThan(1e77)
    })

    it('should indicate extreme security for trip tokens', () => {
      const combinations = getTokenCombinations()

      // With 256 bits of entropy, this is cryptographically secure
      expect(combinations).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
    })
  })
})
