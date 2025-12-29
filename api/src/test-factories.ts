import { getDbClient } from "./db/client";

// ID generators using crypto.randomUUID() for robust parallel test execution
export function generateUserId(): string {
  return crypto.randomUUID();
}

export function generateTripSlug(prefix = "test-trip"): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// User factory
export interface CreateUserOptions {
  id?: string;
  email?: string;
  webauthnUserId?: string;
  isAdmin?: boolean;
  displayName?: string | null;
}

export async function createUser(options: CreateUserOptions = {}) {
  const db = getDbClient();
  const uniqueId = crypto.randomUUID().slice(0, 8);
  const id = options.id ?? generateUserId();
  const email = options.email ?? `test-user-${uniqueId}@example.com`;
  const webauthnUserId = options.webauthnUserId ?? `test-webauthn-${uniqueId}`;
  const isAdmin = options.isAdmin ?? false;
  const displayName = options.displayName ?? null;

  await db`
    INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin, display_name)
    VALUES (${id}, ${email}, ${webauthnUserId}, ${isAdmin}, ${displayName})
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          is_admin = EXCLUDED.is_admin,
          webauthn_user_id = EXCLUDED.webauthn_user_id,
          display_name = EXCLUDED.display_name
  `;

  return { id, email, webauthnUserId, isAdmin, displayName };
}

// Trip factory
export interface CreateTripOptions {
  slug?: string;
  title?: string;
  isPublic?: boolean;
  description?: string | null;
}

export async function createTrip(options: CreateTripOptions = {}) {
  const db = getDbClient();
  const now = Date.now();
  const slug = options.slug ?? generateTripSlug();
  const title = options.title ?? `Test Trip ${now}`;
  const isPublic = options.isPublic ?? true;
  const description = options.description ?? null;

  const [trip] = await db<{ id: string; slug: string; title: string }[]>`
    INSERT INTO trips (slug, title, is_public, description)
    VALUES (${slug}, ${title}, ${isPublic}, ${description})
    RETURNING id, slug, title
  `;

  return trip;
}

// Photo factory
export interface CreatePhotoOptions {
  tripId: string;
  key?: string;
  latitude?: number | null;
  longitude?: number | null;
  takenAt?: Date | null;
}

export async function createPhoto(options: CreatePhotoOptions) {
  const db = getDbClient();
  const uniqueId = crypto.randomUUID().slice(0, 8);
  const key = options.key ?? `test-photo-${uniqueId}.jpg`;
  const latitude = options.latitude ?? null;
  const longitude = options.longitude ?? null;
  const takenAt = options.takenAt ?? new Date();

  const [photo] = await db<{ id: string; key: string }[]>`
    INSERT INTO photos (trip_id, storage_key, url, thumbnail_url, latitude, longitude, taken_at)
    VALUES (${options.tripId}, ${key}, ${key}, ${key}, ${latitude}, ${longitude}, ${takenAt})
    RETURNING id, storage_key as key
  `;

  return photo;
}

// Cleanup helpers
export async function cleanupUser(userId: string) {
  const db = getDbClient();
  await db`DELETE FROM user_profiles WHERE id = ${userId}`;
}

export async function cleanupTrip(tripId: string) {
  const db = getDbClient();
  await db`DELETE FROM trips WHERE id = ${tripId}`;
}

export async function cleanupPhoto(photoId: string) {
  const db = getDbClient();
  await db`DELETE FROM photos WHERE id = ${photoId}`;
}
