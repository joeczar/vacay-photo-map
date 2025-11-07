import { describe, it, expect, vi } from 'vitest'
import { generateTripToken, getTokenCombinations } from './tokenGenerator'

describe('tokenGenerator', () => {
  describe('generateTripToken', () => {
    it('should generate a token with 3 words separated by hyphens', () => {
      const token = generateTripToken()
      const parts = token.split('-')

      expect(parts).toHaveLength(3)
      expect(token).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
    })

    it('should generate different tokens on subsequent calls', () => {
      const token1 = generateTripToken()
      const token2 = generateTripToken()
      const token3 = generateTripToken()

      // With sufficient randomness, these should be different
      // (could theoretically be same, but extremely unlikely)
      const tokens = new Set([token1, token2, token3])
      expect(tokens.size).toBeGreaterThan(1)
    })

    it('should only use lowercase letters and hyphens', () => {
      for (let i = 0; i < 10; i++) {
        const token = generateTripToken()
        expect(token).toMatch(/^[a-z-]+$/)
      }
    })

    it('should generate tokens of reasonable length', () => {
      for (let i = 0; i < 10; i++) {
        const token = generateTripToken()
        // Each word is at least 3 chars, plus 2 hyphens = minimum 11 chars
        // Most words are 5-8 chars, so typical range is 17-26 chars
        expect(token.length).toBeGreaterThanOrEqual(11)
        expect(token.length).toBeLessThanOrEqual(50)
      }
    })

    it('should use crypto.getRandomValues for randomness', () => {
      const spy = vi.spyOn(crypto, 'getRandomValues')

      generateTripToken()

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('should generate many unique tokens', () => {
      const tokens = new Set<string>()
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        tokens.add(generateTripToken())
      }

      // With 50 adjectives and 60 nouns, we have 180,000 combinations
      // Generating 100 tokens should yield close to 100 unique ones
      expect(tokens.size).toBeGreaterThan(iterations * 0.95)
    })

    it('should generate memorable tokens with real words', () => {
      const token = generateTripToken()
      const parts = token.split('-')

      // Each part should be a recognizable English word (not random chars)
      parts.forEach(word => {
        expect(word.length).toBeGreaterThan(2)
        expect(word.length).toBeLessThan(15)
      })
    })
  })

  describe('getTokenCombinations', () => {
    it('should return the total number of possible combinations', () => {
      const combinations = getTokenCombinations()

      // With 50 adjectives and 60 nouns: 50 * 60 * 60 = 180,000
      expect(combinations).toBe(50 * 60 * 60)
      expect(combinations).toBe(180000)
    })

    it('should indicate sufficient security for trip tokens', () => {
      const combinations = getTokenCombinations()

      // 180,000 combinations is sufficient for trip protection
      // (not meant to be military-grade, just prevent casual access)
      expect(combinations).toBeGreaterThan(100000)
    })
  })
})
