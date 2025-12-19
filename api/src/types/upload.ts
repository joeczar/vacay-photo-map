/**
 * Uploaded file metadata (from multipart form)
 */
export interface UploadedFile {
  /** Original filename */
  filename: string
  /** Temporary path on disk */
  path: string
  /** File size in bytes */
  size: number
  /** MIME type */
  mimetype: string
}

/**
 * Upload result matching Cloudinary interface
 * This keeps frontend changes minimal during migration
 */
export interface UploadResult {
  /** Photo identifier in format {tripId}/{filename} */
  publicId: string
  /** Full-size photo URL */
  url: string
  /** Thumbnail URL (same as url until #82 implements server-side thumbnails) */
  thumbnailUrl: string
  /** Image width in pixels (0 if not available) */
  width: number
  /** Image height in pixels (0 if not available) */
  height: number
}
