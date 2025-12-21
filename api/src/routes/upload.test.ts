// Environment loaded automatically from .env.test via bunfig.toml preload

import { describe, expect, it, beforeAll, afterAll, mock } from "bun:test";
import { Hono } from "hono";
import { upload } from "./upload";
import { getDbClient } from "../db/client";
import type { AuthEnv } from "../types/auth";
import { rm, mkdir } from "fs/promises";
import {
  getAdminAuthHeader,
  getUserAuthHeader,
  createJpegFile,
  createPngFile,
  createWebpFile,
  createFormData,
} from "../test-helpers";

// Mock R2 to ensure tests use local filesystem fallback
mock.module("../utils/r2", () => ({
  uploadToR2: async () => false, // Returns false = R2 not configured, use local
  getFromR2: async () => null, // Returns null = not found in R2
  isR2Available: () => false, // R2 not configured in tests
  deleteMultipleFromR2: async () => 0,
  PHOTOS_URL_PREFIX: "/api/photos/",
}));

// Mock sharp to avoid native module issues in CI
mock.module("sharp", () => {
  const sharpMock = () => ({
    metadata: async () => ({ width: 800, height: 600 }),
  });
  sharpMock.default = sharpMock;
  return sharpMock;
});

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
