import { Hono } from "hono";
import sharp from "sharp";
import { requireAdmin } from "../middleware/auth";
import { validateImageFile } from "../middleware/fileValidation";
import type { UploadResult } from "../types/upload";
import type { AuthEnv } from "../types/auth";
import { getDbClient } from "../db/client";
import { uploadToR2, getFromR2 } from "../utils/r2";

// Local photos directory (fallback if R2 not configured)
export function getPhotosDir(): string {
  return process.env.PHOTOS_DIR || "/data/photos";
}

// UUID validation
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

const upload = new Hono<AuthEnv>();

// =============================================================================
// POST /api/trips/:tripId/photos/upload - Upload single photo (admin only)
// =============================================================================
upload.post("/trips/:tripId/photos/upload", requireAdmin, async (c) => {
  const tripId = c.req.param("tripId");

  // 1. Validate tripId format
  if (!isValidUUID(tripId)) {
    return c.json({ error: "Invalid trip ID format" }, 400);
  }

  // 2. Verify trip exists
  const db = getDbClient();
  const tripResults = await db<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}
  `;

  if (tripResults.length === 0) {
    return c.json({ error: "Trip not found" }, 404);
  }

  // 3. Parse multipart form data
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  // 4. Validate file
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  // 5. Generate filename
  const uuid = crypto.randomUUID();
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const filename = `${uuid}.${ext}`;
  const key = `${tripId}/${filename}`;

  // 6. Process image with sharp to get dimensions and upload to R2
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  try {
    await uploadToR2(key, buffer, file.type);
  } catch (err) {
    console.error("R2 Upload Error:", err);
    return c.json({ error: "Failed to upload to storage" }, 500);
  }

  // 7. Build response
  const result: UploadResult = {
    publicId: key,
    url: `/api/photos/${key}`,
    thumbnailUrl: `/api/photos/${key}`,
    width,
    height,
  };

  return c.json(result, 201);
});

// =============================================================================
// GET /api/photos/:tripId/:filename - Serve photo (public)
// =============================================================================
upload.get("/photos/:tripId/:filename", async (c) => {
  const tripId = c.req.param("tripId");
  const filename = c.req.param("filename");

  // Validate tripId is a UUID (prevents directory traversal)
  if (!isValidUUID(tripId)) {
    return c.json({ error: "Invalid trip ID format" }, 400);
  }

  // Security: Prevent directory traversal in filename
  if (filename.includes("..")) {
    return c.json({ error: "Invalid path" }, 400);
  }

  // Validate filename format (uuid.ext)
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  const key = `${tripId}/${filename}`;

  try {
    const response = await getFromR2(key);

    if (!response.Body) {
      return c.json({ error: "Photo not found" }, 404);
    }

    // Determine content type (fallback to JPEG)
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

    // Serve with cache headers
    return new Response(response.Body as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return c.json({ error: "Photo not found" }, 404);
    }
    console.error("R2 Fetch Error:", err);
    return c.json({ error: "Storage error" }, 500);
  }
});

export { upload };
