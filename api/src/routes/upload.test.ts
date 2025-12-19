// Set environment before importing modules
process.env.JWT_SECRET = "test-secret-key-for-testing-only-32chars";
process.env.RP_ID = "localhost";
process.env.RP_NAME = "Test App";
process.env.RP_ORIGIN = "http://localhost:5173";
process.env.DATABASE_URL = "postgresql://vacay:vacay@localhost:5432/vacay";
process.env.PHOTOS_DIR = "./data/photos-test";

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { upload } from "./upload";
import { signToken } from "../utils/jwt";
import { getDbClient } from "../db/client";
import type { AuthEnv } from "../types/auth";
import { rm, mkdir } from "fs/promises";

// Response types
interface ErrorResponse {
  error: string;
}

interface UploadResponse {
  publicId: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

// Test constants
const TEST_TRIP_SLUG = "upload-test-trip-" + Date.now();
const PHOTOS_DIR = "./data/photos-test";

// Create test app
function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.route("/api", upload);
  return app;
}

// Helper to create auth headers
async function getAdminAuthHeader(): Promise<{ Authorization: string }> {
  const token = await signToken({
    sub: "admin-user-123",
    email: "admin@example.com",
    isAdmin: true,
  });
  return { Authorization: `Bearer ${token}` };
}

async function getUserAuthHeader(): Promise<{ Authorization: string }> {
  const token = await signToken({
    sub: "user-123",
    email: "user@example.com",
    isAdmin: false,
  });
  return { Authorization: `Bearer ${token}` };
}

// Helper to create a minimal valid JPEG file
function createJpegFile(filename = "test.jpg"): File {
  // Minimal valid JPEG (FFD8 start, FFD9 end)
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  return new File([jpegBytes], filename, { type: "image/jpeg" });
}

function createPngFile(filename = "test.png"): File {
  // Minimal PNG header
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new File([pngBytes], filename, { type: "image/png" });
}

function createWebpFile(filename = "test.webp"): File {
  // Minimal WebP header (RIFF....WEBP)
  const webpBytes = new Uint8Array([
    82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80,
  ]);
  return new File([webpBytes], filename, { type: "image/webp" });
}

