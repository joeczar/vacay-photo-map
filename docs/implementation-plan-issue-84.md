# Implementation Plan: WebAuthn Login/Registration UI

**Issue:** #84
**Branch:** `feature/issue-84-webauthn-login-ui`
**Complexity:** Medium
**Total Commits:** 5

## Overview
Implement complete WebAuthn authentication UI for login and registration flows. Registration form will be hidden in production (dev-only) since this is a single-user application. After successful authentication, users will be redirected to /admin and auth state will persist via JWT in localStorage.

## Prerequisites
- [x] Backend WebAuthn API endpoints complete (`/api/auth/*`)
- [x] `@simplewebauthn/browser` v9.0.1 installed
- [x] `useAuth` composable ready with `setAuthState()` method
- [x] shadcn-vue form components available (vee-validate + zod)

## Architecture

### Components
- `LoginView.vue` - Main auth view with login form (always) and registration form (dev-only)

### Data Flow
```
User enters email → Request challenge options
↓
Server generates WebAuthn challenge
↓
Browser shows passkey prompt (biometric/PIN)
↓
User authenticates with passkey
↓
Send credential to server for verification
↓
Server validates & returns JWT + user data
↓
Frontend stores token & redirects to /admin
```

### Error Handling
- **Browser not supported**: Check `browserSupportsWebAuthn()` before showing forms
- **User cancellation**: Catch WebAuthn abort errors, show friendly message
- **Challenge expired**: 5 min timeout, show "please try again" message
- **Rate limiting**: 429 response (10 req/min), show "too many requests" message
- **User not found**: Generic "authentication failed" (prevents enumeration)
- **Verification failed**: Generic "authentication failed"

## Atomic Commits

### Commit 1: Add browser support detection and error handling types
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Import `browserSupportsWebAuthn` from `@simplewebauthn/browser`
- Add reactive ref to check browser support on component mount
- Add conditional rendering to show "Browser not supported" alert if check fails
- Add TypeScript type definitions for API responses
- Keep existing stub content initially

**Acceptance Criteria:**
- [ ] Browser support is checked on mount
- [ ] Appropriate error message shown if WebAuthn not supported
- [ ] No TypeScript errors
- [ ] Types pass: `pnpm type-check`

---

### Commit 2: Implement login form UI and validation
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Replace stub content with login form using shadcn-vue components
- Add form validation schema with vee-validate + zod (email required, valid format)
- Use `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`
- Add reactive state for loading, error messages
- Add `Alert` component for displaying errors with `variant="destructive"`
- Form should be disabled during WebAuthn ceremony
- Match styling patterns from `AdminView.vue` (Card, CardHeader, CardTitle, CardDescription, CardContent)
- Keep header with logo and theme toggle
- Show "Login" button when form is valid

**Acceptance Criteria:**
- [ ] Login form renders with email input
- [ ] Email validation works (required, valid format)
- [ ] Form shows validation errors inline
- [ ] UI matches existing design patterns
- [ ] Form is visually disabled during loading
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 3: Wire up WebAuthn login flow
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Import `startAuthentication` from `@simplewebauthn/browser`
- Import `api` from `@/lib/api` and `useAuth` composable
- Implement login submit handler:
  1. Call `POST /api/auth/login/options` with email
  2. Call `startAuthentication({ optionsJSON: serverOptions })`
  3. Call `POST /api/auth/login/verify` with email + credential
  4. On success: call `setAuthState(token, user)` and redirect to `/admin`
- Handle specific error cases:
  - User cancellation (abort error): "Authentication cancelled"
  - 401 response: "Login failed. User not found or passkey not recognized."
  - 400 response (challenge expired): "Challenge expired. Please try again."
  - 429 response: "Too many attempts. Please try again later."
  - Network errors: "Connection failed. Please check your internet."
- Add router import for post-login redirect
- Clear error state when user starts typing

**Acceptance Criteria:**
- [ ] Login flow works end-to-end with valid passkey
- [ ] Error messages are user-friendly and specific
- [ ] User is redirected to /admin on success
- [ ] Loading state prevents duplicate submissions
- [ ] User cancellation is handled gracefully
- [ ] Manual test: Login succeeds with registered passkey
- [ ] Manual test: Login shows appropriate error for wrong email
- [ ] Manual test: Cancelling passkey prompt shows friendly message
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 4: Add registration form UI (dev-only)
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Add conditional section below login form: `v-if="import.meta.env.DEV"`
- Add visual separator (border, margin, or Separator component)
- Create registration form with same validation patterns
- Add fields: email (required, valid format), displayName (optional, max 100 chars)
- Add form validation schema for registration
- Use same shadcn-vue components for consistency
- Add alert/banner noting "Development mode only - registration is disabled in production"
- Ensure registration form has its own loading/error state (separate from login)
- Style consistently with login form

