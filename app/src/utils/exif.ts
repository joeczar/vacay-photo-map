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
    console.log(`📸 Extracting EXIF from: ${file.name}`)

    // Parse with explicit GPS options - need to request GPS data specifically
    const data = await exifr.parse(file, {
      gps: true,
      tiff: true,
      xmp: true, // Enable XMP to catch GPS in XMP format (iOS/edited photos)
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false
    })

    if (!data) {
      console.warn(`⚠️  No EXIF data found in ${file.name}`)
      return {
        takenAt: new Date()
      }
    }

    // Extract GPS coordinates (exifr automatically converts DMS to decimal)
    const latitude = data.latitude
    const longitude = data.longitude

    // Validate GPS coordinates
    if (latitude !== undefined && longitude !== undefined) {
      // Check for valid coordinate ranges
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        // Check it's not the null island (0,0) which usually indicates invalid data
        if (latitude !== 0 || longitude !== 0) {
          console.log(
            `✅ GPS found in ${file.name}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          )
        } else {
          console.warn(`⚠️  GPS coordinates are (0,0) in ${file.name} - likely invalid`)
          return {
            takenAt: data.DateTimeOriginal || data.CreateDate || new Date(),
            make: data.Make,
            model: data.Model
          }
        }
      } else {
        console.warn(`⚠️  GPS coordinates out of range in ${file.name}: ${latitude}, ${longitude}`)
        return {
          takenAt: data.DateTimeOriginal || data.CreateDate || new Date(),
          make: data.Make,
          model: data.Model
        }
      }
    } else {
      console.warn(`⚠️  No GPS coordinates in ${file.name}`)
    }

    return {
      latitude,
      longitude,
      takenAt: data.DateTimeOriginal || data.CreateDate || new Date(),
      make: data.Make,
      model: data.Model
    }
  } catch (error) {
    console.error(`❌ Failed to extract EXIF data from ${file.name}:`, error)
    return {
      takenAt: new Date() // Fallback to current date
    }
  }
}

/**
 * Extract GPS coordinates only (faster than full EXIF extraction)
 * Use this when you only need location data
 */
export async function extractGPS(
  file: File
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    // exifr.gps() is optimized specifically for GPS extraction (30x faster than parse)
    const gps = await exifr.gps(file)

    if (!gps || gps.latitude === undefined || gps.longitude === undefined) {
      return null
    }

    // Validate coordinate ranges
    if (gps.latitude < -90 || gps.latitude > 90 || gps.longitude < -180 || gps.longitude > 180) {
      console.error(`Invalid GPS coordinates in ${file.name}: ${gps.latitude}, ${gps.longitude}`)
      return null
    }

    // Check for null island (0,0)
    if (gps.latitude === 0 && gps.longitude === 0) {
      console.warn(`GPS coordinates are (0,0) in ${file.name} - likely invalid`)
      return null
    }

    return {
      latitude: gps.latitude,
      longitude: gps.longitude
    }
  } catch (error) {
    console.error(`Failed to extract GPS from ${file.name}:`, error)
    return null
  }
}

/**
 * Extract EXIF data from multiple files in parallel
 */
export async function extractExifBatch(files: File[]): Promise<Map<File, PhotoMetadata>> {
  console.log(`📦 Extracting EXIF from ${files.length} files...`)
  const results = new Map<File, PhotoMetadata>()

  await Promise.all(
    files.map(async file => {
      const metadata = await extractExif(file)
      results.set(file, metadata)
    })
  )

  const withGPS = Array.from(results.values()).filter(m => m.latitude && m.longitude).length
  console.log(`✅ Extraction complete: ${withGPS}/${files.length} photos have GPS data`)

  return results
}
