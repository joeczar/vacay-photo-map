# Implementation Plan: First-User-Only Registration

**Issue:** #144
**Branch:** `feature/issue-144-first-user-registration`
**Complexity:** Medium
**Total Commits:** 7

## Overview
Implement first-user-only registration for production deployment with Telegram-based account recovery.

**Part 1 (Commits 1-4):** Replace the dev-only registration check with an API-based system that allows registration only when no users exist. After the first user registers, registration is automatically locked. This solves the WebAuthn passkey domain-binding issue.

**Part 2 (Commits 5-7):** Add Telegram bot recovery flow so users can regain access if they lose their passkey. User requests recovery → receives 6-digit code via Telegram → enters code → can register new passkey.

## Prerequisites
- [x] WebAuthn authentication backend complete (`/api/auth/*`)
- [x] Frontend registration flow implemented (`RegisterView.vue`)
- [x] Router guard system in place (`router/index.ts`)
- [x] Database query pattern exists (line 430 in `api/src/routes/auth.ts`)
- [ ] Telegram bot created via @BotFather (user setup)
- [ ] Telegram chat ID obtained (user setup)

## Architecture

### Components (Part 1: First-User Registration)
- **API Endpoint** - `GET /api/auth/registration-status` - Returns whether registration is open
- **Router Guard** - `beforeEnter` on `/register` route - Checks API before allowing access
- **LoginView** - Conditionally shows registration link based on API status
- **RegisterView** - Verifies registration still open on mount, redirects if closed

### Components (Part 2: Telegram Recovery)
- **Database** - `recovery_tokens` table for storing recovery codes
- **API Endpoints**:
  - `POST /api/auth/recovery/request` - Generate code, send via Telegram
  - `POST /api/auth/recovery/verify` - Verify code, allow passkey re-registration
- **Telegram Service** - Simple HTTP POST to Telegram Bot API
- **RecoveryView** - UI for requesting and verifying recovery codes

### Data Flow (First-User Registration)
```
1. Frontend requests /api/auth/registration-status
   ↓
2. API queries: SELECT EXISTS (SELECT 1 FROM user_profiles)
   ↓
3. Returns { registrationOpen: !exists, reason: string }
   ↓
4. Frontend shows/hides registration link and route access
```

### Data Flow (Telegram Recovery)
```
1. User clicks "Lost access?" on login page
   ↓
2. User enters email on /recover page
   ↓
3. API generates 6-digit code, stores in recovery_tokens (10 min TTL)
   ↓
4. API sends code to Telegram via Bot API
   ↓
5. User receives code on Telegram, enters on website
   ↓
6. API verifies code, deletes user's authenticators
   ↓
7. User redirected to /register to create new passkey
   ↓
8. Recovery token marked as used
```

### Security Considerations
- Endpoint is public (no auth required) - doesn't leak sensitive user data
- Only reveals "users exist" boolean, not count or details
- Rate limiting already applies via middleware (10 req/min per IP)
- Fail closed: Network errors redirect to login (prevents bypass)
- First-user bootstrap logic already exists (makes first user admin)

## Atomic Commits

### Commit 1: Add registration-status API endpoint
**Type:** feat
**Scope:** api/auth
**Files:**
- `api/src/routes/auth.ts` - Modify (add endpoint after line 240)

**Changes:**
- Add `GET /api/auth/registration-status` endpoint after logout endpoint (line 866)
- Query database: `SELECT EXISTS (SELECT 1 FROM user_profiles) as exists`
- Return JSON: `{ registrationOpen: boolean, reason: string }`
- Reason values: `"no_users_yet"` when open, `"first_user_registered"` when closed
- No authentication required (public endpoint)
- Rate limiting auto-applies via existing middleware (line 193)

