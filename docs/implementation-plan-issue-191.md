# Implementation Plan: Remove first-user registration, add admin CLI

**Issue:** #191
**Branch:** `feature/issue-191-admin-cli`
**Complexity:** Medium
**Total Commits:** 6

## Overview

Replace the "first user becomes admin" registration flow with a CLI command for creating the initial admin. Registration will always be invite-only, removing complexity and security concerns around fresh deployments.

## Prerequisites

- [ ] Database must be running
- [ ] No breaking changes to auth middleware or JWT structure

## Architecture

### Components Modified

- `api/scripts/create-admin.ts` - NEW: CLI for creating admin users
- `api/src/routes/auth.ts` - Remove first-user logic from `/register` and `/registration-status`
- `api/src/routes/auth.test.ts` - Update tests to reflect invite-only registration
- `app/src/router/index.ts` - Remove first-user registration guard logic
- `app/src/views/RegisterView.vue` - Remove first-user UI handling
- `app/src/views/LoginView.vue` - Remove registration link (always invite-only)
- `api/package.json` - Add `create-admin` script
- `CLAUDE.md` - Update first-time setup docs

### Data Flow

**Before (two paths):**
```
No users exist → /register → First user becomes admin
Users exist + invite → /register → Normal user
```

**After (one path):**
```
CLI → create-admin.ts → Admin user in DB
Invite code → /register → Normal user
```

### Key Decisions

1. **Password-based CLI** - Admin creation uses password (not WebAuthn) for simplicity
2. **Interactive prompts** - No command-line password arguments (secure)
3. **Use existing pattern** - Follow `set-password.ts` structure

## Atomic Commits

### Commit 1: Create admin CLI script
**Type:** feat
**Scope:** api/scripts
**Files:**
- `api/scripts/create-admin.ts` - Create

**Changes:**
- Copy structure from `set-password.ts` (prompt helpers, DB client usage)
- Implement admin creation flow:
  1. Prompt for email (validate format)
  2. Check if email already exists (error if duplicate)
  3. Prompt for password (hidden, 8+ chars)
  4. Prompt for confirm password (must match)
  5. Prompt for display name (optional)
  6. Show confirmation summary
  7. Hash password with `Bun.password.hash()`
  8. Insert user with `is_admin = true`
  9. Success message with instructions
- Handle errors gracefully (duplicate email, DB connection, etc.)
- Exit codes: 0 success, 1 failure

**Acceptance Criteria:**
- [ ] Script runs without crashing: `bun api/scripts/create-admin.ts`
- [ ] Creates admin user in database with `is_admin = true`
- [ ] Password is hashed, never stored in plaintext
- [ ] Duplicate email is rejected gracefully
- [ ] Password must be 8+ characters
- [ ] Passwords must match
- [ ] Email format is validated
- [ ] No secrets in code (interactive prompts only)

---

### Commit 2: Add create-admin script to package.json
**Type:** feat
**Scope:** api
**Files:**
- `api/package.json` - Modify

**Changes:**
- Add `"create-admin": "bun run scripts/create-admin.ts"` to scripts section
- Add comment in package.json describing when to use this command

**Acceptance Criteria:**
- [ ] Script runs via `pnpm create-admin` from api directory
- [ ] Script runs via `cd api && pnpm create-admin` from root
- [ ] Types pass: `pnpm type-check`

---

### Commit 3: Remove first-user logic from backend auth routes
**Type:** refactor
**Scope:** api/auth
**Files:**
- `api/src/routes/auth.ts` - Modify

**Changes:**
- **POST /register** (lines 156-351):
  - Remove transaction table lock (`LOCK TABLE user_profiles`)
  - Remove `SELECT EXISTS` check for first user (lines 253-256)
  - Remove `isFirstUser` variable
  - Change `is_admin` value from `${isFirstUser}` to `false` (line 260)
  - Keep all other logic (invite validation, user creation, trip access)

- **GET /registration-status** (lines 632-688):
  - Remove first-user check (lines 637-647)
  - Change logic:
    - If no `inviteCode` query param: return `{ registrationOpen: false, reason: "invite_required" }`
    - If `inviteCode` present: validate invite (existing logic lines 650-681)
    - Return valid/invalid based on invite status
  - Remove `reason: "no_users_yet"` from responses

**Acceptance Criteria:**
- [ ] POST /register always creates non-admin users (unless invite specifies otherwise)
- [ ] GET /registration-status returns `false` when no invite provided
- [ ] GET /registration-status validates invite when provided
- [ ] No table locks in registration transaction
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Commit 4: Update frontend to remove first-user handling
**Type:** refactor
**Scope:** frontend/auth
**Files:**
- `app/src/views/RegisterView.vue` - Modify
- `app/src/views/LoginView.vue` - Modify
- `app/src/router/index.ts` - Modify

**Changes:**

**RegisterView.vue:**
- Remove registration status check in `onMounted` that redirects on closed registration (lines 156-212)
- Keep only invite validation logic (lines 163-185)
- Remove error message about "first user already registered" (line 198)
- Update UI to always require invite (consider showing message if no invite param)

**LoginView.vue:**
- Remove `registrationOpen` ref (line 90)
- Remove registration status check in `onMounted` (lines 92-102)
- Remove conditional register link section (lines 52-55)
- Users can only get to registration via invite links

