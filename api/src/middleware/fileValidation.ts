/**
 * File validation utilities for photo uploads
 */

/** Maximum file size in megabytes */
export const MAX_FILE_SIZE_MB = 10

/** Maximum file size in bytes */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

/** Allowed MIME types for photo uploads */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

/**
 * Check if file type is allowed
 */
export function isValidImageType(file: File): boolean {
  return ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)
}

/**
 * Check if file size is within limit
 */
export function isValidFileSize(
  file: File,
  maxSizeMB: number = MAX_FILE_SIZE_MB,
): boolean {
  return file.size <= maxSizeMB * 1024 * 1024
}

/**
 * Validate image file type and size
 * Returns validation result with error message if invalid
 */
export function validateImageFile(file: File): {
  valid: boolean
  error?: string
} {
  if (!isValidImageType(file)) {
    return {
      valid: false,
      error: `File type ${file.type} not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    }
  }

  if (!isValidFileSize(file)) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${MAX_FILE_SIZE_MB}MB`,
    }
  }

  return { valid: true }
}
