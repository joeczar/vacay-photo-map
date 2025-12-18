# Implementation Plan: WebAuthn Login/Registration UI

**Issue:** #84
**Branch:** `feature/issue-84-webauthn-ui`
**Complexity:** Medium
**Total Commits:** 5

## Overview
Implement WebAuthn-based authentication UI in LoginView.vue with email-based login (always visible) and registration (dev-only). Uses `@simplewebauthn/browser` v9.0.1 to communicate with existing backend API endpoints. After successful auth, stores JWT token and redirects to /admin (or query.redirect destination).

## Prerequisites
- [x] Backend WebAuthn API endpoints exist and are functional
- [x] `@simplewebauthn/browser` v9.0.1 installed
- [x] `useAuth` composable has `setAuthState(token, user)` method
- [x] API client has `post()` method ready
- [x] shadcn-vue components available (Card, Input, Button, Alert, Form)

## Architecture

### Components
- `LoginView.vue` - Main authentication view with login and registration forms

### Data Flow
```
User enters email
  → Click "Login" or "Register"
  → POST /api/auth/{login|register}/options { email }
  → Receive challenge from backend
  → startAuthentication(options) or startRegistration(options) [WebAuthn browser API]
  → User authenticates with passkey (biometrics/security key)
  → POST /api/auth/{login|register}/verify { email, credential }
  → Receive { user, token }
  → setAuthState(token, user)
  → router.push(redirect || '/admin')
```

### Browser Support Detection
- Check `window.PublicKeyCredential` availability
- Show warning if WebAuthn not supported

## Atomic Commits

Each commit is a reviewable unit. Implementer completes one commit, returns diff for review, then proceeds to next.

---

### Commit 1: Add browser WebAuthn support detection utility
**Type:** feat
**Scope:** utils
**Files:**
- `app/src/utils/webauthn.ts` - Create

**Changes:**
- Create `checkWebAuthnSupport()` utility function
- Returns `{ supported: boolean, message?: string }`
- Checks for `window.PublicKeyCredential` existence
- Provides user-friendly error messages for unsupported browsers

**Acceptance Criteria:**
- [ ] Function returns `{ supported: true }` in supported browsers
- [ ] Function returns helpful message for unsupported browsers
- [ ] Types are correct (`pnpm type-check`)
- [ ] Unit tests pass (`pnpm test`)

**Implementation Notes:**
```typescript
// app/src/utils/webauthn.ts
export interface WebAuthnSupportCheck {
  supported: boolean
  message?: string
}

export function checkWebAuthnSupport(): WebAuthnSupportCheck {
  if (!window?.PublicKeyCredential) {
    return {
      supported: false,
      message: 'Your browser does not support passkeys. Please use a modern browser like Chrome, Safari, or Edge.'
    }
  }

  return { supported: true }
}
```

---

### Commit 2: Implement login form UI and validation
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Replace stub content with login form
- Add vee-validate + zod schema for email validation
- Use shadcn-vue components: Card, Input, Button, FormField
- Add loading state during authentication
- Add error display using Alert component
- Keep existing header and navigation structure
- Add WebAuthn support check on mount

**Acceptance Criteria:**
- [ ] Form validates email format using zod
- [ ] Submit button disabled during loading or when form invalid
- [ ] Error messages display in Alert component
- [ ] Header and navigation preserved from existing code
- [ ] WebAuthn unsupported warning shows if browser incompatible
- [ ] Types pass: `pnpm type-check`
- [ ] No console errors

**Implementation Notes:**
```typescript
// Validation schema
const loginSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address')
  })
)

// State
const isLoggingIn = ref(false)
const error = ref('')

// Check WebAuthn support on mount
const webAuthnSupport = checkWebAuthnSupport()
if (!webAuthnSupport.supported) {
  error.value = webAuthnSupport.message || 'WebAuthn not supported'
}
```

Form structure:
- Email input field with validation
- "Login with Passkey" button
- Error alert below form
- Loading state: button shows "Authenticating..." and is disabled

---

### Commit 3: Implement login flow with WebAuthn
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Import `startAuthentication` from `@simplewebauthn/browser`
- Implement `handleLogin()` function
- Call `POST /api/auth/login/options` with email
- Pass response to `startAuthentication(options)` (NOT optionsJSON)
- Send credential to `POST /api/auth/login/verify`
- Call `setAuthState(token, user)` on success
- Redirect to `route.query.redirect` or `/admin`
- Handle errors with user-friendly messages