**Implementation Details:**
```typescript
// Add after line 866 (after logout endpoint)
// =============================================================================
// GET /registration-status - Check if registration is open (first-user-only)
// =============================================================================
auth.get("/registration-status", async (c) => {
  const db = getDbClient();

  const [{ exists }] = await db<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM user_profiles) as exists
  `;

  return c.json({
    registrationOpen: !exists,
    reason: exists ? "first_user_registered" : "no_users_yet"
  });
});
```

**Acceptance Criteria:**
- [ ] Endpoint returns `{ registrationOpen: true, reason: "no_users_yet" }` when no users exist
- [ ] Endpoint returns `{ registrationOpen: false, reason: "first_user_registered" }` after first user
- [ ] Endpoint accessible without authentication
- [ ] Rate limiting applies (10 req/min per IP)
- [ ] Tests pass: `bun test api/src/routes/auth.test.ts`
- [ ] Types pass: `pnpm type-check`

**Manual Testing:**
```bash
# Before first user
curl http://localhost:3000/api/auth/registration-status
# Should return: {"registrationOpen":true,"reason":"no_users_yet"}

# After registering first user
curl http://localhost:3000/api/auth/registration-status
# Should return: {"registrationOpen":false,"reason":"first_user_registered"}
```

---

### Commit 2: Update router guard to use API-based registration check
**Type:** feat
**Scope:** app/router
**Files:**
- `app/src/router/index.ts` - Modify (replace lines 22-29)

**Changes:**
- Replace `import.meta.env.DEV` check with async API call in `beforeEnter` guard
- Fetch `${import.meta.env.VITE_API_URL}/api/auth/registration-status`
- If `registrationOpen === true`, allow route access with `next()`
- If `registrationOpen === false` or network error, redirect to login with `next({ name: 'login' })`
- Fail closed: Any error (network, timeout, 500) redirects to login
- Use try/catch for error handling

**Implementation Details:**
```typescript
// Replace lines 22-29 with:
{
  path: '/register',
  name: 'register',
  component: () => import('../views/RegisterView.vue'),
  beforeEnter: async (_to, _from, next) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auth/registration-status`
      );

      if (!response.ok) {
        // API error - fail closed
        return next({ name: 'login' });
      }

      const { registrationOpen } = await response.json();

      if (registrationOpen) {
        next();
      } else {
        next({ name: 'login' });
      }
    } catch (error) {
      // Network error or JSON parse error - fail closed
      console.error('[ROUTER] Registration status check failed:', error);
      next({ name: 'login' });
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Route accessible when registration is open (no users exist)
- [ ] Route redirects to `/login` when registration is closed (users exist)
- [ ] Network errors redirect to login (fail closed)
- [ ] API errors (4xx/5xx) redirect to login
- [ ] No console errors during normal flow
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

**Manual Testing:**
```bash
# With no users in database
# Visit http://localhost:5173/register
# Should load RegisterView

# After registering first user
# Visit http://localhost:5173/register
# Should redirect to /login
```

---

### Commit 3: Update LoginView to fetch registration status dynamically
**Type:** feat
**Scope:** app/login
**Files:**
- `app/src/views/LoginView.vue` - Modify (replace `isDev` computed, line 93)

**Changes:**
- Remove `isDev` computed property (line 93)
- Add `registrationOpen` ref (initialized to `false`)
- Add `onMounted` hook to fetch registration status from API
- Update registration link condition from `v-if="isDev"` to `v-if="registrationOpen"` (line 46)
- Import `onMounted` from vue
- Handle fetch errors silently (keep `registrationOpen` false on error)
- Use same API endpoint: `${import.meta.env.VITE_API_URL}/api/auth/registration-status`

**Implementation Details:**
```typescript
// Add to imports (line 56)
import { ref, computed, onMounted } from 'vue'

// Replace isDev computed (line 93) with:
const registrationOpen = ref(false)

// Add after webAuthnSupported check (around line 90)
onMounted(async () => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/auth/registration-status`
    );

    if (response.ok) {
      const { registrationOpen: isOpen } = await response.json();
      registrationOpen.value = isOpen;
    }
  } catch (error) {
    // Fail closed - keep registrationOpen as false
    console.error('[LOGIN] Failed to fetch registration status:', error);
  }
})

// Update template (line 46) from:
<div v-if="isDev" class="mt-4 text-center text-sm text-muted-foreground">

// To:
<div v-if="registrationOpen" class="mt-4 text-center text-sm text-muted-foreground">
```

**Acceptance Criteria:**
- [ ] Registration link shows when no users exist
- [ ] Registration link hidden after first user registers
- [ ] Network errors don't show registration link (fail closed)
- [ ] No console errors during normal flow
- [ ] Link remains clickable and routes to `/register`
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

**Manual Testing:**
```bash
# With no users in database
# Visit http://localhost:5173/login
# Should see "Need an account? Register" link

# After registering first user
# Refresh /login page
# Registration link should be hidden
```

---

### Commit 4: Add registration status check to RegisterView on mount
**Type:** feat
**Scope:** app/register
**Files:**
- `app/src/views/RegisterView.vue` - Modify

**Changes:**
- Import `onMounted` from vue
- Add registration status check on component mount
- If registration is closed, redirect to login with error message
- Show Alert banner if registration is closed (before redirect)
- Handle network errors gracefully (allow registration attempt - backend will reject if closed)
- Use same API endpoint as previous commits

**Implementation Details:**
```typescript
// Add to imports (line 70)
import { ref, onMounted } from 'vue'

// Add after webAuthnSupported check (around line 103)
onMounted(async () => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/auth/registration-status`
    );

    if (response.ok) {
      const { registrationOpen } = await response.json();

      if (!registrationOpen) {
        error.value = 'Registration is closed. The first user has already been registered.';

        // Redirect to login after showing error briefly
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    }
    // If API call fails, let user try - backend will validate
  } catch (err) {
    // Network error - let user try to register
    // Backend will return 409 if user exists
    console.error('[REGISTER] Failed to fetch registration status:', err);
  }
})
```

**Acceptance Criteria:**
- [ ] Component checks registration status on mount
- [ ] Shows error and redirects to login if registration closed
- [ ] Network errors allow registration attempt (backend validates)
- [ ] Error message is clear and user-friendly
- [ ] 2-second delay before redirect (user can read error)
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

**Manual Testing:**
```bash
# After first user registered, directly visit http://localhost:5173/register
# Should show error: "Registration is closed..."
# Should redirect to /login after 2 seconds
```

---

### Commit 5: Add recovery tokens schema and Telegram service
**Type:** feat
**Scope:** api/db
**Files:**
- `api/src/db/schema.sql` - Add recovery_tokens table
- `api/src/services/telegram.ts` - Create (new file)
- `api/.env.example` - Add Telegram env vars

**Changes:**
- Add `recovery_tokens` table to schema:
  ```sql
  CREATE TABLE recovery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_recovery_tokens_user_id ON recovery_tokens(user_id);
  CREATE INDEX idx_recovery_tokens_code ON recovery_tokens(code);
  ```
- Create Telegram service:
  ```typescript
  // api/src/services/telegram.ts
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  export async function sendTelegramMessage(text: string): Promise<boolean> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('[TELEGRAM] Not configured, skipping notification');
      return false;
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML'
          })
        }
      );
      return response.ok;
    } catch (error) {
      console.error('[TELEGRAM] Failed to send message:', error);
      return false;
    }
  }

  export function generateRecoveryCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  ```
- Add to `.env.example`:
  ```
  # Telegram Recovery (optional - for account recovery)
  TELEGRAM_BOT_TOKEN=     # Get from @BotFather
  TELEGRAM_CHAT_ID=       # Your chat ID (message @userinfobot)
  ```

**Acceptance Criteria:**
- [ ] Schema migration applies cleanly
- [ ] Telegram service sends messages when configured
- [ ] Service gracefully skips when not configured
- [ ] Types pass: `pnpm type-check`

---

### Commit 6: Add recovery API endpoints
**Type:** feat
**Scope:** api/auth
**Files:**
- `api/src/routes/auth.ts` - Add recovery endpoints

**Changes:**
- Add `POST /api/auth/recovery/request`:
  ```typescript
  auth.post("/recovery/request", async (c) => {
    const { email } = await c.req.json();

    // Find user by email
    const db = getDbClient();
    const [user] = await db<DbUser[]>`
      SELECT id, email FROM user_profiles WHERE email = ${email.toLowerCase()}
    `;

    if (!user) {
      // Don't reveal if user exists - always return success
      return c.json({ success: true, message: "If account exists, recovery code sent" });
    }

    // Generate code
    const code = generateRecoveryCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Store token
    await db`
      INSERT INTO recovery_tokens (user_id, code, expires_at)
      VALUES (${user.id}, ${code}, ${expiresAt})
    `;

    // Send via Telegram
    await sendTelegramMessage(
      `🔐 <b>Recovery Code</b>\n\nAccount: ${user.email}\nCode: <code>${code}</code>\n\nExpires in 10 minutes.`
    );

    return c.json({ success: true, message: "If account exists, recovery code sent" });
  });
  ```

- Add `POST /api/auth/recovery/verify`:
  ```typescript
  auth.post("/recovery/verify", async (c) => {
    const { email, code } = await c.req.json();

    const db = getDbClient();

    // Find valid token
    const [token] = await db<RecoveryToken[]>`
      SELECT rt.id, rt.user_id, rt.code, rt.expires_at, rt.used_at
      FROM recovery_tokens rt
      JOIN user_profiles u ON rt.user_id = u.id
      WHERE u.email = ${email.toLowerCase()}
        AND rt.code = ${code}
        AND rt.expires_at > NOW()
        AND rt.used_at IS NULL
      ORDER BY rt.created_at DESC
      LIMIT 1
    `;

    if (!token) {
      return c.json({ error: "Invalid or expired code" }, 400);
    }

    // Mark token as used
    await db`UPDATE recovery_tokens SET used_at = NOW() WHERE id = ${token.id}`;

    // Delete user's authenticators (allows re-registration)
    await db`DELETE FROM authenticators WHERE user_id = ${token.user_id}`;

    // Send confirmation via Telegram
    await sendTelegramMessage(`✅ Recovery successful for ${email}. Passkeys cleared.`);

    return c.json({
      success: true,
      message: "Recovery successful. Please register a new passkey.",
      redirectTo: "/register"
    });
  });
  ```

**Acceptance Criteria:**
- [ ] Request endpoint generates code and sends to Telegram
- [ ] Request endpoint doesn't reveal if user exists (always success)
- [ ] Verify endpoint validates code and expiry
- [ ] Verify endpoint clears authenticators on success
- [ ] Rate limiting applies (existing middleware)
- [ ] Tests pass: `bun test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 7: Add recovery UI
**Type:** feat
**Scope:** app
**Files:**
- `app/src/views/RecoveryView.vue` - Create (new file)
- `app/src/router/index.ts` - Add /recover route
- `app/src/views/LoginView.vue` - Add "Lost access?" link

