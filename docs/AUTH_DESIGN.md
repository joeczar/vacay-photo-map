# Authentication Design Document

**Status:** IMPLEMENTED
**Last Updated:** December 23, 2025

---

## Overview

This document outlines the implemented authentication and authorization strategy for the Vacay Photo Map application. The system uses WebAuthn/passkeys for admin authentication and token-based access control for trip sharing.

---

## Implemented System

### What Was Built

- **WebAuthn/Passkey authentication** for admin users
- **JWT-based session management** with configurable expiration
- **Token-protected trip sharing** with bcrypt-hashed access tokens
- **Admin flag** in user_profiles for authorization
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

### Implementation: Token-Protected Share Links

**Approach Chosen:** Public/private trips with optional bcrypt-hashed access tokens

**Architecture:**
- Trips have `is_public` boolean field
- Private trips have `access_token_hash` (bcrypt hashed)
- Tokens are cryptographically secure random strings
- **Admins always bypass token checks** (authenticated via JWT)

**Backend Logic (Hono API):**
```typescript
// GET /api/trips/:slug
async function getTripBySlug(slug: string, token?: string, userIsAdmin?: boolean) {
  const trip = await db.trips.findBySlug(slug)

  // Admin bypass
  if (userIsAdmin) {
    return trip
  }

  // Public trip
  if (trip.is_public) {
    return trip
  }

  // Private trip - validate token
  if (token && await bcrypt.compare(token, trip.access_token_hash)) {
    return trip
  }

  throw new UnauthorizedError()
}
```

**Frontend: Share Link Flow**
- Admin generates share link: `/trip/california-roadtrip?token=abc123...`
- User clicks link → Token extracted from URL query
- API validates token → returns trip if valid
- Frontend displays trip if authorized
- Invalid/missing token → "This trip is private" message

**Admin UI: Trip Protection Management**
- Located in AdminView trip management section
- Public/Private toggle switch
- "Generate Share Link" button
  - Creates cryptographically secure random token
  - Hashes token with bcrypt before storing
  - Displays shareable URL with plaintext token
  - Copy button for easy sharing
- "Regenerate Link" button to revoke access (invalidates old token)

**Security Notes:**
- Tokens are never stored in plaintext (bcrypt hashed)
- Admin sees plaintext token only once during generation
- Regenerating creates new token, invalidates old one
- bcrypt comparison is constant-time (prevents timing attacks)

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

-- Trip protection
ALTER TABLE trips
ADD COLUMN is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN access_token_hash TEXT;
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

-- Admin invite system (Milestone 7)
CREATE TABLE invites (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES user_profiles(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

3. **Trip Token Protection**
   - Public/private trip toggle
   - bcrypt-hashed access tokens
   - Token validation on trip fetch
   - Admin bypass for all trips

4. **Frontend Views**
   - LoginView - WebAuthn login flow
   - RegisterView - Passkey registration
   - AdminView - Trip management with protection controls
   - TripManagementView - Dedicated trip administration

### What Was Skipped (For Now)

- Invite system (not needed for single admin)
- Password recovery (no passwords to recover!)
- Email verification (WebAuthn provides device verification)
- Refresh tokens (re-auth when JWT expires)

---

## Open Questions for Future Milestones

1. **Photo Comments:** Should viewers with trip tokens be able to comment, or only admins?
   - **Recommendation:** Only authenticated users (future feature)
   - Trip tokens are for viewing only

2. **Invite System:** When implementing, should invites grant admin access or just user access?
   - **Recommendation:** User access by default, manual admin promotion
   - Maintains security of admin role

---

## References

- [WebAuthn Guide](https://webauthn.guide/)
- [@simplewebauthn Documentation](https://simplewebauthn.dev/)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)

---

**Conclusion:** The implemented system provides secure, modern authentication with WebAuthn/passkeys while maintaining simplicity for a personal project. The trip token system enables safe sharing without requiring recipients to authenticate.