**router/index.ts:**
- Simplify `/register` route `beforeEnter` guard (lines 22-50)
- Always require valid invite code to access registration
- If no invite query param: redirect to login
- If invalid invite: redirect to login
- Remove fallback for "no users yet" scenario

**Acceptance Criteria:**
- [ ] Registration page only accessible with valid `?invite=XXX` param
- [ ] Login page has no register link
- [ ] No API call to `/registration-status` without invite code
- [ ] Navigation to `/register` without invite redirects to `/login`
- [ ] App builds: `pnpm build`
- [ ] Types pass: `pnpm type-check`

---

### Commit 5: Update auth tests to reflect invite-only registration
**Type:** test
**Scope:** api/auth
**Files:**
- `api/src/routes/auth.test.ts` - Modify

**Changes:**

**Update existing tests:**
- "successfully registers new user with email + password" (lines 34-62):
  - Remove creation of existing admin user
  - Add invite code creation and usage
  - Verify user is NOT admin (`isAdmin: false`)

- "first user becomes admin" (line 122):
  - **DELETE** this test entirely (no longer valid behavior)

**Add new tests:**
- "registration without invite returns 400" - No invite code, should fail
- "registration with valid invite creates non-admin user"
- "registration with invalid invite returns 400"
- "GET /registration-status without invite returns closed"
- "GET /registration-status with valid invite returns open"
- "GET /registration-status with invalid invite returns closed"

**Keep unchanged:**
- All other registration validation tests (invalid email, short password, duplicate email)
- Login tests
- Password reset tests
- /me endpoint tests

**Acceptance Criteria:**
- [ ] All tests pass: `pnpm test`
- [ ] No test references "first user" or "isFirstUser"
- [ ] Registration tests use invite codes
- [ ] Registration status tests cover invite-only logic
- [ ] Types pass: `pnpm type-check`

---

### Commit 6: Update documentation for admin CLI setup
**Type:** docs
**Scope:** setup
**Files:**
- `CLAUDE.md` - Modify

**Changes:**

**Update "First-Time Setup" section:**
- Replace "Option A: Manual registration" with CLI admin creation:
  ```bash
  # Option A: CLI admin creation (recommended for production)
  1. Start dev server: `pnpm dev:docker`
  2. Create admin: `cd api && pnpm create-admin`
  3. Follow interactive prompts
  4. Admin can create invites from /admin/invites
  ```

- Keep "Option B: Seed script" for development:
  ```bash
  # Option B: Seed script (quick setup with sample data)
  1. Start dev server: `pnpm dev:docker`
  2. Run seed: `cd api && pnpm seed`
  3. Default admin: admin@example.com / changeme123
  ```

**Add note:**
- "Registration is always invite-only. First admin must be created via CLI or seed script."
- Remove any references to "first user becomes admin"

**Update troubleshooting section:**
- Add: "If you can't log in, use `pnpm create-admin` to create a new admin or `pnpm reset-password` to reset existing password"

**Acceptance Criteria:**
- [ ] Setup instructions are clear and accurate
- [ ] No references to first-user registration flow
- [ ] Both CLI and seed options documented
- [ ] Troubleshooting updated

---

## Testing Strategy

**Test order (TDD approach):**
1. Commit 1: Manual testing of CLI script (create admin, verify in DB)
2. Commit 2: Manual testing of package.json script alias
3. Commit 3: Backend tests updated in Commit 5 (run after backend changes)
4. Commit 4: Manual browser testing (try to access /register without invite)
5. Commit 5: Full test suite must pass (`pnpm test`)
6. Commit 6: Follow documentation steps to verify accuracy

**Manual verification checklist:**
- [ ] Fresh database → CLI creates admin → admin can log in
- [ ] Duplicate email via CLI shows error
- [ ] Navigation to /register without invite redirects to /login
- [ ] Admin can create invite → invite link works for registration
- [ ] Registered user via invite is NOT admin
- [ ] Login page has no register link

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `cd api && pnpm test`
- [ ] Type check passes: `cd api && pnpm type-check` and `cd app && pnpm type-check`
- [ ] Lint passes: `pnpm lint`
- [ ] Manual verification:
  - [ ] CLI creates admin successfully
  - [ ] Invite-only registration works
  - [ ] First-user registration blocked
  - [ ] Documentation is accurate

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing deployments break (no admin user) | Document migration path: run `create-admin` before deploying |
| Seed script still creates admin | Update seed script to use CLI approach or hardcode admin creation |
| Users locked out if CLI fails | Keep `reset-password` script working as escape hatch |
| Tests break on transaction changes | Update tests incrementally in Commit 5 |

## Open Questions

- **Q: Should seed script also be updated to call create-admin logic?**
  - A: No - seed script can continue directly inserting admin user (development only)

- **Q: What happens to existing first-user registrations in production?**
  - A: No impact - existing admin users remain admin. Only affects new registrations.

- **Q: Should CLI validate email doesn't already exist before prompting for password?**
  - A: Yes - check early to avoid wasted input (included in Commit 1)

## Migration Notes

**For existing deployments:**
1. If no admin exists, run `cd api && pnpm create-admin` before deploying this change
2. If admin exists, no action needed
3. After deployment, registration requires invites (as before, but more explicit)

**No database migration needed** - schema unchanged.
