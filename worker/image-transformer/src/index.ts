/**
 * Cloudflare Worker for serving transformed images from R2
 *
 * URL Pattern: /:key?w=800&r=90&q=80
 *
 * Query Parameters:
 * - w: width (optional, preserves aspect ratio)
 * - r: rotation (0, 90, 180, 270)
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

interface TransformOptions {
  width?: number
  rotate?: number
  quality: number
  format: 'auto'
}

const VALID_ROTATIONS = [0, 90, 180, 270]
const DEFAULT_QUALITY = 80
const MAX_QUALITY = 100
const MIN_QUALITY = 1

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Only allow GET and HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(request.url)

    // Extract key from path (remove leading /)
    const key = decodeURIComponent(url.pathname.slice(1))

    if (!key) {
      return new Response('Missing image key', { status: 400 })
    }

    // Validate key format (should be tripId/filename.ext)
    if (!isValidKey(key)) {
      return new Response('Invalid image key', { status: 400 })
    }

    // Parse transformation parameters
    const transforms = parseTransforms(url.searchParams)

    try {
      // First, verify the object exists in R2
      const object = await env.PHOTOS_BUCKET.head(key)
      if (!object) {
        return new Response('Image not found', { status: 404 })
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
            format: transforms.format,
          },
          // Cache the transformed image at the edge
          cacheTtl: 31536000, // 1 year
          cacheEverything: true,
        },
      })

      if (!imageResponse.ok) {
        console.error(`[image-transformer] Origin fetch failed: ${imageResponse.status}`)
        return new Response('Failed to fetch image', { status: 502 })
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
      console.error('[image-transformer] Error:', error)
      return new Response('Internal server error', { status: 500 })
    }
  },
}

function isValidKey(key: string): boolean {
  // Key format: tripId/filename.ext
  // tripId is a UUID, filename is uuid.ext
  const pattern = /^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i
  return pattern.test(key)
}

function parseTransforms(params: URLSearchParams): TransformOptions {
  const transforms: TransformOptions = {
    quality: DEFAULT_QUALITY,
    format: 'auto', // Auto-detect WebP/AVIF based on Accept header
  }

  // Parse width
  const width = params.get('w')
  if (width) {
    const parsedWidth = parseInt(width, 10)
    if (!isNaN(parsedWidth) && parsedWidth > 0 && parsedWidth <= 4096) {
      transforms.width = parsedWidth
    }
  }

  // Parse rotation
  const rotate = params.get('r')
  if (rotate) {
    const parsedRotate = parseInt(rotate, 10)
    if (VALID_ROTATIONS.includes(parsedRotate)) {
      transforms.rotate = parsedRotate
    }
  }

  // Parse quality
  const quality = params.get('q')
  if (quality) {
    const parsedQuality = parseInt(quality, 10)
    if (!isNaN(parsedQuality) && parsedQuality >= MIN_QUALITY && parsedQuality <= MAX_QUALITY) {
      transforms.quality = parsedQuality
    }
  }

  return transforms
}
