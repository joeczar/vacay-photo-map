/**
 * RBAC Types for Trip Access Control
 */

/**
 * User role for trip access
 * - editor: Can view, edit, upload photos
 * - viewer: Can only view photos
 * - admin: Bypasses all checks (not stored in trip_access, uses user_profiles.is_admin)
 */
export type Role = "editor" | "viewer";

/**
 * Invitation record for granting trip access
 */
export interface Invite {
  id: string;
  code: string;
  createdByUserId: string;
  email: string | null;
  role: Role;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Junction table: which trips an invite grants access to
 */
export interface InviteTripAccess {
  id: string;
  inviteId: string;
  tripId: string;
  createdAt: Date;
}

/**
 * User permission for a specific trip
 */
export interface TripAccess {
  id: string;
  userId: string;
  tripId: string;
  role: Role;
  grantedAt: Date;
  grantedByUserId: string | null;
}

/**
 * Database row from invites table (snake_case)
 */
export interface InviteRow {
  id: string;
  code: string;
  created_by_user_id: string;
  email: string | null;
  role: string;
  expires_at: Date;
  used_at: Date | null;
  used_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Database row from invite_trip_access table (snake_case)
 */
export interface InviteTripAccessRow {
  id: string;
  invite_id: string;
  trip_id: string;
  created_at: Date;
}

/**
 * Database row from trip_access table (snake_case)
 */
export interface TripAccessRow {
  id: string;
  user_id: string;
  trip_id: string;
  role: string;
  granted_at: Date;
  granted_by_user_id: string | null;
}

/**
 * API response for invite creation
 */
export interface CreateInviteResponse {
  invite: Invite;
  tripIds: string[];
}

/**
 * API response for invite acceptance
 */
export interface AcceptInviteResponse {
  success: boolean;
  tripAccess: TripAccess[];
}

// =============================================================================
// Mapper Functions: Database Row → Application Type
// =============================================================================

/**
 * Validate and cast a role string from the database
 * Returns the role if valid, null if invalid
 */
export function parseRole(role: string): Role | null {
  if (role === "editor" || role === "viewer") {
    return role;
  }
  return null;
}

/**
 * Convert InviteRow from database to Invite application type
 */
export function toInvite(row: InviteRow): Invite {
  const role = parseRole(row.role);
  if (!role) {
    throw new Error(`Invalid role '${row.role}' in invite ${row.id}`);
  }
  return {
    id: row.id,
    code: row.code,
    createdByUserId: row.created_by_user_id,
    email: row.email,
    role,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedByUserId: row.used_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert InviteTripAccessRow from database to InviteTripAccess application type
 */
export function toInviteTripAccess(row: InviteTripAccessRow): InviteTripAccess {
  return {
    id: row.id,
    inviteId: row.invite_id,
    tripId: row.trip_id,
    createdAt: row.created_at,
  };
}

/**
 * Convert TripAccessRow from database to TripAccess application type
 */
export function toTripAccess(row: TripAccessRow): TripAccess {
  const role = parseRole(row.role);
  if (!role) {
    throw new Error(`Invalid role '${row.role}' in trip_access ${row.id}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    tripId: row.trip_id,
    role,
    grantedAt: row.granted_at,
    grantedByUserId: row.granted_by_user_id,
  };
}

// =============================================================================
// Trip Access API Response Types
// =============================================================================

/**
 * Response for granting trip access (POST /api/trip-access)
 */
export interface GrantTripAccessResponse {
  tripAccess: TripAccess;
}

/**
 * Response for updating trip access role (PATCH /api/trip-access/:id)
 */
export interface UpdateTripAccessResponse {
  tripAccess: TripAccess;
}

/**
 * Response for revoking trip access (DELETE /api/trip-access/:id)
 */
export interface RevokeTripAccessResponse {
  success: boolean;
  message: string;
}

/**
 * User with trip access details (for listing)
 */
export interface TripAccessUser {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: Role;
  grantedAt: Date;
  grantedByUserId: string | null;
}

/**
 * Response for listing users with trip access (GET /api/trips/:tripId/access)
 */
export interface ListTripAccessResponse {
  users: TripAccessUser[];
}

/**
 * User info for admin listing
 */
export interface UserInfo {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

/**
 * Response for listing all users (GET /api/users)
 */
export interface ListUsersResponse {
  users: UserInfo[];
}
