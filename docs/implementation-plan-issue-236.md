# Implementation Plan: Add Change Password Flow for Logged-In Users

**Issue:** #236
**Branch:** `feature/issue-236-password-change`
**Complexity:** Simple
**Total Commits:** 3

## Overview

Add self-service password change functionality for **all authenticated users** (not just admins). Users will access Settings via a user profile dropdown menu in the main header. The implementation requires current password validation to prevent unauthorized changes and follows existing authentication patterns.

## Prerequisites

- [x] Password hashing infrastructure exists (`Bun.password.hash/verify`)
- [x] Auth middleware exists (`requireAuth`)
- [x] Rate limiting exists for all `/api/auth/*` routes
- [x] Test factories and helpers exist

## Architecture

### Components

**Backend:**
- `POST /api/auth/change-password` - Authenticated endpoint for password changes

**Frontend:**
- `UserProfileMenu.vue` - NEW: Dropdown menu with Settings & Logout
- `SettingsView.vue` - NEW: Settings page with change password form (at `/settings`, NOT `/admin/settings`)
- `MainLayout.vue` - MODIFY: Replace Logout button with UserProfileMenu
- `router/index.ts` - MODIFY: Add `/settings` route (requiresAuth only, NOT requiresAdmin)

### Data Flow

```
User fills form → Validates current password → Hashes new password → Updates database → Returns success
                                              ↓
                                        Logs change event
```

## Atomic Commits

### Commit 1: Add change password API endpoint

**Type:** feat
**Scope:** api/auth
**Files:**
- `api/src/routes/auth.ts` - Create endpoint

**Changes:**

Add new endpoint after the `/admin/reset-password` endpoint (around line 485):

```typescript
// =============================================================================
// POST /change-password - Change password for current user
// =============================================================================
auth.post("/change-password", requireAuth, async (c) => {
  const currentUser = c.var.user!;
  const body = await c.req.json<{
    currentPassword: string;
    newPassword: string;
  }>();

  const { currentPassword, newPassword } = body;

  // Validate required fields
  if (!currentPassword || !newPassword) {
    return c.json(
      {
        error: "Bad Request",
        message: "Current password and new password required",
      },
      400,
    );
  }

  // Validate new password length
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      {
        error: "Bad Request",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      },
      400,
    );
  }

  // Prevent setting same password
  if (currentPassword === newPassword) {
    return c.json(
      {
        error: "Bad Request",
        message: "New password must be different from current password",
      },
      400,
    );
  }

  try {
    const db = getDbClient();

    // Fetch user with password hash
    const users = await db<Pick<DbUser, "id" | "password_hash" | "email">[]>`
      SELECT id, password_hash, email
      FROM user_profiles
      WHERE id = ${currentUser.id}
    `;

    if (users.length === 0) {
      return c.json({ error: "Not Found", message: "User not found" }, 404);
    }

    const user = users[0];

    // Verify current password
    const isValid = await Bun.password.verify(
      currentPassword,
      user.password_hash,
    );

    if (!isValid) {
      // Generic error message to prevent user enumeration
      return c.json(
        { error: "Unauthorized", message: "Invalid current password" },
        401,
      );
    }

    // Hash new password
    const passwordHash = await Bun.password.hash(newPassword);

    // Update password
    await db`
      UPDATE user_profiles
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${user.id}
    `;

    // Log password change event
    console.log(`[AUTH] Password changed for user ${user.email} (${user.id})`);

    return c.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error(
      "[AUTH] Password change error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return c.json(
      { error: "Internal Server Error", message: "Password change failed" },
      500,
    );
  }
});
```

**Key Patterns:**
- Uses `requireAuth` middleware (user data available via `c.var.user`)
- Rate limiting already applied by auth route middleware
- Validates current password before allowing change
- Generic error messages to prevent enumeration
- Logs password change events for security audit
- Prevents setting same password (usability)

**Acceptance Criteria:**
- [x] Endpoint added at `/api/auth/change-password`
- [x] Requires authentication via `requireAuth` middleware
- [x] Validates current password matches
- [x] Validates new password length (min 8 chars)
- [x] Prevents same password
- [x] Updates password hash in database
- [x] Logs password change event
- [x] Returns generic error for invalid current password
- [x] Manual test: `curl -X POST http://localhost:4000/api/auth/change-password -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"currentPassword":"old","newPassword":"newpass123"}' | jq`

