// Cloudinary configuration and utilities

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

if (!cloudName || !uploadPreset) {
  throw new Error('Missing Cloudinary environment variables. Please check your .env file.')
}

export const cloudinaryConfig = {
  cloudName,
  uploadPreset,
  apiUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
}

export interface CloudinaryUploadResult {
  publicId: string
  url: string
  thumbnailUrl: string
  width: number
  height: number
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

/**
 * Upload an image file to Cloudinary using unsigned upload
 * @param file - The image file to upload
 * @param onProgress - Optional callback for upload progress
 * @returns Upload result with URLs and metadata
 */
export async function uploadToCloudinary(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<CloudinaryUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  // Note: folder can be configured in the upload preset settings if needed

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100)
          })
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve({
            publicId: response.public_id,
            url: response.secure_url,
            thumbnailUrl: generateThumbnailUrl(response.public_id),
            width: response.width,
            height: response.height
          })
        } catch (error) {
          reject(new Error('Failed to parse Cloudinary response'))
        }
      } else {
        // Try to parse error message from response
        let errorMessage = `Upload failed with status ${xhr.status}`
        try {
          const errorResponse = JSON.parse(xhr.responseText)
          if (errorResponse.error?.message) {
            errorMessage = errorResponse.error.message
          }
        } catch {
          // Use default error message
        }
        reject(new Error(errorMessage))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.open('POST', cloudinaryConfig.apiUrl)
    xhr.send(formData)
  })
}

/**
 * Generate a thumbnail URL from a Cloudinary public ID
 * Uses Cloudinary's transformation API to create optimized thumbnails
 */
export function generateThumbnailUrl(publicId: string, width = 400, height = 400): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_${width},h_${height},q_auto,f_auto/${publicId}`
}

/**
 * Generate an optimized image URL with transformations
 */
export function generateImageUrl(
  publicId: string,
  options: {
    width?: number
    height?: number
    quality?: 'auto' | number
    crop?: 'fill' | 'fit' | 'limit' | 'scale'
  } = {}
): string {
  const { width, height, quality = 'auto', crop = 'limit' } = options

  let transformations = `q_${quality},f_auto`

  if (width || height) {
    transformations += `,c_${crop}`
    if (width) transformations += `,w_${width}`
    if (height) transformations += `,h_${height}`
  }

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformations}/${publicId}`
}

/**
 * Upload multiple files in parallel with concurrency control
 */
export async function uploadMultipleFiles(
  files: File[],
  onProgress?: (fileIndex: number, progress: UploadProgress) => void,
  maxConcurrent = 3
): Promise<CloudinaryUploadResult[]> {
  const results: CloudinaryUploadResult[] = []
  const queue = [...files]
  let activeUploads = 0
  let completedCount = 0

  return new Promise((resolve, reject) => {
    const processNext = () => {
      if (queue.length === 0 && activeUploads === 0) {
        resolve(results)
        return
      }

      while (queue.length > 0 && activeUploads < maxConcurrent) {
        const file = queue.shift()!
        const fileIndex = completedCount + activeUploads

        activeUploads++

        uploadToCloudinary(file, progress => {
          if (onProgress) {
            onProgress(fileIndex, progress)
          }
        })
          .then(result => {
            results.push(result)
            activeUploads--
            completedCount++
            processNext()
          })
          .catch(error => {
            reject(error)
          })
      }
    }

    processNext()
  })
}
