// Utilities for building responsive Cloudinary image URLs from full secure URLs

function isCloudinaryUrl(url: string) {
  return /https?:\/\/res\.cloudinary\.com\//.test(url)
}

function insertTransform(url: string, transform: string) {
  // Insert transformation segment after '/upload/'
  const marker = '/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  return url.slice(0, idx + marker.length) + transform + '/' + url.slice(idx + marker.length)
}

export function cloudinaryUrlForWidth(
  url: string,
  width: number,
  { crop = 'limit', quality = 'auto', format = 'auto' }: { crop?: string; quality?: 'auto' | number; format?: 'auto' | 'jpg' | 'webp' } = {}
) {
  if (!isCloudinaryUrl(url)) return url
  const transform = `q_${quality},f_${format},c_${crop},w_${width}`
  return insertTransform(url, transform)
}

export function buildSrcSet(
  url: string,
  widths: number[] = [320, 480, 640, 768, 960, 1200]
) {
  if (!isCloudinaryUrl(url)) return ''
  return widths
    .sort((a, b) => a - b)
    .map(w => `${cloudinaryUrlForWidth(url, w)} ${w}w`)
    .join(', ')
}

