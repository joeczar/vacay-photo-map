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

      const tokens = new Set([token1, token2, token3])
      expect(tokens.size).toBe(3)
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

      expect(tokens.size).toBeGreaterThan(iterations * 0.95)
    })

    it('should generate memorable tokens with real words', () => {
      const token = generateTripToken()
      const parts = token.split('-')

      parts.forEach(word => {
        expect(word.length).toBeGreaterThan(2)
        expect(word.length).toBeLessThan(15)
      })
    })
  })

  describe('getTokenCombinations', () => {
    it('should return the total number of possible combinations', () => {
      const combinations = getTokenCombinations()

      expect(combinations).toBe(180000)
    })

    it('should indicate sufficient security for trip tokens', () => {
      const combinations = getTokenCombinations()

      expect(combinations).toBeGreaterThan(100000)
    })
  })
})