**Changes:**
- Create `RecoveryView.vue`:
  - Two-step form: email entry → code verification
  - Email step: Input + "Send Recovery Code" button
  - Code step: 6-digit input + "Verify Code" button
  - Success: Redirect to /register with message
  - Error handling for invalid/expired codes
  - Loading states for both steps

- Add route to `router/index.ts`:
  ```typescript
  {
    path: '/recover',
    name: 'recover',
    component: () => import('../views/RecoveryView.vue')
  }
  ```

- Add link to `LoginView.vue`:
  ```vue
  <div class="mt-2 text-center text-sm text-muted-foreground">
    <router-link to="/recover" class="text-primary hover:underline">
      Lost access? Recover account
    </router-link>
  </div>
  ```

**Acceptance Criteria:**
- [ ] /recover route accessible
- [ ] Email form submits and shows code input
- [ ] Code verification works with valid code
- [ ] Invalid/expired codes show error
- [ ] Successful recovery redirects to /register
- [ ] "Lost access?" link visible on login page
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

## Testing Strategy

### Manual Testing (Critical Path)

**Test Case 1: Fresh Install (No Users)**
1. Clear database: `DELETE FROM user_profiles; DELETE FROM authenticators;`
2. Start app: `pnpm dev` (both API and frontend)
3. Visit `http://localhost:5173/login`
4. Verify registration link is visible
5. Click "Register" link
6. Verify RegisterView loads successfully
7. Complete registration with passkey
8. Verify redirect to `/trips`

