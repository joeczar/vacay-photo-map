/**
 * Cloudflare Worker for serving transformed images from R2
 *
 * URL Pattern: /:key?w=800&r=90&q=80
 *
 * Query Parameters:
 * - w: width (optional, preserves aspect ratio, max 4096)
 * - r: rotation (0, 90, 180, 270 only)
 * - q: quality (1-100, default: 80)
 *
 * Setup Requirements:
 * 1. R2 bucket must have a custom domain configured (e.g., raw-images.joeczar.com)
 * 2. Set R2_ORIGIN_URL secret in wrangler: wrangler secret put R2_ORIGIN_URL
 * 3. Image Transformations must be enabled for your zone
 */

interface Env {
  PHOTOS_BUCKET: R2Bucket
  R2_ORIGIN_URL: string // e.g., https://raw-images.joeczar.com
}

/**
 * Valid rotation values in degrees.
 * Note: 0 is accepted as "no rotation" for API consistency, but won't be passed
 * to Cloudflare (only 90, 180, 270 are valid cf.image rotate values).
 */
type ValidRotation = 0 | 90 | 180 | 270

interface TransformOptions {
  width?: number
  rotate?: ValidRotation
  quality: number
  format: string // 'auto' is valid but not in @cloudflare/workers-types
}

// Accept 0 as input (means "no rotation"), but it won't be passed to Cloudflare
// since we use `transforms.rotate && { rotate: ... }` which is falsy for 0
const VALID_ROTATIONS: readonly ValidRotation[] = [0, 90, 180, 270]
const DEFAULT_QUALITY = 80
const MAX_QUALITY = 100
const MIN_QUALITY = 1
const MAX_WIDTH = 4096

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Create an error response with CORS headers
 */
function errorResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: CORS_HEADERS })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Only allow GET and HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse('Method not allowed', 405)
    }

    const url = new URL(request.url)

    // Extract key from path (remove leading /)
    const key = decodeURIComponent(url.pathname.slice(1))

    if (!key) {
      return errorResponse('Missing image key', 400)
    }

    // Validate key format (should be tripId/filename.ext)
    if (!isValidKey(key)) {
      console.warn(`[image-transformer] Invalid key format rejected: ${key}`)
      return errorResponse('Invalid image key', 400)
    }

    // Parse transformation parameters
    const transforms = parseTransforms(url.searchParams)

    try {
      // Validate R2_ORIGIN_URL is configured
      if (!env.R2_ORIGIN_URL) {
        console.error('[image-transformer] R2_ORIGIN_URL secret not configured')
        return errorResponse('Service misconfigured', 503)
      }

      // First, verify the object exists in R2
      const object = await env.PHOTOS_BUCKET.head(key)
      if (!object) {
        return errorResponse('Image not found', 404)
      }

      // Build the origin URL for the raw image
      // R2 custom domain serves the raw image, we apply transformations via cf.image
      const originUrl = `${env.R2_ORIGIN_URL}/${key}`

      // Fetch with Image Transformations applied
      const imageResponse = await fetch(originUrl, {
        cf: {
          image: {
            ...(transforms.width && { width: transforms.width }),
            ...(transforms.rotate && { rotate: transforms.rotate }),
            quality: transforms.quality,
            // 'auto' is valid per Cloudflare docs but not in @cloudflare/workers-types
            format: transforms.format as 'webp',
          },
          // Cache the transformed image at the edge
          cacheTtl: 31536000, // 1 year
          cacheEverything: true,
        },
      })

      if (!imageResponse.ok) {
        // Log detailed error info for debugging
        const errorBody = await imageResponse.text().catch(() => 'Unable to read body')
        console.error('[image-transformer] Origin fetch failed', {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          body: errorBody.slice(0, 500),
          key,
          originUrl,
        })
        return errorResponse('Failed to fetch image', 502)
      }

      // Return with cache and CORS headers
      const headers = new Headers(imageResponse.headers)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v))

      return new Response(imageResponse.body, {
        status: 200,
        headers,
      })
    } catch (error) {
      console.error('[image-transformer] Unexpected error:', error)
      return errorResponse('Internal server error', 500)
    }
  },
}

function isValidKey(key: string): boolean {
  // Key format: tripId/filename.ext
  // Both tripId and filename must be valid UUIDs (strict format)
  const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  const pattern = new RegExp(`^${uuidPattern}/${uuidPattern}\\.(jpg|jpeg|png|webp)$`, 'i')
  return pattern.test(key)
}

function parseTransforms(params: URLSearchParams): TransformOptions {
  const transforms: TransformOptions = {
    quality: DEFAULT_QUALITY,
    format: 'auto', // Cloudflare auto-selects WebP/AVIF based on browser Accept header
  }

  // Parse width
  const width = params.get('w')
  if (width) {
    const parsedWidth = parseInt(width, 10)
    if (!isNaN(parsedWidth) && parsedWidth > 0 && parsedWidth <= MAX_WIDTH) {
      transforms.width = parsedWidth
    } else {
      console.warn(`[image-transformer] Invalid width parameter ignored: ${width}`)
    }
  }

  // Parse rotation
  const rotate = params.get('r')
  if (rotate) {
    const parsedRotate = parseInt(rotate, 10)
    if (VALID_ROTATIONS.includes(parsedRotate as ValidRotation)) {
      transforms.rotate = parsedRotate as ValidRotation
    } else {
      console.warn(`[image-transformer] Invalid rotation parameter ignored: ${rotate} (valid: 0, 90, 180, 270)`)
    }
  }

  // Parse quality
  const quality = params.get('q')
  if (quality) {
    const parsedQuality = parseInt(quality, 10)
    if (!isNaN(parsedQuality) && parsedQuality >= MIN_QUALITY && parsedQuality <= MAX_QUALITY) {
      transforms.quality = parsedQuality
    } else {
      console.warn(`[image-transformer] Invalid quality parameter ignored: ${quality} (valid: 1-100)`)
    }
  }

  return transforms
}
