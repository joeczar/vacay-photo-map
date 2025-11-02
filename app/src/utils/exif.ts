import exifr from 'exifr'

export interface PhotoMetadata {
  latitude?: number
  longitude?: number
  takenAt?: Date
  make?: string
  model?: string
}

/**
 * Extract EXIF metadata from an image file
 */
export async function extractExif(file: File): Promise<PhotoMetadata> {
  try {
    const data = await exifr.parse(file, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'latitude', 'longitude']
    })

    if (!data) {
      return {}
    }

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      takenAt: data.DateTimeOriginal || data.CreateDate || new Date(),
      make: data.Make,
      model: data.Model
    }
  } catch (error) {
    console.warn('Failed to extract EXIF data:', error)
    return {
      takenAt: new Date() // Fallback to current date
    }
  }
}

/**
 * Extract EXIF data from multiple files
 */
export async function extractExifBatch(
  files: File[]
): Promise<Map<File, PhotoMetadata>> {
  const results = new Map<File, PhotoMetadata>()

  await Promise.all(
    files.map(async file => {
      const metadata = await extractExif(file)
      results.set(file, metadata)
    })
  )

  return results
}
