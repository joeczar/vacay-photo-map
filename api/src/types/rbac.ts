/**
 * RBAC Types for Trip Access Control
 */

/**
 * User role for trip access
 * - editor: Can view, edit, upload photos
 * - viewer: Can only view photos
 * - admin: Bypasses all checks (not stored in trip_access, uses user_profiles.is_admin)
 */
export type Role = 'editor' | 'viewer'

/**
 * Invitation record for granting trip access
 */
export interface Invite {
  id: string
  code: string
  createdByUserId: string
  email: string | null
  role: Role
  expiresAt: Date
  usedAt: Date | null
  usedByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Junction table: which trips an invite grants access to
 */
export interface InviteTripAccess {
  id: string
  inviteId: string
  tripId: string
  createdAt: Date
}

/**
 * User permission for a specific trip
 */
export interface TripAccess {
  id: string
  userId: string
  tripId: string
  role: Role
  grantedAt: Date
  grantedByUserId: string | null
}

/**
 * Database row from invites table (snake_case)
 */
export interface InviteRow {
  id: string
  code: string
  created_by_user_id: string
  email: string | null
  role: string
  expires_at: Date
  used_at: Date | null
  used_by_user_id: string | null
  created_at: Date
  updated_at: Date
}

/**
 * Database row from invite_trip_access table (snake_case)
 */
export interface InviteTripAccessRow {
  id: string
  invite_id: string
  trip_id: string
  created_at: Date
}

/**
 * Database row from trip_access table (snake_case)
 */
export interface TripAccessRow {
  id: string
  user_id: string
  trip_id: string
  role: string
  granted_at: Date
  granted_by_user_id: string | null
}

/**
 * API response for invite creation
 */
export interface CreateInviteResponse {
  invite: Invite
  tripIds: string[]
}

/**
 * API response for invite acceptance
 */
export interface AcceptInviteResponse {
  success: boolean
  tripAccess: TripAccess[]
}
