/**
 * Cloudflare R2 Storage Client
 *
 * Wrapper around AWS S3 SDK for R2 operations. Returns null for all
 * operations if R2 credentials are not configured, allowing local
 * development without R2.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";

// URL prefix for photo serving - used to extract R2 keys from URLs
export const PHOTOS_URL_PREFIX = "/api/photos/";

// Environment validation
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Check if R2 is configured
const isR2Configured = !!(
  R2_ACCOUNT_ID &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_BUCKET_NAME
);

// Initialize S3 client for R2
let r2Client: S3Client | null = null;

if (isR2Configured) {
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Upload file to R2 bucket
 * @param key - Object key (e.g., "tripId/filename.jpg")
 * @param body - File buffer
 * @param contentType - MIME type (e.g., "image/jpeg")
 * @returns true if uploaded, false if R2 not configured
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<boolean> {
  if (!r2Client || !R2_BUCKET_NAME) {
    return false;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(
      `R2 upload failed for key "${key}". Falling back to local storage.`,
      error,
    );
    return false;
  }
}

/**
 * Get file from R2 bucket
 * @param key - Object key (e.g., "tripId/filename.jpg")
 * @returns GetObjectCommandOutput or null if not found/not configured
 */
export async function getFromR2(
  key: string,
): Promise<GetObjectCommandOutput | null> {
  if (!r2Client || !R2_BUCKET_NAME) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    return await r2Client.send(command);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

/**
 * Delete single file from R2 bucket
 * @param key - Object key (e.g., "tripId/filename.jpg")
 * @returns true if deleted, false if R2 not configured
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  if (!r2Client || !R2_BUCKET_NAME) {
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(`Failed to delete ${key} from R2:`, error);
    // Don't throw - deletion errors shouldn't fail the request
    // Database is source of truth
    return false;
  }
}

/**
 * Delete multiple files from R2 bucket (batch operation)
 * @param keys - Array of object keys
 * @returns Number of files deleted
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<number> {
  if (!r2Client || !R2_BUCKET_NAME || keys.length === 0) {
    return 0;
  }

  try {
    const command = new DeleteObjectsCommand({
      Bucket: R2_BUCKET_NAME,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    });

    const result = await r2Client.send(command);
    return result.Deleted?.length || 0;
  } catch (error) {
    console.error(`Failed to delete ${keys.length} files from R2:`, error);
    // Don't throw - deletion errors shouldn't fail the request
    return 0;
  }
}

/**
 * Check if R2 is configured and available
 */
export function isR2Available(): boolean {
  return isR2Configured;
}
