/**
 * Token Generator Utility
 * Generates human-readable 3-word access tokens for trip protection
 * Format: adjective-noun-noun (e.g., "bright-mountain-coffee")
 */

// Curated list of positive, easy-to-remember adjectives
const ADJECTIVES = [
  'bright',
  'calm',
  'clever',
  'cool',
  'cozy',
  'eager',
  'easy',
  'fair',
  'fancy',
  'fast',
  'fresh',
  'gentle',
  'glad',
  'golden',
  'grand',
  'grateful',
  'great',
  'green',
  'happy',
  'kind',
  'light',
  'lucky',
  'merry',
  'mighty',
  'neat',
  'nice',
  'noble',
  'perfect',
  'proud',
  'quick',
  'quiet',
  'rapid',
  'rich',
  'safe',
  'sharp',
  'silver',
  'simple',
  'smart',
  'smooth',
  'soft',
  'solid',
  'speedy',
  'sunny',
  'super',
  'swift',
  'tall',
  'warm',
  'wise',
  'witty',
  'young',
] as const

// Curated list of common, concrete nouns (easy to visualize and remember)
const NOUNS = [
  'anchor',
  'apple',
  'autumn',
  'beach',
  'bridge',
  'castle',
  'cloud',
  'coast',
  'coffee',
  'coral',
  'creek',
  'dawn',
  'desert',
  'diamond',
  'eagle',
  'echo',
  'field',
  'flame',
  'forest',
  'garden',
  'glacier',
  'harbor',
  'horizon',
  'island',
  'journey',
  'lake',
  'meadow',
  'moon',
  'morning',
  'mountain',
  'ocean',
  'palace',
  'pearl',
  'peak',
  'pine',
  'planet',
  'prairie',
  'rain',
  'rainbow',
  'river',
  'shadow',
  'spring',
  'star',
  'storm',
  'stream',
  'summer',
  'summit',
  'sunrise',
  'sunset',
  'thunder',
  'tiger',
  'tower',
  'trail',
  'valley',
  'voyage',
  'water',
  'wave',
  'willow',
  'winter',
  'wonder',
] as const

/**
 * Generates a cryptographically random integer between 0 (inclusive) and max (exclusive)
 * Uses rejection sampling to avoid modulo bias for uniform distribution
 */
function getRandomInt(max: number): number {
  // Use crypto.getRandomValues for cryptographic randomness
  // The loop prevents modulo bias, ensuring a uniform distribution
  const array = new Uint32Array(1)
  const maxAllowed = Math.floor(0x100000000 / max) * max
  let value

  do {
    crypto.getRandomValues(array)
    value = array[0]
  } while (value >= maxAllowed)

  return value % max
}

/**
 * Generates a random 3-word token in the format: adjective-noun-noun
 * Example: "bright-mountain-coffee"
 *
 * @returns A string token consisting of 3 words separated by hyphens
 */
export function generateTripToken(): string {
  const adjective = ADJECTIVES[getRandomInt(ADJECTIVES.length)]
  const noun1 = NOUNS[getRandomInt(NOUNS.length)]
  const noun2 = NOUNS[getRandomInt(NOUNS.length)]

  return `${adjective}-${noun1}-${noun2}`
}

/**
 * Calculate the total number of possible token combinations
 */
export function getTokenCombinations(): number {
  return ADJECTIVES.length * NOUNS.length * NOUNS.length
}
