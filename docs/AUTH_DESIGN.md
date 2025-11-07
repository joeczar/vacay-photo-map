# Authentication Design Document

**Status:** DRAFT - Needs Review
**Last Updated:** 2025-11-04

---

## Overview

This document outlines the authentication and authorization strategy for the Vacay Photo Map application. There are TWO distinct use cases that need different approaches:

1. **Admin Authentication** - You (and potentially other admins) need to create/edit trips
2. **Trip Access Control** - Friends/family need controlled access to view specific trips

---

## Current Issues & Gaps

### What GitHub Issues Assume
- Invite-only registration system
- WebAuthn/Passkey authentication
- Email magic link fallback
- Admin flag in user_profiles table
- Complex flow: invites → register → login

### What's Missing
- **How does the first admin get created?** (Bootstrap problem)
- **Is WebAuthn necessary for a personal project?**
- **Trip token protection** (what we just discussed - not in issues at all!)
- **Complexity vs. simplicity trade-off**

---

## Use Case 1: Admin Authentication

### The Core Question
**Who are the admins and how do they authenticate?**

### Option A: Single Admin (Simplest) ⭐
**Assumption:** Only you will ever create trips

**Flow:**
1. Manually create your user in Supabase dashboard (one-time)
2. Set `is_admin = true` in user_profiles
3. Login with email + password (Supabase built-in)
4. No invite system needed

**Pros:**
- Dead simple
- No invite management needed
- Can upgrade later if needed

**Cons:**
- Can't easily add other admins
- Less impressive technically

### Option B: First Admin Bootstrap + Invites
**Assumption:** You might want to add other admins later

**Flow:**
1. First user to register becomes admin (check if user_profiles is empty)
2. Admins can send invites to others
3. WebAuthn/Passkey for modern auth

**Pros:**
- Scalable to multiple admins
- Modern auth with passkeys
- Invite system useful for comments later

**Cons:**
- Much more complex
- Overkill for personal project?

### Option C: Hybrid - Simple Now, Upgrade Later
**Assumption:** Start simple, add complexity when needed

**Flow (Phase 1):**
1. Email + password login only
2. Manually create admins in Supabase dashboard
3. Skip invites, skip WebAuthn

**Flow (Phase 2 - when you need it):**
4. Add invite system
5. Add WebAuthn

**Pros:**
- Unblocks you immediately
- Learn Supabase auth basics first
- Add fancy features when needed

**Cons:**
- Migration work later
- Less "complete" feeling

---

## Use Case 2: Trip Access Control

### The Core Question
**How do you control who can view specific trips?**

### The Agreed Approach: Share Link Protection
Based on our discussion and architectural decision (Issue #39):

**Architecture:**
- Trips have `is_public` flag (boolean)
- Private trips have `access_token_hash` (bcrypt)
- Tokens are cryptographically secure 43-character strings (base64url encoded)
- Example: `np8xK2mV7qR4sL9wT3fH6gC1bN5pX0yZaB2dE4fG`
- **Admins always bypass token checks**

**Backend: Supabase Edge Function**
```typescript
// functions/get-trip/index.ts
export default async (req: Request) => {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')
  const token = url.searchParams.get('token')

  // Check if user is authenticated admin
  const user = await getUser(req)
  if (user?.is_admin) {
    return getTripBySlug(slug) // Bypass checks
  }

  // Check if trip is public
  const trip = await getTripBySlug(slug)
  if (trip.is_public) {
    return trip
  }

  // Validate token with bcrypt
  if (token && await bcrypt.compare(token, trip.access_token_hash)) {
    return trip
  }

  return new Response('Unauthorized', { status: 401 })
}
```

**Frontend: Share Link Flow**
- Admin generates share link: `/trip/california-roadtrip?token=np8xK2mV7qR4sL9wT3fH6gC1bN5p`
- User clicks link → Token auto-validated on page load
- Valid token → Trip loads immediately
- Invalid/missing token → Show "Invalid or expired link" error message
- No manual entry form needed (simpler UX than manual token entry)

**Admin UI: Trip Protection Management**
- Offcanvas/Sheet in AdminView (or TripView when authenticated)
- Public/Private toggle
- "Generate Share Link" button (creates token, hashes it, builds URL)
- Copy share link button (with accessible feedback)
- **Note:** Admin never sees plaintext token (immediately hashed on generation)
- Regenerate link to revoke access (invalidates old token)

---

## The Big Question

### Do we need WebAuthn/Passkeys for admin auth?

**Arguments FOR:**
- Modern, secure, passwordless
- Good learning opportunity
- "Do it right" from the start
- Already in the GitHub roadmap

**Arguments AGAINST:**
- Overkill for personal project with 1-2 admins
- Email + password works fine and is simpler
- Can add later if needed
- Supabase makes email auth trivial

**Your call:** What's more important right now?
- Get unblocked and start creating trips? → Go simple
- Learn modern auth patterns? → Go WebAuthn

---

## Decided Approach

### Simple Supabase Auth (Email/Password)

**Decision:** Use Supabase's built-in email authentication. No WebAuthn, no invite system (for now).

**Implementation:**
1. Enable Supabase Email auth in dashboard
2. Manually create admin user in Supabase dashboard
3. Set `is_admin = true` in user_profiles
4. Build simple Login view (email + password)
5. Add auth check to AdminView
6. **Implement trip token protection** (the actual requirement!)

**Why this approach?**
- Unblocks trip creation immediately
- Trip protection is the real security need
- Supabase handles all the hard parts (sessions, tokens, password reset)
- Can add WebAuthn/invites later if needed
- Focus on shipping features, not auth complexity

---

## Database Schema

### Minimal (Phase 1)
```sql
-- user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- trips table additions
ALTER TABLE trips
ADD COLUMN is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN access_token_hash TEXT;
```

### Complete (Phase 2)
```sql
-- Add invite system
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Decisions Made

1. **Admin auth complexity:** ✓ Simple email/password using Supabase built-in auth

2. **Number of admins:** Single admin (you) for now, can add more manually if needed

3. **Invite system:** ✓ Not needed - skip entirely

## Open Questions

1. **Trip comments:** The existing roadmap has comments by "authenticated users" - should viewers with trip tokens be able to comment, or only admins? (Can decide later when implementing comments)

---

## Next Steps

1. **Review this document** - What matches your vision? What doesn't?
2. **Answer the open questions** - Helps finalize the approach
3. **Update GitHub issues** - Align with chosen approach
4. **Create new issues** - Add trip token protection work
5. **Start implementation** - Begin with Phase 1

---

## Notes
- This is a living document - will update as we make decisions
- Focus on shipping features, not perfect architecture
- Can always refactor later as needs change