**Test Case 2: After First User (Registration Locked)**
1. With one user in database
2. Visit `http://localhost:5173/login`
3. Verify registration link is hidden
4. Directly visit `http://localhost:5173/register`
5. Verify redirect to `/login` (blocked by router guard)
6. Try to access registration via URL manipulation
7. Verify all attempts redirect to login

**Test Case 3: Network Errors (Fail Closed)**
1. Stop API server
2. Visit `http://localhost:5173/login`
3. Verify registration link doesn't appear (fail closed)
4. Try to visit `/register`
5. Verify redirect to `/login` (router guard fails closed)
6. Restart API server
7. Verify functionality restored

**Test Case 4: API Endpoint Behavior**
```bash
# Before any users
curl http://localhost:3000/api/auth/registration-status
# Expected: {"registrationOpen":true,"reason":"no_users_yet"}

# After first user
curl http://localhost:3000/api/auth/registration-status
# Expected: {"registrationOpen":false,"reason":"first_user_registered"}

# Rate limiting
for i in {1..15}; do curl http://localhost:3000/api/auth/registration-status; done
# Expected: First 10 succeed, then 429 Too Many Requests
```

**Test Case 5: Production Deployment Flow**
1. Deploy to production with empty database
2. Navigate to `https://your-domain.com/login`
3. Verify registration link appears
4. Complete registration on production domain
5. Verify registration link disappears
6. Verify production passkey works for login
7. Confirm registration route is inaccessible

