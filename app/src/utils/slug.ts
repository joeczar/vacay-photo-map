/**
 * Generate a URL-friendly slug from a string
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
}

/**
 * Generate a unique slug by appending a timestamp
 */
export function generateUniqueSlug(text: string): string {
  const baseSlug = generateSlug(text)
  const timestamp = Date.now().toString(36) // Base-36 encoded timestamp
  return `${baseSlug}-${timestamp}`
}
