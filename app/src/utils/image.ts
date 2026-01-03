// Utilities for resolving image URLs

import { trimVercelEnv } from './env'

const API_URL = trimVercelEnv(import.meta.env.VITE_API_URL)
const RAW_CDN_URL = trimVercelEnv(import.meta.env.VITE_CDN_URL)

// Validate and normalize CDN URL at module load
const CDN_URL = RAW_CDN_URL.replace(/\/$/, '') // Remove trailing slash
if (CDN_URL && !import.meta.env.DEV) {
  if (!CDN_URL.startsWith('https://')) {
    console.warn('[image] VITE_CDN_URL should use HTTPS:', CDN_URL)
  }
}

/** Valid rotation values in degrees */
export type ValidRotation = 0 | 90 | 180 | 270

const VALID_ROTATIONS: readonly number[] = [0, 90, 180, 270]

export interface ImageParams {
  width?: number
  /** Rotation in degrees. Only 0, 90, 180, 270 are valid. Other values are ignored. */
  rotation?: number
  quality?: number
}

function isSelfHostedPhoto(url: string) {
  return url.startsWith('/api/photos/')
}

/**
 * Extract storage key from API photo URL
 * @example "/api/photos/550e8400-e29b-41d4-a716-446655440000/photo.jpg" -> "550e8400-e29b-41d4-a716-446655440000/photo.jpg"
 */
function extractStorageKey(url: string): string | null {
  const match = url.match(/^\/api\/photos\/(.+)$/)
  return match ? match[1] : null
}

/**
 * Build query string from image transformation params
 */
function buildQueryString(params: ImageParams): string {
  const query = new URLSearchParams()
  if (params.width) query.set('w', params.width.toString())
  // Only include rotation if it's a valid value (0, 90, 180, 270)
  if (params.rotation !== undefined && VALID_ROTATIONS.includes(params.rotation)) {
    query.set('r', params.rotation.toString())
  }
  if (params.quality) query.set('q', params.quality.toString())

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

// Track if we've warned about missing CDN to avoid log spam
let hasWarnedNoCdn = false

/**
 * Resolve image URL for display with optional transformations
 * - Development mode or no CDN: uses API route, ignores transformation params
 * - Production with CDN: uses CDN URL with transformation query params
 * - External URLs: returned as-is
 * - Empty/null URLs: returns empty string
 */
export function getImageUrl(url: string, params?: ImageParams): string {
  if (!url) return ''

  // External URLs - return as-is
  if (!isSelfHostedPhoto(url)) {
    return url
  }

  // Development mode - use API route with query params
  if (import.meta.env.DEV) {
    const queryString = params ? buildQueryString(params) : ''
    return `${API_URL}${url}${queryString}`
  }

  // Production without CDN configured - warn once and use API route with query params
  if (!CDN_URL) {
    if (!hasWarnedNoCdn) {
      console.warn('[image] VITE_CDN_URL not configured - using API routes in production (slower)')
      hasWarnedNoCdn = true
    }
    const queryString = params ? buildQueryString(params) : ''
    return `${API_URL}${url}${queryString}`
  }

  // Production with CDN - build CDN URL with transformations
  const storageKey = extractStorageKey(url)
  if (!storageKey) {
    // Log warning for debugging - this shouldn't happen with valid data
    console.warn(
      `[image] Could not extract storage key from URL: ${url} - falling back to API route`
    )
    return `${API_URL}${url}`
  }

  const queryString = params ? buildQueryString(params) : ''
  return `${CDN_URL}/${storageKey}${queryString}`
}

/**
 * Build srcset attribute for responsive images
 * @param url - Base image URL
 * @param widths - Array of widths for srcset (e.g., [200, 400, 800, 1200])
 * @param rotation - Optional rotation to apply to all sizes (0, 90, 180, 270)
 * @returns srcset string or empty string if in dev mode or no CDN
 */
export function buildSrcset(url: string, widths: number[], rotation?: number): string {
  // Only build srcset in production with CDN
  if (import.meta.env.DEV || !CDN_URL || !isSelfHostedPhoto(url)) {
    return ''
  }

  return widths
    .map(w => {
      const params: ImageParams = { width: w }
      if (rotation !== undefined && VALID_ROTATIONS.includes(rotation)) {
        params.rotation = rotation
      }
      const imageUrl = getImageUrl(url, params)
      return `${imageUrl} ${w}w`
    })
    .join(', ')
}