---

### Commit 2: Add user profile menu and Settings page

**Type:** feat
**Scope:** app/settings
**Files:**
- `app/src/components/UserProfileMenu.vue` - NEW: User profile dropdown
- `app/src/views/SettingsView.vue` - NEW: Settings page with change password form
- `app/src/layouts/MainLayout.vue` - MODIFY: Replace Logout button with UserProfileMenu
- `app/src/router/index.ts` - MODIFY: Add `/settings` route

**Changes:**

**1. Create `app/src/components/UserProfileMenu.vue`:**

```vue
<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="flex items-center gap-2">
        <User class="h-4 w-4" />
        <span class="hidden sm:inline">{{ userEmail }}</span>
        <ChevronDown class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <DropdownMenuLabel>My Account</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <router-link to="/settings" class="flex items-center gap-2 cursor-pointer">
          <Settings class="h-4 w-4" />
          Settings
        </router-link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="$emit('logout')" class="cursor-pointer">
        <LogOut class="h-4 w-4 mr-2" />
        Logout
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { User, Settings, LogOut, ChevronDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

defineProps<{
  userEmail: string
}>()

defineEmits<{
  logout: []
}>()
</script>
```

**2. Create `app/src/views/SettingsView.vue`:**

```vue
<template>
  <MainLayout>
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-foreground">Settings</h1>
      </div>

      <!-- Card: Change Password -->
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <!-- Success Alert -->
          <Alert v-if="successMessage" variant="default" class="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
            <AlertDescription class="text-green-700 dark:text-green-300">
              {{ successMessage }}
            </AlertDescription>
          </Alert>

          <!-- Error Alert -->
          <Alert v-if="errorMessage" variant="destructive" class="mb-4">
            <AlertDescription>{{ errorMessage }}</AlertDescription>
          </Alert>

          <form @submit="onSubmit" class="space-y-4">
            <!-- Current Password -->
            <FormField v-slot="{ componentField }" name="currentPassword">
              <FormItem>
                <FormLabel>Current Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter current password"
                    v-bind="componentField"
                    :disabled="isSubmitting"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- New Password -->
            <FormField v-slot="{ componentField }" name="newPassword">
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter new password (min 8 characters)"
                    v-bind="componentField"
                    :disabled="isSubmitting"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Confirm New Password -->
            <FormField v-slot="{ componentField }" name="confirmPassword">
              <FormItem>
                <FormLabel>Confirm New Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    v-bind="componentField"
                    :disabled="isSubmitting"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <Button type="submit" :disabled="isSubmitting || !meta.valid">
              {{ isSubmitting ? 'Changing Password...' : 'Change Password' }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import MainLayout from '@/layouts/MainLayout.vue'

// State
const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Form validation schema
const changePasswordSchema = toTypedSchema(
  z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().min(1, 'Please confirm your new password')
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword']
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: 'New password must be different from current password',
      path: ['newPassword']
    })
)

const { handleSubmit, meta, resetForm } = useForm({
  validationSchema: changePasswordSchema,
  initialValues: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  }
})

// Form submission handler
const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await api.post<{ success: boolean; message: string }>('/api/auth/change-password', {
      currentPassword: values.currentPassword,
      newPassword: values.newPassword
    })

    successMessage.value = 'Password changed successfully'
    resetForm()
  } catch (err) {
    console.error('Password change failed:', err)

    if (err instanceof ApiError) {
      if (err.status === 401) {
        errorMessage.value = 'Current password is incorrect'
      } else if (err.status === 400) {
        errorMessage.value = err.message || 'Invalid password. Please check requirements.'
      } else {
        errorMessage.value = err.message || 'Failed to change password. Please try again.'
      }
    } else {
      errorMessage.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    isSubmitting.value = false
  }
})
</script>
```

**3. Modify `app/src/layouts/MainLayout.vue`:**

Replace the Logout button with UserProfileMenu (around lines 21-23):

```vue
<!-- BEFORE -->
<template v-if="isAuthenticated">
  <Button variant="ghost" @click="handleLogout" :disabled="loading"> Logout </Button>
</template>

<!-- AFTER -->
<template v-if="isAuthenticated">
  <UserProfileMenu :user-email="userEmail" @logout="handleLogout" />
</template>
```

