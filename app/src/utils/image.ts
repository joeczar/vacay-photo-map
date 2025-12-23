// Utilities for resolving image URLs

const API_URL = import.meta.env.VITE_API_URL || ''

function isSelfHostedPhoto(url: string) {
  return url.startsWith('/api/photos/')
}

/**
 * Resolve image URL for display
 * - Self-hosted photos: prepends API_URL (needed for local dev)
 * - External URLs: returned as-is
 */
export function getImageUrl(url: string): string {
  if (!url) return ''
  if (isSelfHostedPhoto(url)) {
    return `${API_URL}${url}`
  }
  return url
}