**Test Case 6: Telegram Recovery Flow**
1. Configure Telegram bot (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
2. Register a user and confirm login works
3. Visit `/login`, click "Lost access?"
4. Enter registered email on `/recover`
5. Check Telegram for 6-digit code
6. Enter code on recovery page
7. Verify redirect to `/register`
8. Register new passkey
9. Verify login works with new passkey

**Test Case 7: Recovery Security**
1. Request recovery with non-existent email → should return success (no user enumeration)
2. Enter wrong code → should show "Invalid or expired code"
3. Wait 11 minutes, try code → should show expired
4. Use same code twice → should fail second time
5. Rate limiting → 11th request in 1 minute should be blocked

**Test Case 8: Recovery without Telegram**
1. Don't configure TELEGRAM_BOT_TOKEN
2. Request recovery → should still succeed (no error)
3. Check console → should show "[TELEGRAM] Not configured" warning
4. (Code won't be delivered, but system doesn't crash)

### Automated Testing

**Unit Tests (Optional - can be added in follow-up)**
- Mock API responses in router guard tests
- Test fail-closed behavior with network errors
- Test registration status state management in LoginView

**Integration Tests (Backend)**
Add test cases to `api/src/routes/auth.test.ts`:
```typescript
describe('GET /api/auth/registration-status', () => {
  it('returns open when no users exist', async () => {
    // Test with empty database
  });

  it('returns closed after first user registers', async () => {
    // Create user, then test
  });

  it('applies rate limiting', async () => {
    // Test 15 rapid requests
  });
});
```

**E2E Tests (Future - Milestone 5)**
- Playwright test for registration flow
- Test router guard behavior
- Test UI state changes

## Verification Checklist

Before PR creation:
- [ ] All 7 commits completed and individually tested
- [ ] API endpoint works with/without users
- [ ] Router guard blocks access when registration closed
- [ ] LoginView shows/hides registration link correctly
- [ ] RegisterView redirects when registration closed
- [ ] Fail-closed behavior tested (network errors)
- [ ] Rate limiting verified (10 req/min)
- [ ] Recovery schema applied to database
- [ ] Telegram service sends messages when configured
- [ ] Telegram service gracefully degrades when not configured
- [ ] Recovery flow works end-to-end
- [ ] Recovery codes expire after 10 minutes
- [ ] Recovery codes can only be used once
- [ ] "Lost access?" link visible on login page
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Backend tests pass (`bun test`)
- [ ] No console errors during normal flow
- [ ] Manual testing completed for all test cases
- [ ] Production deployment scenario documented in PR

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race condition: Two users register simultaneously | First-user logic uses database transaction with table lock (line 427 in auth.ts) - already handles this |
| Network errors expose registration to public | Fail closed: All network errors redirect to login, keep link hidden |
| API endpoint reveals user count | Endpoint only returns boolean, not count. Rate limited to prevent enumeration attacks |
| User deletes first account, reopens registration | Intentional behavior - if all users deleted, registration reopens. Document in PR notes |
| Browser cache shows stale registration link | API call on every mount ensures fresh data. Consider adding cache headers in future |
| User bookmarked /register, tries to access later | Router guard and RegisterView mount check both prevent access |
| Telegram bot token exposed | Store in environment variables, never commit to repo |
| Recovery code brute force | 6-digit code = 1M combinations, 10 min expiry, rate limiting applies |
| Recovery reveals user exists | Always return success message regardless of user existence |
| Telegram not configured | Graceful degradation - recovery "succeeds" but code never arrives. Log warning. |
| Lost Telegram access | User still has their account/data. Can SSH to server and manually reset authenticators if needed. |

## Open Questions

None - all requirements are clear from issue #144 and existing codebase patterns.

## Production Deployment Flow

After this feature is merged:

1. **Initial Deployment** (no users exist)
   ```bash
   # Deploy API + Frontend to production
   # Database is empty (fresh install or all users deleted)
   ```

2. **First User Registration**
   ```
   User visits: https://photos.joeczar.com/login
   Sees: "Need an account? Register" link
   Clicks: Register link
   Creates: Passkey on production domain (photos.joeczar.com)
   Result: User becomes admin (first-user bootstrap)
   ```

3. **Automatic Lock**
   ```
   After successful registration:
   - Registration link disappears from /login
   - /register route becomes inaccessible
   - Only login flow available
   ```

4. **Future Users** (Milestone 7)
   ```
   Admin can invite users via invite system
   Invited users get one-time registration link
   Invite system bypasses first-user check
   ```

## Additional Notes

### Why This Approach?

1. **No Environment Variables** - No `ALLOW_REGISTRATION=true` hacks needed
2. **Self-Locking** - Registration automatically closes after first use
3. **Production-Ready** - Solves WebAuthn domain-binding issue
4. **Secure** - Fail closed on errors, rate limited, no user enumeration
5. **Simple** - Uses existing patterns and infrastructure

### Alternative Approaches Considered

| Approach | Rejected Why |
|----------|-------------|
| Env var `ALLOW_REGISTRATION=true` | Manual intervention required, easy to forget to disable |
| Invite codes for first user | Overcomplicated, adds secret management |
| Admin CLI to create first user | Requires SSH access, not user-friendly |
| Magic link via email | Requires email service, adds complexity |

### Future Enhancements (Not in Scope)

- [ ] Admin UI to reset registration (delete all users, reopen registration)
- [ ] Invite system for additional users (Milestone 7)
- [ ] Registration quota (allow N users before locking)
- [ ] Audit log of registration status checks
- [ ] Cache registration status on frontend (reduce API calls)

### Database State Changes

This feature introduces no database schema changes. It only adds:
- One new API endpoint (read-only query)
- Three frontend modifications (UI state management)

### Backward Compatibility

- Dev mode `import.meta.env.DEV` check is removed
- Replaced with API-based check (works in both dev and prod)
- No breaking changes to existing functionality
- Existing users can still log in normally

### Performance Considerations

- API endpoint is lightweight: Single SELECT EXISTS query
- Frontend calls API once per page load (LoginView mount)
- Router guard calls API once per navigation to /register
- Rate limiting prevents abuse (10 req/min per IP)
- No caching needed (lightweight query, infrequent checks)

### Security Considerations

- **User Enumeration**: Endpoint reveals "users exist" but not count/emails/details
- **Rate Limiting**: Already applied via existing middleware (10 req/min)
- **Fail Closed**: All errors (network, API, parsing) result in registration blocked
- **No Auth Required**: Public endpoint is acceptable (no sensitive data leaked)
- **SQL Injection**: Using parameterized queries via `postgres` package
- **XSS**: No user input in registration status responses