Add imports in script section:
```typescript
import UserProfileMenu from '@/components/UserProfileMenu.vue'
```

Get userEmail from useAuth:
```typescript
const { isAuthenticated, isAdmin, loading, logout, user } = useAuth()
const userEmail = computed(() => user.value?.email || 'Account')
```

**4. Modify `app/src/router/index.ts`:**

Add route (NOT in admin section - place after authenticated routes):

```typescript
{
  path: '/settings',
  name: 'settings',
  component: () => import('../views/SettingsView.vue'),
  meta: { requiresAuth: true }  // Note: NOT requiresAdmin - all authenticated users can access
},
```

**Key Patterns:**
- Uses vee-validate + zod for form validation
- Uses shadcn-vue components (Card, Input, Button, Alert, Form components, DropdownMenu)
- UserProfileMenu provides clean access for all authenticated users
- Uses `api.post()` from `app/src/lib/api.ts`
- Clear success/error messaging
- Form reset on success
- Client-side validation (password match, min length, different from current)

**Acceptance Criteria:**
- [x] UserProfileMenu.vue created with dropdown (Settings, Logout)
- [x] SettingsView.vue created with change password form
- [x] Form validates: current password required, new password min 8 chars, passwords match
- [x] Form validates new password different from current
- [x] User profile dropdown appears in main header for authenticated users
- [x] Route accessible at `/settings` (requires auth, NOT admin)
- [x] Success message shown on successful change
- [x] Error messages shown for: invalid current password, validation errors, network errors
- [x] Form resets after successful password change
- [x] Manual test in browser: Login, click profile dropdown, go to Settings, change password

---

### Commit 3: Add comprehensive tests for change password endpoint

**Type:** test
**Scope:** api/auth
**Files:**
- `api/src/routes/auth.test.ts` - Add tests

**Changes:**

Add test suite after existing auth tests (near end of file):

```typescript
// =============================================================================
// POST /change-password - Change password for current user
// =============================================================================

describe('POST /api/auth/change-password', () => {
  let userId: string
  const originalPassword = 'original-password-123'
  const newPassword = 'new-password-456'

  beforeEach(async () => {
    // Create test user with known password
    const user = await createUser({
      email: 'password-change-test@example.com',
      password: originalPassword
    })
    userId = user.id
  })

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId)
    }
  })

  it('requires authentication', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword
        })
      })
    )

    expect(res.status).toBe(401)
    const data = (await res.json()) as ErrorResponse
    expect(data.error).toBe('Unauthorized')
  })

  it('validates current password is required', async () => {
    const headers = await getUserAuthHeader(userId)

    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: '',
          newPassword: newPassword
        })
      })
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as ErrorResponse
    expect(data.message).toContain('required')
  })

  it('validates new password is required', async () => {
    const headers = await getUserAuthHeader(userId)

    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: ''
        })
      })
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as ErrorResponse
    expect(data.message).toContain('required')
  })

  it('validates new password length', async () => {
    const headers = await getUserAuthHeader(userId)

    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: 'short'
        })
      })
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as ErrorResponse
    expect(data.message).toContain('at least 8 characters')
  })

  it('rejects if current password is incorrect', async () => {
    const headers = await getUserAuthHeader(userId)

    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'wrong-password',
          newPassword: newPassword
        })
      })
    )

    expect(res.status).toBe(401)
    const data = (await res.json()) as ErrorResponse
    expect(data.message).toContain('Invalid current password')
  })

  it('rejects if new password same as current', async () => {
    const headers = await getUserAuthHeader(userId)

    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: originalPassword
        })
      })
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as ErrorResponse
    expect(data.message).toContain('must be different')
  })

  it('successfully changes password with valid credentials', async () => {
    const headers = await getUserAuthHeader(userId)

    const res = await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword
        })
      })
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as SuccessResponse
    expect(data.success).toBe(true)
    expect(data.message).toContain('successfully')
  })

  it('can login with new password after change', async () => {
    const headers = await getUserAuthHeader(userId)

    // Change password
    await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword
        })
      })
    )

    // Try login with new password
    const loginRes = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'password-change-test@example.com',
          password: newPassword
        })
      })
    )

    expect(loginRes.status).toBe(200)
    const loginData = (await loginRes.json()) as AuthResponse
    expect(loginData.token).toBeDefined()
    expect(loginData.user.email).toBe('password-change-test@example.com')
  })

  it('cannot login with old password after change', async () => {
    const headers = await getUserAuthHeader(userId)

    // Change password
    await app.fetch(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword: newPassword
        })
      })
    )

    // Try login with old password
    const loginRes = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'password-change-test@example.com',
          password: originalPassword
        })
      })
    )

    expect(loginRes.status).toBe(401)
    const loginData = (await loginRes.json()) as ErrorResponse
    expect(loginData.error).toBe('Unauthorized')
  })
})
```