**Acceptance Criteria:**
- [ ] Registration form only visible when `import.meta.env.DEV` is true
- [ ] Form has email and optional display name fields
- [ ] Validation works correctly (email required/valid, displayName optional/max length)
- [ ] Clear visual separation from login form
- [ ] Dev-only banner is displayed
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 5: Wire up WebAuthn registration flow
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Import `startRegistration` from `@simplewebauthn/browser`
- Implement registration submit handler:
  1. Call `POST /api/auth/register/options` with email + displayName
  2. Call `startRegistration({ optionsJSON: serverOptions })`
  3. Call `POST /api/auth/register/verify` with email + displayName + credential
  4. On success: call `setAuthState(token, user)` and redirect to `/admin`
- Handle specific error cases:
  - User cancellation: "Registration cancelled"
  - 409 response: "This email is already registered. Please use the login form."
  - 400 response (challenge expired): "Challenge expired. Please try again."
  - 401 response: "Registration failed. Please try again."
  - 429 response: "Too many attempts. Please try again later."
  - Network errors: "Connection failed. Please check your internet."
- Add success message before redirect (optional)
- Clear error state when user modifies form

**Acceptance Criteria:**
- [ ] Registration flow works end-to-end
- [ ] New user can register with passkey
- [ ] User is redirected to /admin after successful registration
- [ ] Error handling covers all API responses
- [ ] Duplicate email shows appropriate error (409)
- [ ] User cancellation handled gracefully
- [ ] Manual test: Register new user succeeds
- [ ] Manual test: Duplicate email shows error
- [ ] Manual test: Cancelling passkey prompt shows message
- [ ] Manual test: After registration, can log out and log back in
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

## Testing Strategy

### Manual Testing (Critical Path)
After each commit that implements functionality:

**Login Flow (Commit 3)**
1. Open browser to `/login`
2. Verify browser support detection works
3. Enter registered email, click "Login"
4. Complete passkey authentication
5. Verify redirect to `/admin`
6. Verify token stored in localStorage
7. Test error cases:
   - Enter unregistered email → should show auth failed
   - Cancel passkey prompt → should show friendly message
   - Rapid requests → should hit rate limit (429)

**Registration Flow (Commit 5)**
1. Run in dev mode: `pnpm dev`
2. Verify registration form is visible
3. Enter email and optional display name
4. Complete passkey registration
5. Verify redirect to `/admin`
6. Logout, then login with new credentials
7. Test error cases:
   - Try to register same email twice → 409 error
   - Cancel passkey prompt → friendly message

**Browser Compatibility**
- Test in Chrome/Edge (WebAuthn fully supported)
- Test in Firefox (WebAuthn fully supported)
- Test in Safari (WebAuthn fully supported)
- Test on mobile device if available

### Automated Testing
Unit tests should be added in a follow-up issue for:
- Form validation logic
- Error message mapping
- WebAuthn error handling
- API response parsing

Since WebAuthn requires browser APIs that are difficult to mock, we'll rely on manual testing for the integration flow. Consider E2E tests with Playwright in future milestone.

## Verification Checklist

Before PR creation:
- [ ] All 5 commits completed and individually tested
- [ ] Manual login flow works end-to-end
- [ ] Manual registration flow works (dev mode)
- [ ] Error handling tested for all cases
- [ ] Browser support detection works
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] No console errors during normal flow
- [ ] Token persists in localStorage
- [ ] Auth state correctly managed by useAuth
- [ ] Redirect to /admin works correctly
- [ ] Already-authenticated users redirected (existing logic)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WebAuthn browser compatibility issues | Check `browserSupportsWebAuthn()` first, show clear error |
| User confusion about passkeys | Add help text explaining passkeys (face/fingerprint/PIN) |
| Challenge expiration during slow user flow | 5 min timeout should be sufficient; show clear error if expired |
| Rate limiting blocks legitimate users | 10 req/min is generous; clear error message with retry guidance |
| User loses access to passkey | Future: implement recovery codes or email recovery (not in this issue) |
| Multiple registration attempts | Backend returns 409 if email exists; guide user to login |

## Open Questions

None - all requirements are clear from backend API and research findings.

## Additional Notes

### Future Enhancements (Not in Scope)
- Passkey management UI (list, add additional, remove)
- Account recovery flow
- Email verification
- Invite code system
- Rate limiting improvements (Redis-backed)

### WebAuthn User Experience
The forms should include brief help text explaining what passkeys are:
- "Use your device's biometric authentication (Face ID, Touch ID, fingerprint) or PIN"
- Link to passkeys.dev for more info (optional)

### Security Considerations
- Backend already implements rate limiting (10 req/min per IP)
- Generic error messages prevent user enumeration
- Challenge timeout prevents replay attacks (5 min)
- JWTs expire (check backend for expiry time)
- HTTPS required for WebAuthn (production only)

### Styling Notes
- Follow existing patterns from `AdminView.vue`
- Use shadcn-vue components exclusively
- Maintain dark mode compatibility
- Ensure mobile responsive design
- Use `Alert` for errors, not toast (better for auth flows)
- Keep UI simple and focused - this is admin-only
