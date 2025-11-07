# GitHub Issues Update Plan

**Based on decision:** Simple Supabase email/password auth + Trip token protection

---

## Issues to UPDATE (Simplify)

### Issue #6: Enable Supabase Auth and configure providers
**Current:** Configure WebAuthn/Passkey settings
**New:**
- Enable Email provider in Supabase dashboard
- Configure email templates (optional)
- Test basic auth connection

### Issue #7: Create auth database schema and RLS policies
**Current:** Has user_profiles table (good!)
**Keep as-is:** The schema is fine, just drop any WebAuthn credential tables

### Issue #8: Build Login view with WebAuthn
**Current:** WebAuthn login flow + email magic link fallback
**New Title:** Build Login view with email/password
**New Tasks:**
- Create LoginView.vue with email/password form
- Use Supabase `signInWithPassword()`
- Redirect to /admin on success
- Handle errors (invalid credentials, etc.)

### Issue #9: Build Register view with WebAuthn
**Action:** CLOSE or convert to backlog
**Reason:** Admins created manually in Supabase dashboard, no self-registration needed

### Issue #10: Create auth store and composables
**Keep as-is:** Still need this for auth state management

### Issue #11: Add auth button to header with user menu
**Keep as-is:** Still need this

### Issue #19: Implement invite registration flow
**Action:** CLOSE or move to "Future Enhancements"
**Reason:** No invite system in Phase 1

### Issue #20: Add admin-only routes and permissions
**Keep as-is:** Still need route guards

---

## Issues to CREATE (Trip Token Protection)

### New Milestone: "Milestone 2: Authentication & Trip Protection"
**Description:** Simple admin auth + token-protected trip sharing

### Issue #X: Add trip protection database schema
**Milestone:** 2
**Labels:** database, trip-sharing
**Tasks:**
- Add `is_public` (boolean, default true) to trips table
- Add `access_token_hash` (text, nullable) to trips table
- Update RLS policies (if needed)

**Acceptance Criteria:**
- Trips table has new columns
- Migration applied successfully

### Issue #X: Create word list generator utility
**Milestone:** 2
**Labels:** enhancement, trip-sharing
**Tasks:**
- Create word list array (nouns, adjectives)
- Create `generateTripToken()` function (3 random words)
- Add tests for generator

**Acceptance Criteria:**
- Generates tokens like `mountain-grateful-coffee`
- Tokens are sufficiently random

### Issue #X: Create Supabase Edge Function for trip fetching
**Milestone:** 2
**Labels:** backend, trip-sharing
**Tasks:**
- Create `functions/get-trip/index.ts`
- Install bcrypt for Edge Functions
- Implement: check admin → check public → check token
- Handle errors (404, 401)
- Deploy Edge Function

**Acceptance Criteria:**
- Admins bypass all checks
- Public trips return without token
- Private trips require valid token
- Invalid tokens return 401

### Issue #X: Update trip fetching to use Edge Function
**Milestone:** 2
**Labels:** refactor, trip-sharing
**Tasks:**
- Update `getTripBySlug()` to call Edge Function
- Pass token from URL params
- Handle 401 errors (trigger token entry)
- Update TripView to use new logic

**Acceptance Criteria:**
- Existing trips still work (public)
- Error handling works correctly

### Issue #X: Build token entry form for TripView
**Milestone:** 2
**Labels:** enhancement, trip-sharing
**Tasks:**
- Create TokenEntryForm component
- Show when 401 error occurs
- Validate token, update URL with `?token=xxx`
- Handle invalid token errors
- Minimal, full-page design

**Acceptance Criteria:**
- Form appears on 401
- Valid token adds to URL and loads trip
- Invalid token shows error
- Accessible and keyboard-friendly

### Issue #X: Build trip protection UI in AdminView
**Milestone:** 2
**Labels:** enhancement, admin, trip-sharing
**Tasks:**
- Add Sheet/Offcanvas trigger button
- Add Public/Private toggle
- Show current token (if private)
- Auto-generate token button (3 words)
- Copy shareable URL button with feedback
- Hash token with bcrypt before saving

**Acceptance Criteria:**
- Toggle works (updates is_public)
- Generate creates new token
- Copy button provides accessible feedback (text + toast + icon)
- Shareable URL includes token param

### Issue #X: Add shadcn-vue Sheet component
**Milestone:** 2
**Labels:** ui-component
**Tasks:**
- Run `pnpm dlx shadcn-vue@latest add sheet`
- Test component in isolation

**Acceptance Criteria:**
- Sheet component available

### Issue #X: Test trip token protection with Playwright
**Milestone:** 2
**Labels:** testing, trip-sharing
**Tasks:**
- Test public trip access (no token needed)
- Test private trip without token (shows form)
- Test private trip with valid token (loads trip)
- Test private trip with invalid token (error)
- Test admin bypass (loads regardless)
- Test copy button functionality
- Test dark mode compatibility

**Acceptance Criteria:**
- All flows work in browser
- No visual bugs
- Accessible

---

## Comment-Related Issues (Defer to Milestone 3)

Keep these as-is but acknowledge they depend on:
- Who can comment? (Admins only? Token holders? Anyone authenticated?)
- Decision: Can be made when implementing Milestone 3

---

## Proposed Milestone Restructure

### Milestone 1: Dark Mode ✓
- Issues #1-5 (current)

### Milestone 2: Authentication & Trip Protection
**Due:** 2025-01-16
- #6: Enable Supabase Auth *(simplified)*
- #7: Create auth database schema *(simplified)*
- #8: Build Login view *(simplified - no WebAuthn)*
- #10: Create auth store
- #11: Add auth button to header
- #20: Admin-only routes
- **NEW:** Trip protection database schema
- **NEW:** Word list generator
- **NEW:** Edge Function for trip fetching
- **NEW:** Update trip fetching logic
- **NEW:** Token entry form
- **NEW:** Trip protection UI
- **NEW:** Test trip protection

### Milestone 3: Comments System
**Due:** 2025-01-23
- #12-16: Comment features (existing)

### Milestone 4: Future Enhancements
**Due:** TBD
- #17-19: Invite system (moved here)
- #21-22: Polish & bug fixes

---

## Summary of Changes

**Close/Backlog:**
- #9: Build Register view (not needed)
- #19: Invite registration flow (future enhancement)

**Simplify:**
- #6: Remove WebAuthn config
- #8: Remove WebAuthn, just email/password

**Add (8 new issues):**
- Trip protection database schema
- Word list generator
- Edge Function creation
- Update trip fetching
- Token entry form
- Trip protection UI
- Add Sheet component
- Test trip protection

**Keep as-is:**
- #7, #10, #11, #20 (auth-related but not WebAuthn)
- #12-16, #21-22 (comments and polish)

---

## Next Steps

1. **Review this plan** - Does it match your vision?
2. **Approve changes** - Give me the green light to update GitHub
3. **Start implementation** - Begin with Issue #6

