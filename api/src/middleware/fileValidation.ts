/**
 * File validation utilities for photo uploads
 */

/** Maximum file size in megabytes */
export const MAX_FILE_SIZE_MB = 10;

/** Maximum file size in bytes */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Allowed MIME types for photo uploads */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * File signature magic numbers for validating actual file type
 */
const FILE_SIGNATURES = {
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  WEBP_RIFF: [0x52, 0x49, 0x46, 0x46],
  WEBP_WEBP: [0x57, 0x45, 0x42, 0x50],
};

/**
 * Read file signature bytes from file
 * Uses slice() to avoid loading entire file into memory
 */
async function readFileSignature(
  file: File,
  byteCount: number,
): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = (file as any).slice(0, byteCount) as Blob;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Check if byte array matches signature at given offset
 */
function matchesSignature(
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Validate file signature matches declared MIME type
 * Prevents MIME type spoofing attacks
 */
export async function validateFileSignature(file: File): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Read first 12 bytes (enough for all supported formats)
  const header = await readFileSignature(file, 12);

  // JPEG check (FFD8FF...)
  if (matchesSignature(header, FILE_SIGNATURES.JPEG)) {
    if (file.type !== "image/jpeg") {
      return {
        valid: false,
        error: "File signature does not match declared MIME type",
      };
    }
    return { valid: true };
  }

  // PNG check (89504E47...)
  if (matchesSignature(header, FILE_SIGNATURES.PNG)) {
    if (file.type !== "image/png") {
      return {
        valid: false,
        error: "File signature does not match declared MIME type",
      };
    }
    return { valid: true };
  }

  // WebP check (RIFF at 0-3, WEBP at 8-11)
  if (
    matchesSignature(header, FILE_SIGNATURES.WEBP_RIFF, 0) &&
    matchesSignature(header, FILE_SIGNATURES.WEBP_WEBP, 8)
  ) {
    if (file.type !== "image/webp") {
      return {
        valid: false,
        error: "File signature does not match declared MIME type",
      };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: "Unrecognized file signature",
  };
}

/**
 * Check if file type is allowed
 */
export function isValidImageType(file: File): boolean {
  return ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType);
}

/**
 * Check if file size is within limit
 */
export function isValidFileSize(
  file: File,
  maxSizeMB: number = MAX_FILE_SIZE_MB,
): boolean {
  return file.size <= maxSizeMB * 1024 * 1024;
}

/**
 * Validate image file type and size
 * Returns validation result with error message if invalid
 */
export async function validateImageFile(file: File): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!isValidImageType(file)) {
    return {
      valid: false,
      error: `File type ${file.type} not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  if (!isValidFileSize(file)) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${MAX_FILE_SIZE_MB}MB`,
    };
  }

  // Validate file signature matches declared MIME type
  const signatureValidation = await validateFileSignature(file);
  if (!signatureValidation.valid) {
    return signatureValidation;
  }

  return { valid: true };
}
