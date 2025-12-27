import { api } from './api'
import { useAuth } from '@/composables/useAuth'

export type Role = 'editor' | 'viewer'

export interface TripAccess {
  id: string
  userId: string
  tripId: string
  role: Role
  grantedByUserId: string | null
  grantedAt: string // ISO date
}

export interface TripAccessUser {
  id: string // trip_access record ID
  userId: string // user's ID
  email: string
  displayName: string | null
  role: Role
  grantedAt: string // ISO date string from JSON
  grantedByUserId: string | null
}

export interface UserInfo {
  id: string
  email: string
  displayName: string | null
  isAdmin: boolean
}

export interface UserTripAccess {
  id: string
  tripId: string
  tripTitle: string
  tripSlug: string
  role: Role
  grantedAt: string
  grantedByUserId: string | null
}

/**
 * Helper to get auth token and set on API client
 * Throws if not authenticated
 */
function requireAuth(): void {
  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')
  api.setToken(token)
}

/**
 * Grant a user access to a trip
 */
export async function grantTripAccess(
  userId: string,
  tripId: string,
  role: Role
): Promise<TripAccess> {
  requireAuth()

  const response = await api.post<{ tripAccess: TripAccess }>('/api/trip-access', {
    userId,
    tripId,
    role
  })
  return response.tripAccess
}

/**
 * Get all users with access to a trip
 */
export async function getTripAccessList(tripId: string): Promise<TripAccessUser[]> {
  requireAuth()

  const response = await api.get<{ users: TripAccessUser[] }>(`/api/trips/${tripId}/access`)
  return response.users
}

/**
 * Update a user's role for a trip
 */
export async function updateTripAccessRole(accessId: string, role: Role): Promise<TripAccess> {
  requireAuth()

  const response = await api.patch<{ tripAccess: TripAccess }>(`/api/trip-access/${accessId}`, {
    role
  })
  return response.tripAccess
}

/**
 * Revoke a user's access to a trip
 */
export async function revokeTripAccess(
  accessId: string
): Promise<{ success: boolean; message: string }> {
  requireAuth()

  return await api.delete<{ success: boolean; message: string }>(`/api/trip-access/${accessId}`)
}

/**
 * Get all users in the system (admin only)
 */
export async function getAllUsers(): Promise<UserInfo[]> {
  requireAuth()

  const response = await api.get<{ users: UserInfo[] }>('/api/users')
  return response.users
}

/**
 * Get all trips a user has access to (admin only)
 * Single query - replaces N+1 pattern
 */
export async function getUserTripAccess(userId: string): Promise<UserTripAccess[]> {
  requireAuth()

  const response = await api.get<{ trips: UserTripAccess[] }>(`/api/users/${userId}/trip-access`)
  return response.trips
}
