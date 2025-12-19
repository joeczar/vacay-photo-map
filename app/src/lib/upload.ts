// Upload client for self-hosted photo storage
// Replaces Cloudinary with our own API endpoint

const API_URL = import.meta.env.VITE_API_URL || ''

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface UploadResult {
  publicId: string
  url: string
  thumbnailUrl: string
  width: number
  height: number
}

export interface UploadError {
  index: number
  filename: string
  error: string
}

export interface MultiUploadResult {
  results: (UploadResult | null)[]
  errors: UploadError[]
}

/**
 * Upload a single photo to the API
 * @param tripId - The trip ID to upload the photo to
 * @param file - The image file to upload
 * @param token - JWT authentication token
 * @param onProgress - Optional callback for upload progress
 * @returns Upload result with URLs and metadata
 */
export function uploadPhoto(
  tripId: string,
  file: File,
  token: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    // Track upload progress
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100)
        })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText)
          resolve(result)
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        // Try to parse error message from response
        let errorMessage = `Upload failed with status ${xhr.status}`
        try {
          const error = JSON.parse(xhr.responseText)
          if (error.error) {
            errorMessage = error.error
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

    xhr.open('POST', `${API_URL}/api/trips/${tripId}/photos/upload`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}

/**
 * Upload multiple files with concurrency control
 * Continues on failures and returns both successes and errors
 * @param tripId - The trip ID to upload photos to
 * @param files - Array of image files to upload
 * @param token - JWT authentication token
 * @param onProgress - Optional callback for per-file upload progress
 * @param maxConcurrent - Maximum number of concurrent uploads (default: 3)
 * @returns Results and errors arrays
 */
export async function uploadMultipleFiles(
  tripId: string,
  files: File[],
  token: string,
  onProgress?: (fileIndex: number, progress: UploadProgress) => void,
  maxConcurrent = 3
): Promise<MultiUploadResult> {
  const results: (UploadResult | null)[] = new Array(files.length).fill(null)
  const errors: UploadError[] = []
  let nextIndex = 0
  let activeUploads = 0

  return new Promise(resolve => {
    const processNext = () => {
      // All done
      if (nextIndex >= files.length && activeUploads === 0) {
        resolve({ results, errors })
        return
      }

      // Start new uploads up to the concurrency limit
      while (nextIndex < files.length && activeUploads < maxConcurrent) {
        const fileIndex = nextIndex
        const file = files[fileIndex]
        nextIndex++
        activeUploads++

        uploadPhoto(
          tripId,
          file,
          token,
          onProgress ? progress => onProgress(fileIndex, progress) : undefined
        )
          .then(result => {
            results[fileIndex] = result
            activeUploads--
            processNext()
          })
          .catch(error => {
            errors.push({
              index: fileIndex,
              filename: file.name,
              error: error instanceof Error ? error.message : 'Upload failed'
            })
            activeUploads--
            processNext()
          })
      }
    }

    processNext()
  })
}