**Acceptance Criteria:**
- [ ] Login flow completes successfully with valid passkey
- [ ] Error handling for API failures (network, 404 user not found, invalid credential)
- [ ] Proper redirect after successful login
- [ ] Loading state shown during entire flow
- [ ] Error messages are user-friendly (no raw API errors)
- [ ] Manual test in dev environment successful

**Implementation Notes:**
```typescript
import { startAuthentication } from '@simplewebauthn/browser'
import { useAuth } from '@/composables/useAuth'
import { api } from '@/lib/api'
import { useRouter, useRoute } from 'vue-router'
import { ApiError } from '@/lib/api'

const router = useRouter()
const route = useRoute()
const { setAuthState } = useAuth()

const handleLogin = async (values: { email: string }) => {
  isLoggingIn.value = true
  error.value = ''

  try {
    // Step 1: Get authentication options
    const options = await api.post<any>('/api/auth/login/options', {
      email: values.email
    })

    // Step 2: Authenticate with passkey
    const credential = await startAuthentication(options)

    // Step 3: Verify credential
    const { token, user } = await api.post<{ token: string; user: User }>(
      '/api/auth/login/verify',
      { email: values.email, credential }
    )

    // Step 4: Set auth state and redirect
    setAuthState(token, user)

    const redirectPath = (route.query.redirect as string) || '/admin'
    await router.push(redirectPath)
  } catch (err) {
    console.error('Login failed:', err)

    // User-friendly error messages
    if (err instanceof ApiError) {
      if (err.status === 404) {
        error.value = 'No account found with this email. Please register first.'
      } else if (err.status === 400) {
        error.value = 'Authentication failed. Please try again.'
      } else {
        error.value = err.message || 'Login failed. Please try again.'
      }
    } else if (err instanceof Error && err.name === 'NotAllowedError') {
      error.value = 'Authentication was cancelled. Please try again.'
    } else {
      error.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isLoggingIn.value = false
  }
}
```

---

### Commit 4: Add dev-only registration form UI
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Add registration Card component below login form
- Only visible when `import.meta.env.DEV === true`
- Add vee-validate form for registration with email + displayName
- Use same shadcn-vue components pattern
- Add separate loading and error state for registration
- Add helpful text explaining dev-only access

**Acceptance Criteria:**
- [ ] Registration form only visible in dev mode
- [ ] Form validates email and displayName (optional)
- [ ] Separate loading/error states from login form
- [ ] Visual separation between login and registration sections
- [ ] Types pass: `pnpm type-check`

**Implementation Notes:**
```typescript
// Add to validation schemas
const registerSchema = toTypedSchema(
  z.object({
    email: z.string().email('Please enter a valid email address'),
    displayName: z.string().min(2, 'Display name must be at least 2 characters').optional()
  })
)

// Add separate state
const isRegistering = ref(false)
const registerError = ref('')
```

Template structure:
```vue
<!-- Login form (always visible) -->
<Card>...</Card>

<!-- Registration form (dev only) -->
<Card v-if="isDev" class="mt-6">
  <CardHeader>
    <CardTitle>Create Account</CardTitle>
    <CardDescription>
      Register a new passkey (Development only)
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Alert class="mb-4" variant="default">
      <AlertDescription>
        Registration is only available in development mode.
        Production instances require an admin invite.
      </AlertDescription>
    </Alert>
    <!-- Form fields for email and displayName -->
  </CardContent>
</Card>
```

Computed:
```typescript
const isDev = computed(() => import.meta.env.DEV)
```

---

### Commit 5: Implement registration flow with WebAuthn
**Type:** feat
**Scope:** auth
**Files:**
- `app/src/views/LoginView.vue` - Modify

**Changes:**
- Import `startRegistration` from `@simplewebauthn/browser`
- Implement `handleRegister()` function
- Call `POST /api/auth/register/options` with email
- Pass response to `startRegistration(options)` (NOT optionsJSON)
- Send credential to `POST /api/auth/register/verify` with email, displayName, credential
- Call `setAuthState(token, user)` on success
- Redirect to `/admin` (no query redirect for registration)
- Handle errors with user-friendly messages

**Acceptance Criteria:**
- [ ] Registration flow completes successfully with new passkey
- [ ] displayName is optional and properly sent to backend
- [ ] Error handling for duplicate email, invalid credential, etc.
- [ ] Proper redirect after successful registration
- [ ] Loading state shown during entire flow
- [ ] Error messages are user-friendly
- [ ] Manual test in dev environment successful
- [ ] Full auth flow works: register → logout → login

