import exifr from 'exifr'

export interface ResizeOptions {
  maxSize?: number // max width or height
  quality?: number // 0..1 for JPEG
  outputType?: 'image/jpeg' | 'image/webp'
}

function getOrientationTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  orientation: number | undefined
) {
  switch (orientation) {
    case 2:
      // Flip horizontal
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      break
    case 3:
      // Rotate 180
      ctx.translate(width, height)
      ctx.rotate(Math.PI)
      break
    case 4:
      // Flip vertical
      ctx.translate(0, height)
      ctx.scale(1, -1)
      break
    case 5:
      // Transpose
      ctx.rotate(0.5 * Math.PI)
      ctx.scale(1, -1)
      break
    case 6:
      // Rotate 90 CW
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(0, -height)
      break
    case 7:
      // Transverse
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(width, -height)
      ctx.scale(-1, 1)
      break
    case 8:
      // Rotate 90 CCW
      ctx.rotate(-0.5 * Math.PI)
      ctx.translate(-width, 0)
      break
    default:
      break
  }
}

export async function resizeImageFile(file: File, opts: ResizeOptions = {}): Promise<File> {
  const maxSize = opts.maxSize ?? 1600
  const quality = opts.quality ?? 0.85
  const outputType = opts.outputType ?? 'image/jpeg'

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const orientationData = await exifr.parse(file, { tiff: true }).catch(() => undefined)
  const orientation: number | undefined = (orientationData as { Orientation?: number } | undefined)
    ?.Orientation

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })

  // Compute target size
  let { width, height } = img
  const ratio = width / height
  if (width > height && width > maxSize) {
    width = maxSize
    height = Math.round(maxSize / ratio)
  } else if (height >= width && height > maxSize) {
    height = maxSize
    width = Math.round(maxSize * ratio)
  }

  // For rotations that swap width/height (5-8), adjust canvas dims
  const swapDims = orientation && [5, 6, 7, 8].includes(orientation)
  const canvas = document.createElement('canvas')
  canvas.width = swapDims ? height : width
  canvas.height = swapDims ? width : height
  const ctx = canvas.getContext('2d')!

  // Apply orientation transform
  getOrientationTransform(ctx, canvas.width, canvas.height, orientation)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      outputType,
      quality
    )
  })

  const newName = file.name.replace(/\.(png|jpeg|jpg|webp|heic|heif)$/i, '') + '.jpg'
  return new File([blob], newName, { type: outputType })
}

export async function resizeFiles(files: File[], options?: ResizeOptions): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    try {
      out.push(await resizeImageFile(f, options))
    } catch {
      // Fallback to original on failure
      out.push(f)
    }
  }
  return out
}
