/**
 * Shared Test Helpers
 *
 * Centralized utilities for API tests. Import these instead of duplicating
 * helper functions in each test file.
 */

import { signToken } from "./utils/jwt";

// =============================================================================
// Auth Helpers
// =============================================================================

/**
 * Generate auth header for admin user
 */
export async function getAdminAuthHeader(
  userId = "admin-user-123",
  email = "admin@example.com",
): Promise<{ Authorization: string }> {
  const token = await signToken({
    sub: userId,
    email,
    isAdmin: true,
  });
  return { Authorization: `Bearer ${token}` };
}

/**
 * Generate auth header for regular user
 */
export async function getUserAuthHeader(
  userId = "user-123",
  email = "user@example.com",
): Promise<{ Authorization: string }> {
  const token = await signToken({
    sub: userId,
    email,
    isAdmin: false,
  });
  return { Authorization: `Bearer ${token}` };
}

// =============================================================================
// Rate Limiting Helpers
// =============================================================================

/**
 * Counter for generating unique IPs
 * Ensures each test request gets a unique IP to avoid rate limiting
 */
let ipCounter = 0;

/**
 * Generate unique IP for rate limiting tests
 * Uses counter to ensure each call gets a unique IP
 */
export function uniqueIp(): string {
  return `10.0.0.${++ipCounter}`;
}

/**
 * Reset IP counter (call in beforeEach if needed)
 */
export function resetIpCounter(): void {
  ipCounter = 0;
}

/**
 * Create request with unique IP (for rate limit tests)
 */
export function createRequestWithUniqueIp(
  url: string,
  options: RequestInit = {},
): Request {
  const headers = new Headers(options.headers);
  headers.set("X-Forwarded-For", uniqueIp());
  return new Request(url, { ...options, headers });
}

// =============================================================================
// File Creation Helpers
// =============================================================================

/**
 * Create minimal valid JPEG file for upload tests
 */
export function createJpegFile(filename = "test.jpg"): File {
  // Minimal valid JPEG (FFD8 start, FFD9 end)
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  return new File([jpegBytes], filename, { type: "image/jpeg" });
}

/**
 * Create minimal valid PNG file for upload tests
 */
export function createPngFile(filename = "test.png"): File {
  // Minimal PNG header
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new File([pngBytes], filename, { type: "image/png" });
}

/**
 * Create minimal valid WebP file for upload tests
 */
export function createWebpFile(filename = "test.webp"): File {
  // Minimal WebP header (RIFF....WEBP)
  const webpBytes = new Uint8Array([
    82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80,
  ]);
  return new File([webpBytes], filename, { type: "image/webp" });
}

/**
 * Create FormData with file for upload tests
 */
export function createFormData(file: File): FormData {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}