**Implementation Notes:**
```typescript
import { startRegistration } from '@simplewebauthn/browser'

const handleRegister = async (values: { email: string; displayName?: string }) => {
  isRegistering.value = true
  registerError.value = ''

  try {
    // Step 1: Get registration options
    const options = await api.post<any>('/api/auth/register/options', {
      email: values.email
    })

    // Step 2: Create passkey credential
    const credential = await startRegistration(options)

    // Step 3: Verify and create user
    const { token, user } = await api.post<{ token: string; user: User }>(
      '/api/auth/register/verify',
      {
        email: values.email,
        displayName: values.displayName || null,
        credential
      }
    )

    // Step 4: Set auth state and redirect
    setAuthState(token, user)
    await router.push('/admin')
  } catch (err) {
    console.error('Registration failed:', err)

    // User-friendly error messages
    if (err instanceof ApiError) {
      if (err.status === 409) {
        registerError.value = 'An account with this email already exists. Please login instead.'
      } else if (err.status === 400) {
        registerError.value = 'Registration failed. Please check your information and try again.'
      } else {
        registerError.value = err.message || 'Registration failed. Please try again.'
      }
    } else if (err instanceof Error && err.name === 'NotAllowedError') {
      registerError.value = 'Passkey creation was cancelled. Please try again.'
    } else {
      registerError.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isRegistering.value = false
  }
}
```

---

## Testing Strategy

### Manual Testing (Required for each commit)
After each commit, manually verify in browser:
- **Commit 2**: Form validation works, error states display correctly
- **Commit 3**: Full login flow works with existing passkey
- **Commit 4**: Registration form only visible in dev mode
- **Commit 5**: Full registration flow creates new passkey and logs in

### Complete Flow Testing (Final verification)
1. **Registration flow (dev mode)**:
   - Open `/login` in dev environment
   - Fill in email and optional displayName
   - Click "Register with Passkey"
   - Verify browser prompts for passkey creation
   - Verify redirect to `/admin` after success

2. **Login flow**:
   - Logout from `/admin`
   - Navigate to `/login`
   - Enter registered email
   - Click "Login with Passkey"
   - Verify browser prompts for passkey authentication
   - Verify redirect to `/admin`

3. **Protected route redirect**:
   - Logout
   - Navigate to `/admin` (should redirect to `/login?redirect=/admin`)
   - Login successfully
   - Verify redirect back to `/admin`

4. **Error scenarios**:
   - Try login with unregistered email (should show "No account found")
   - Cancel passkey prompt (should show "Authentication was cancelled")
   - Try registration with existing email (should show "Account already exists")

5. **Browser support**:
   - Test in unsupported browser (if possible)
   - Verify warning message displays

### Unit Tests (Optional - TDD approach)
If following TDD, write tests for:
- `checkWebAuthnSupport()` utility function
- Form validation logic
- Error message mapping

## Verification Checklist

Before PR creation:
- [ ] All 5 commits completed and reviewed
- [ ] Manual testing complete for all flows
- [ ] Login works with existing passkey
- [ ] Registration works in dev mode (creates new passkey)
- [ ] Registration hidden in production mode
- [ ] Error handling covers all edge cases
- [ ] Redirects work correctly (including query.redirect)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] No console errors in browser

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Browser doesn't support WebAuthn | Check support on mount, show clear error message |
| API response format changes | Use TypeScript types to catch mismatches early |
| User cancels passkey prompt | Catch `NotAllowedError` and show friendly message |
| Network errors during auth | Proper try-catch with user-friendly error messages |
| Incorrect redirect after login | Test redirect query param extensively |

## Open Questions

None - all requirements are clear from backend API contracts and existing frontend patterns.

## Notes

### @simplewebauthn/browser v9.0.1 API
- Uses `startAuthentication(options)` directly, NOT `startAuthentication({ optionsJSON })`
- Uses `startRegistration(options)` directly, NOT `startRegistration({ optionsJSON })`
- Backend returns options in correct format already

### Import.meta.env.DEV
- Vite built-in constant
- `true` in development mode (`pnpm dev`)
- `false` in production build (`pnpm build`)

### User Type
Already defined in `app/src/composables/useAuth.ts`:
```typescript
export interface User {
  id: string
  email: string
  displayName: string | null
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}
```
