import type { Role } from "../types/rbac";

/**
 * Shared validation utilities for API routes.
 * Database queries use postgres tagged templates - all values are automatically
 * parameterized and safe from SQL injection.
 */

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function isValidRole(role: string): role is Role {
  return role === "editor" || role === "viewer";
}

/**
 * Check if a database error is a unique constraint violation (PostgreSQL error code 23505)
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}
