import { Hono } from 'hono'
import { requireAdmin } from '../middleware/auth'
import { validateImageFile } from '../middleware/fileValidation'
import type { UploadResult } from '../types/upload'
import type { AuthEnv } from '../types/auth'
import { getDbClient } from '../db/client'

const upload = new Hono<AuthEnv>()

// =============================================================================
// POST /api/trips/:tripId/photos/upload - Upload single photo (admin only)
// =============================================================================
upload.post('/trips/:tripId/photos/upload', requireAdmin, async (c) => {
  const tripId = c.req.param('tripId')

  // 1. Verify trip exists
  const db = getDbClient()
  const tripResults = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `

  if (tripResults.length === 0) {
    return c.json({ error: 'Trip not found' }, 404)
  }

  // 2. Parse multipart form data
  const body = await c.req.parseBody()
  const file = body['file']

  if (!(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400)
  }

  // 3. Validate file
  const validation = validateImageFile(file)
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400)
  }

  // 4. Generate filename and ensure directory exists
  const uuid = crypto.randomUUID()
  const ext =
    file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${uuid}.${ext}`
  const dirPath = `/data/photos/${tripId}`
  const filePath = `${dirPath}/${filename}`

  // Create directory if it doesn't exist
  await Bun.write(`${dirPath}/.keep`, '') // Ensures directory exists

  // 5. Write file to disk
  const arrayBuffer = await file.arrayBuffer()
  await Bun.write(filePath, arrayBuffer)

  // 6. Build response (matching Cloudinary interface)
  const result: UploadResult = {
    publicId: `${tripId}/${filename}`,
    url: `/api/photos/${tripId}/${filename}`,
    thumbnailUrl: `/api/photos/${tripId}/${filename}`, // Same until #82
    width: 0, // TODO: Extract with sharp in #82
    height: 0,
  }

  return c.json(result, 201)
})

// =============================================================================
// GET /api/photos/:tripId/:filename - Serve photo (public)
// =============================================================================
upload.get('/photos/:tripId/:filename', async (c) => {
  const tripId = c.req.param('tripId')
  const filename = c.req.param('filename')

  // Security: Prevent directory traversal
  if (tripId.includes('..') || filename.includes('..')) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  // Validate filename format (uuid.ext)
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const filePath = `/data/photos/${tripId}/${filename}`
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    return c.json({ error: 'Photo not found' }, 404)
  }

  // Determine content type
  const ext = filename.split('.').pop()?.toLowerCase()
  const contentType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

  // Serve with cache headers
  return new Response(file, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})

export { upload }
