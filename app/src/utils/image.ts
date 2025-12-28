// Utilities for resolving image URLs

const API_URL = import.meta.env.VITE_API_URL || ''
const CDN_URL = import.meta.env.VITE_CDN_URL || ''

export interface ImageParams {
  width?: number
  rotation?: number
  quality?: number
}

function isSelfHostedPhoto(url: string) {
  return url.startsWith('/api/photos/')
}

/**
 * Extract storage key from API photo URL
 * @example "/api/photos/abc123" -> "abc123"
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
  if (params.rotation) query.set('r', params.rotation.toString())
  if (params.quality) query.set('q', params.quality.toString())

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Resolve image URL for display with optional transformations
 * - Development mode or no CDN: uses API route, ignores transformation params
 * - Production with CDN: uses CDN URL with transformation query params
 * - External URLs: returned as-is
 */
export function getImageUrl(url: string, params?: ImageParams): string {
  if (!url) return ''

  // External URLs - return as-is
  if (!isSelfHostedPhoto(url)) {
    return url
  }

  // Development mode or no CDN configured - use API route
  if (import.meta.env.DEV || !CDN_URL) {
    return `${API_URL}${url}`
  }

  // Production with CDN - build CDN URL with transformations
  const storageKey = extractStorageKey(url)
  if (!storageKey) {
    // Fallback to API route if we can't extract storage key
    return `${API_URL}${url}`
  }

  const queryString = params ? buildQueryString(params) : ''
  return `${CDN_URL}/${storageKey}${queryString}`
}

/**
 * Build srcset attribute for responsive images
 * @param url - Base image URL
 * @param widths - Array of widths for srcset (e.g., [200, 400, 800, 1200])
 * @param rotation - Optional rotation to apply to all sizes
 * @returns srcset string or empty string if in dev mode or no CDN
 */
export function buildSrcset(url: string, widths: number[], rotation?: number): string {
  // Only build srcset in production with CDN
  if (import.meta.env.DEV || !CDN_URL || !isSelfHostedPhoto(url)) {
    return ''
  }

  return widths
    .map(width => {
      const params: ImageParams = { width }
      if (rotation !== undefined) {
        params.rotation = rotation
      }
      const imageUrl = getImageUrl(url, params)
      return `${imageUrl} ${width}w`
    })
    .join(', ')
}
