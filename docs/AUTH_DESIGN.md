# Authentication Design Document

**Status:** IMPLEMENTED
**Last Updated:** December 26, 2025

---

## Overview

This document outlines the implemented authentication and authorization strategy for the Vacay Photo Map application. The system uses WebAuthn/passkeys for authentication and Role-Based Access Control (RBAC) via the `trip_access` table for trip sharing.

---

## Implemented System

### What Was Built

- **WebAuthn/Passkey authentication** for all users
- **JWT-based session management** with configurable expiration
- **RBAC system with `trip_access` table** for fine-grained trip permissions
- **Invite system** for sharing trips with specific roles (editor/viewer)
- **Admin flag** in user_profiles for full system access
- **First-user bootstrap** - first registered user becomes admin

---

## Use Case 1: Admin Authentication

### Implementation: WebAuthn with First-User Bootstrap

**Approach Chosen:** Modern WebAuthn/passkeys with automatic admin bootstrap

**Flow:**
1. First user to register becomes admin automatically
2. Subsequent users register but are not admin (for future features)
3. Authentication via WebAuthn/passkeys (fingerprint, Face ID, security key)
4. JWT tokens for session management

**Why This Approach:**
- Passwordless = more secure, better UX
- No password management/reset complexity
- Works across devices (passkeys sync via iCloud/Google Password Manager)
- Future-proof for invite system
- Industry standard (used by Google, GitHub, etc.)

### Technical Implementation

**Registration Flow:**
```
1. User enters email
2. Backend generates WebAuthn registration options
3. Browser prompts for passkey creation (biometric/PIN)
4. Browser sends credential to backend
5. Backend stores credential, creates user
6. If first user, sets is_admin = true
7. Returns JWT token
```

**Login Flow:**
```
1. User enters email
2. Backend generates WebAuthn authentication options
3. Browser prompts for passkey (biometric/PIN)
4. Browser sends assertion to backend
5. Backend verifies signature, returns JWT
```

**Session Management:**
- JWT stored in localStorage
- Sent in Authorization header: `Bearer <token>`
- Expiration configurable (default: 1 hour)
- No refresh tokens (re-authenticate when expired)

---

## Use Case 2: Trip Access Control

### Implementation: Role-Based Access Control (RBAC)

**Approach Chosen:** Fine-grained access control via `trip_access` table with role hierarchy

**Architecture:**
- All endpoints require JWT authentication
- `trip_access` table maps users to trips with roles: `editor` > `viewer`
- Admins bypass all access checks (authenticated via JWT `isAdmin` claim)
- Invite system for sharing trips with specific roles
- Role hierarchy: `editor` (full access) > `viewer` (read-only)

**Database Schema:**
```sql
-- User permissions for specific trips
CREATE TABLE trip_access (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  granted_by_user_id UUID REFERENCES user_profiles(id),
  UNIQUE(user_id, trip_id)
);

-- Invitations for trip access
CREATE TABLE invites (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Junction table: which trips an invite grants access to
CREATE TABLE invite_trip_access (
  id UUID PRIMARY KEY,
  invite_id UUID REFERENCES invites(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(invite_id, trip_id)
);
```

**Backend Logic (Hono API):**
```typescript
// Middleware: Check trip access with minimum role
async function checkTripAccess(userId: string, tripId: string, minRole: 'editor' | 'viewer') {
  // Admins bypass all checks
  if (user.isAdmin) return true;

  // Check trip_access table
  const access = await db.tripAccess.find(userId, tripId);

  if (!access) return false;

  // Role hierarchy: editor > viewer
  if (minRole === 'viewer') {
    return access.role === 'viewer' || access.role === 'editor';
  } else if (minRole === 'editor') {
    return access.role === 'editor';
  }
  return false;
}

// GET /api/trips/slug/:slug - Requires auth + trip access
app.get('/trips/slug/:slug', requireAuth, async (c) => {
  const trip = await db.trips.findBySlug(slug);

  // Check access for non-admin users
  if (!user.isAdmin) {
    const hasAccess = await checkTripAccess(user.id, trip.id, 'viewer');
    if (!hasAccess) throw new ForbiddenError();
  }

  return trip;
});
```

**Current Endpoints:**
- `GET /api/trips` - List trips accessible to the user (via `trip_access` or admin)
- `GET /api/trips/admin` - List all trips (admin only)
- `GET /api/trips/slug/:slug` - Get trip by slug (auth + `trip_access` check)
- `GET /api/trips/id/:id` - Get trip by UUID (admin only)