// Helper to create form data with file
function createFormData(file: File): FormData {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

describe("Upload Routes", () => {
  let testTripId: string;
  const uploadedFiles: string[] = [];

  beforeAll(async () => {
    // Create test trip in database
    const db = getDbClient();
    const [trip] = await db<{ id: string }[]>`
      INSERT INTO trips (title, slug, is_public)
      VALUES ('Upload Test Trip', ${TEST_TRIP_SLUG}, true)
      RETURNING id
    `;
    testTripId = trip.id;

    // Ensure photos directory exists
    await mkdir(PHOTOS_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test trip
    const db = getDbClient();
    await db`DELETE FROM trips WHERE slug = ${TEST_TRIP_SLUG}`;

    // Clean up uploaded files
    for (const filePath of uploadedFiles) {
      await rm(filePath, { force: true }).catch(() => {});
    }

    // Clean up trip directory
    await rm(`${PHOTOS_DIR}/${testTripId}`, {
      recursive: true,
      force: true,
    }).catch(() => {});
  });

  // ==========================================================================
  // POST /api/trips/:tripId/photos/upload - Upload photo
  // ==========================================================================
  describe("POST /api/trips/:tripId/photos/upload", () => {
    it("returns 401 without authentication", async () => {
      const app = createTestApp();
      const file = createJpegFile();
      const formData = createFormData(file);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          body: formData,
        }),
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      const app = createTestApp();
      const authHeader = await getUserAuthHeader();
      const file = createJpegFile();
      const formData = createFormData(file);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Forbidden");
    });

    it("returns 404 for non-existent trip", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const file = createJpegFile();
      const formData = createFormData(file);

      const res = await app.fetch(
        new Request(
          `http://localhost/api/trips/00000000-0000-0000-0000-000000000000/photos/upload`,
          {
            method: "POST",
            headers: authHeader,
            body: formData,
          },
        ),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Trip not found");
    });

    it("returns 400 when no file is provided", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const formData = new FormData();

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("No file provided");
    });

    it("returns 400 for invalid file type", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const pdfFile = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });
      const formData = createFormData(pdfFile);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("not allowed");
    });

    it("uploads valid JPEG and returns 201", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const file = createJpegFile();
      const formData = createFormData(file);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as UploadResponse;
      expect(data.publicId).toContain(testTripId);
      expect(data.url).toContain("/api/photos/");
      expect(data.thumbnailUrl).toBe(data.url);
      expect(typeof data.width).toBe("number");
      expect(typeof data.height).toBe("number");

      // Track for cleanup
      const filename = data.publicId.split("/")[1];
      uploadedFiles.push(`${PHOTOS_DIR}/${testTripId}/${filename}`);
    });

    it("uploads valid PNG and returns 201", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const file = createPngFile();
      const formData = createFormData(file);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as UploadResponse;
      expect(data.publicId).toContain(".png");

      // Track for cleanup
      const filename = data.publicId.split("/")[1];
      uploadedFiles.push(`${PHOTOS_DIR}/${testTripId}/${filename}`);
    });

    it("uploads valid WebP and returns 201", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();
      const file = createWebpFile();
      const formData = createFormData(file);

      const res = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as UploadResponse;
      expect(data.publicId).toContain(".webp");

      // Track for cleanup
      const filename = data.publicId.split("/")[1];
      uploadedFiles.push(`${PHOTOS_DIR}/${testTripId}/${filename}`);
    });
  });

  // ==========================================================================
  // GET /api/photos/:tripId/:filename - Serve photo
  // ==========================================================================
  describe("GET /api/photos/:tripId/:filename", () => {
    const validFilename = "550e8400-e29b-41d4-a716-446655440001.jpg";

    it("returns 404 for non-existent file", async () => {
      const app = createTestApp();

      const res = await app.fetch(
        new Request(
          `http://localhost/api/photos/${testTripId}/${validFilename}`,
        ),
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Photo not found");
    });

    it("blocks directory traversal with encoded ..", async () => {
      const app = createTestApp();

      const res = await app.fetch(
        new Request(`http://localhost/api/photos/..%2F..%2Fetc/passwd.jpg`),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      // UUID validation catches this before path traversal check
      expect(data.error).toBe("Invalid trip ID format");
    });

    it("rejects invalid filename extension", async () => {
      const app = createTestApp();

      const res = await app.fetch(
        new Request(
          `http://localhost/api/photos/${testTripId}/550e8400-e29b-41d4-a716-446655440001.txt`,
        ),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Invalid filename");
    });

    it("rejects filename without UUID format", async () => {
      const app = createTestApp();

      const res = await app.fetch(
        new Request(`http://localhost/api/photos/${testTripId}/not-a-uuid.jpg`),
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe("Invalid filename");
    });

    it("serves uploaded file with correct headers", async () => {
      const app = createTestApp();
      const authHeader = await getAdminAuthHeader();

      // First upload a file
      const file = createJpegFile();
      const formData = createFormData(file);
      const uploadRes = await app.fetch(
        new Request(`http://localhost/api/trips/${testTripId}/photos/upload`, {
          method: "POST",
          headers: authHeader,
          body: formData,
        }),
      );
      const uploadData = (await uploadRes.json()) as UploadResponse;

      // Track for cleanup
      const filename = uploadData.publicId.split("/")[1];
      uploadedFiles.push(`${PHOTOS_DIR}/${testTripId}/${filename}`);

      // Then fetch it
      const res = await app.fetch(
        new Request(`http://localhost${uploadData.url}`),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Cache-Control")).toContain("max-age=31536000");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
    });
  });
});