**Note:** The `createUser()` factory needs to support a `password` option. Check if this exists, if not, add it:

```typescript
// In api/src/test-factories.ts
export async function createUser(
  options: {
    email?: string
    displayName?: string
    isAdmin?: boolean
    password?: string  // ADD THIS
  } = {}
): Promise<DbUser> {
  const email = options.email || `test-${Date.now()}-${Math.random()}@example.com`
  const displayName = options.displayName || null
  const isAdmin = options.isAdmin || false
  const password = options.password || 'default-test-password-123'  // ADD THIS

  const passwordHash = await Bun.password.hash(password)  // MODIFY THIS

  // ... rest of function
}
```

**Key Patterns:**
- Uses shared test infrastructure (`createUser`, `cleanupUser`, `getUserAuthHeader`)
- Uses shared types (`ErrorResponse`, `SuccessResponse`, `AuthResponse`)
- Tests critical path: auth required, validation, password verification, actual change
- Tests end-to-end flow: can login with new password, cannot login with old
- No hardcoded environment variables (loaded via bunfig.toml preload)

**Acceptance Criteria:**
- [x] Tests require authentication
- [x] Tests validate required fields
- [x] Tests validate password length
- [x] Tests reject incorrect current password
- [x] Tests reject same password
- [x] Tests successful password change
- [x] Tests login with new password works
- [x] Tests login with old password fails
- [x] All tests pass: `cd api && bun test auth.test.ts`
- [x] No hardcoded environment variables
- [x] Uses shared test factories and types

---

## Testing Strategy

Tests are included in Commit 3 (TDD approach would write tests first, but given existing auth patterns, implementation-first is acceptable here).

**Test Coverage:**
- **Unit tests:** Endpoint validation logic (current password, new password length, same password check)
- **Integration tests:** Database password update, password hash verification
- **E2E tests:** Full flow from change to login with new credentials

**Manual Testing:**
1. Start dev environment: `pnpm dev:docker`
2. Login as admin
3. Navigate to `/admin/settings`
4. Test scenarios:
   - Valid password change
   - Incorrect current password
   - New password too short
   - New password same as current
   - Passwords don't match
   - Success message after change
   - Can login with new password
   - Cannot login with old password

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `cd api && bun test`
- [ ] Type check passes: `pnpm type-check` (from root)
- [ ] Lint passes: `pnpm lint` (from root)
- [ ] Manual verification in browser:
  - [ ] User profile dropdown appears in header when logged in
  - [ ] Dropdown contains "Settings" and "Logout" options
  - [ ] Settings page accessible at `/settings` (not admin-only)
  - [ ] Form validates correctly (client-side)
  - [ ] Password change works with valid credentials
  - [ ] Error shown for invalid current password
  - [ ] Success message shown on successful change
  - [ ] Can login with new password
  - [ ] Cannot login with old password
- [ ] Rate limiting works (try 11+ password change attempts)
- [ ] Password change logged to console

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| User forgets new password immediately after change | Add confirmation step or "test new password" flow (future enhancement) |
| Rate limiting too strict for legitimate use | Current rate limit (10 req/min) is reasonable for password changes |
| No email notification of password change | Log event to console for now; add email notifications in future |
| Settings page accessibility | **RESOLVED:** All authenticated users can access via user profile dropdown |

## Open Questions

~~All questions resolved:~~

1. ~~**Access Control:** Should the Settings page be available to all authenticated users (regular users) or just admins?~~
   - **RESOLVED:** All authenticated users can access Settings (route uses `requiresAuth: true` only)

2. ~~**Navigation Placement:** Should "Settings" be in the admin navigation tabs, or in a user profile menu?~~
   - **RESOLVED:** User profile dropdown menu in MainLayout header (accessible to all logged-in users)