**Access Control Flow:**
1. User authenticates via WebAuthn → receives JWT
2. User makes request with JWT in `Authorization: Bearer <token>` header
3. `requireAuth` middleware verifies JWT, extracts user info
4. For trip endpoints: check if user is admin OR has entry in `trip_access` table
5. If admin: bypass all checks, grant full access
6. If non-admin: check `trip_access` table for required role
7. If no access: return 403 Forbidden

**Invite System (Backend Implemented):**
- Admin creates invite with role (`editor` or `viewer`) and trip list
- Invite generates unique code (e.g., `abc123xyz`)
- User receives invite link: `/invite/abc123xyz`
- User clicks link, authenticates (or registers), redeems invite
- Invite grants `trip_access` entries for each trip with specified role
- Invite can only be used once, expires after timeout

**Security Notes:**
- All endpoints require authentication (no anonymous access)
- JWT tokens are short-lived (configurable, default: 1h)
- Role hierarchy enforced at middleware level
- Admins bypass access checks for operational flexibility
- `trip_access` table is the single source of truth for permissions
- Invite codes are cryptographically secure random strings

## Database Schema

### Implemented Schema

```sql
-- User accounts
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  webauthn_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WebAuthn credentials (passkeys)
CREATE TABLE authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  transports TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Trip protection (LEGACY - not used in RBAC system)
ALTER TABLE trips
ADD COLUMN is_public BOOLEAN DEFAULT TRUE,        -- LEGACY: not used, kept for migration
ADD COLUMN access_token_hash TEXT;                -- LEGACY: not used, kept for migration

-- RBAC: User permissions for specific trips
CREATE TABLE trip_access (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by_user_id UUID REFERENCES user_profiles(id),
  UNIQUE(user_id, trip_id)
);

-- RBAC: Invitations for trip access
CREATE TABLE invites (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_user_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RBAC: Junction table for invite-to-trip mapping
CREATE TABLE invite_trip_access (
  id UUID PRIMARY KEY,
  invite_id UUID REFERENCES invites(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(invite_id, trip_id)
);
```

### Future Enhancements (Planned)

```sql
-- Photo comments (Milestone 6)
CREATE TABLE photo_comments (
  id UUID PRIMARY KEY,
  photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Summary

### What Was Implemented

1. **WebAuthn/Passkey Authentication**
   - @simplewebauthn/server for backend
   - @simplewebauthn/browser for frontend
   - First user becomes admin automatically
   - Multiple passkeys per user supported

2. **JWT Session Management**
   - jose library for JWT signing/verification
   - Tokens stored in localStorage
   - Configurable expiration (default: 1h)
   - Admin middleware for protected routes

3. **RBAC Trip Access Control**
   - `trip_access` table maps users to trips with roles
   - Role hierarchy: `editor` > `viewer`
   - Middleware (`checkTripAccess`) enforces permissions
   - Admins bypass all access checks
   - All trip endpoints require authentication

4. **Invite System (Backend)**
   - `invites` table with unique codes and expiration
   - `invite_trip_access` junction table for multi-trip invites
   - Role-based invites (`editor` or `viewer`)
   - Single-use invite redemption
   - API endpoints: create, verify, redeem invites

5. **Frontend Views**
   - LoginView - WebAuthn login flow
   - RegisterView - Passkey registration
   - AdminView - Trip management
   - TripManagementView - Dedicated trip administration

### What Was Skipped (For Now)

- **Invite UI in frontend** - Backend API exists, frontend not yet built
- Password recovery (no passwords to recover!)
- Email verification (WebAuthn provides device verification)
- Refresh tokens (re-auth when JWT expires)

---

## Open Questions for Future Milestones

1. **Photo Comments:** Should viewers be able to comment, or only editors?
   - **Recommendation:** Editors only (write access required)
   - Viewers have read-only access
   - Comments count as "editing" content

2. **Public Access:** Should we re-enable public (unauthenticated) access to trips?
   - **Current:** All endpoints require authentication
   - **Legacy:** `is_public` and `access_token_hash` fields exist but unused
   - **Consideration:** Add `is_public` flag to enable anonymous viewing
   - **Trade-off:** Simplicity vs. ease of sharing with non-users

3. **Role Elevation:** Can users request editor access for trips they only have viewer access to?
   - **Recommendation:** Manual approval by trip owner/admin only
   - Prevents privilege escalation

---

## References

- [WebAuthn Guide](https://webauthn.guide/)
- [@simplewebauthn Documentation](https://simplewebauthn.dev/)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)

---

**Conclusion:** The implemented system provides secure, modern authentication with WebAuthn/passkeys combined with granular Role-Based Access Control. The RBAC system enables fine-grained trip sharing with role-based permissions (editor/viewer), while the invite system facilitates onboarding new users with specific access levels. All endpoints require authentication, ensuring accountability and security.
