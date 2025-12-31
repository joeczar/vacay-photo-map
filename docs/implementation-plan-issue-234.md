# Implementation Plan: Admin Password Persistence Fix

**Issue:** #234
**Branch:** `feature/issue-234-password-persistence`
**Complexity:** Simple
**Total Commits:** 2

## Overview

Fix developer experience issue where users lose admin credentials across dev server restarts. The database IS persisting correctly via Docker volumes. The actual problem is:
1. Seed script silently overwrites passwords if run after manual registration
2. Documentation doesn't clearly explain first-time setup workflow or password recovery

This is a documentation + UX fix, not a database persistence issue.

## Prerequisites

- [x] Docker volume configuration verified (working correctly)
- [x] Password reset script already exists (`api/scripts/set-password.ts`)

## Architecture

### Root Cause Analysis

**Database persistence:** Working correctly
- Docker volume `vacay-dev_postgres_dev_data` properly configured
- User data persists across container restarts

**Actual issues:**
1. **Seed script trap:** `api/scripts/seed.ts` uses `ON CONFLICT (email) DO UPDATE` which overwrites password_hash when user runs seed after manual registration
2. **Documentation gap:** No clear guidance on first-time setup or password recovery
3. **Poor discoverability:** Password reset script exists but no package.json alias

### Impact

Developers get confused when:
- They register manually, then run seed script (password silently overwritten)
- They forget their password (no documented recovery method)
- Dev server appears to "lose" credentials (actually overwritten by seed)

## Atomic Commits

### Commit 1: Fix seed script to prevent silent password overwrites
**Type:** fix
**Scope:** scripts

**Files:**
- `api/scripts/seed.ts` - Modify

**Changes:**
1. Change `ON CONFLICT (email) DO UPDATE` to `ON CONFLICT (email) DO NOTHING` (line 18)
2. Add explicit warning when user already exists
3. Update console output to explain what happened

**Rationale:**
The seed script should be idempotent and safe to run multiple times. Silently overwriting passwords is dangerous and confusing. If user already exists, skip creation and inform the developer.

**Acceptance Criteria:**
- [ ] Running seed after manual registration doesn't change password
- [ ] Console output clearly indicates when user already exists
- [ ] First-time seed still creates admin user successfully
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

**Testing Strategy:**
Manual verification:
1. Fresh database: Run seed → user created
2. Run seed again → warning displayed, password unchanged
3. Register manually → run seed → warning displayed, password unchanged

---

### Commit 2: Document first-time setup and password recovery workflow
**Type:** docs
**Scope:** developer-experience

**Files:**
- `CLAUDE.md` - Modify
- `api/package.json` - Modify

**Changes:**

**1. Add package.json script alias:**
```json
"scripts": {
  "reset-password": "bun run scripts/set-password.ts"
}
```

**2. Add new section to CLAUDE.md after "Starting Dev Environment" (around line 109):**

```markdown
### First-Time Setup

**Choose ONE approach:**

**Option A: Manual registration (recommended for real-world testing)**
1. Start dev server: `pnpm dev:docker`
2. Navigate to http://localhost:5173/register
3. Register with your email - first user becomes admin
4. Credentials persist in Docker volume across restarts

**Option B: Seed script (quick setup with sample data)**
1. Start dev server: `pnpm dev:docker`
2. Run seed: `cd api && pnpm seed`
3. Default admin: admin@example.com / changeme123
4. Creates sample trip with photos

**IMPORTANT:** Don't run seed script after manual registration - it will warn but not overwrite.

### Password Recovery (Local Dev)

**If you forget your local admin password:**

```bash
cd api
pnpm reset-password
# Follow prompts to reset any user's password
```

This script:
- Prompts for email and new password interactively
- Uses hidden input (passwords don't show in terminal)
- Updates password_hash directly in database
- Works with any user (admin or regular)
```

**3. Update existing "First user registration" line (line 109):**

BEFORE:
```markdown
**First user registration:** Navigate to localhost:5173/register (or https://photos-dev.joeczar.com/register for dev tunnel) - first user becomes admin.
```

AFTER:
```markdown
See "First-Time Setup" section below for registration or seed script options.
```

**Acceptance Criteria:**
- [ ] Package.json includes `reset-password` script
- [ ] CLAUDE.md has new "First-Time Setup" section
- [ ] CLAUDE.md has new "Password Recovery" section
- [ ] Old "First user registration" line updated to reference new section
- [ ] Documentation tested by following steps exactly
- [ ] Types pass: `pnpm type-check`

---

## Testing Strategy

**No automated tests required** - this is a documentation and UX improvement.

**Manual verification for Commit 1:**
1. Fresh database setup:
   - `docker compose -p vacay-dev down -v` (clear volumes)
   - `pnpm dev:docker`
   - `cd api && pnpm seed`
   - Verify admin user created
   - Login with admin@example.com / changeme123

2. Idempotency test:
   - Run `pnpm seed` again
   - Verify warning message displayed
   - Verify login still works with same password

3. Post-registration safety:
   - `docker compose -p vacay-dev down -v`
   - `pnpm dev:docker`
   - Register manually at /register with test@example.com / mypassword123
   - Run `pnpm seed`
   - Verify warning displayed
   - Verify login works with original password (not overwritten)

**Manual verification for Commit 2:**
1. Follow "First-Time Setup" Option A exactly
2. Follow "First-Time Setup" Option B exactly
3. Test password recovery:
   - Register user or use seed
   - Run `cd api && pnpm reset-password`
   - Reset password interactively
   - Verify login works with new password

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Seed script tested (fresh db + idempotent + post-registration)
- [ ] Password reset script tested
- [ ] Documentation verified by following exact steps
- [ ] Type check passes (`pnpm type-check`)
- [ ] No test failures (`pnpm test` - existing tests should still pass)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing workflows | Seed script change is backward compatible - only affects conflict behavior |
| Users don't find new docs | Added package.json alias for discoverability |
| Confusion about which setup to use | Clear "Choose ONE" language in docs |

## Open Questions

None - scope is well-defined. This is a documentation and developer UX improvement, not a technical fix.

## Notes

**Why this happened:**
- Research initially focused on database persistence (red herring)
- Actual issue was UX/documentation (seed script behavior not obvious)
- Script already exists (`set-password.ts`) but not discoverable

**Key insight:**
Database was working correctly all along. The "lost password" issue was actually:
1. Seed script silently overwriting passwords
2. No documented way to recover forgotten passwords
3. Poor discoverability of existing password reset tool
