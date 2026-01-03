/**
 * Environment variable utilities
 *
 * Vercel adds trailing newlines to environment variables when pasted
 * into their dashboard. This causes subtle bugs (e.g., srcset parsing fails
 * when CDN_URL has a trailing \n).
 */

/**
 * Trim whitespace/newlines that Vercel adds when copying env vars
 */
export function trimVercelEnv(value: string | undefined): string {
  return (value ?? '').trim()
}
