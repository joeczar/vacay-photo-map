# Implementation Plan: Add rotation to photo types and responses

**Issue:** #122
**Branch:** `feature/issue-122-rotation-types`
**Complexity:** Simple
**Total Commits:** 1

## Overview
Add the `rotation` field to all TypeScript photo types and responses. The database already has the `rotation` column (INTEGER DEFAULT 0, CHECK 0/90/180/270), so this is purely a type system update to surface that field in the API and frontend.

## Prerequisites
- [x] Database `rotation` column exists (lines 75-86 in schema.sql)
- [x] No migration needed - column already in production

## Architecture

### Components
- `api/src/routes/trips.ts` - API route with database types and response transforms
- `app/src/lib/database.types.ts` - Frontend database types (generated schema types)
- `app/src/utils/database.ts` - Frontend API client with transform functions

### Data Flow
```
Database (rotation: INTEGER)
  → DbPhoto interface (rotation: number)
  → PhotoResponse interface (rotation: number)
  → ApiPhotoResponse interface (rotation: number)
  → Frontend Photo type (rotation: number)
```

## Atomic Commits

### Commit 1: feat(types): add rotation field to photo types and responses
**Type:** feat
**Scope:** types
**Files:**
- `api/src/routes/trips.ts` - Modify
- `app/src/lib/database.types.ts` - Modify
- `app/src/utils/database.ts` - Modify

**Changes:**

**File 1: `api/src/routes/trips.ts`**
- Line 29-41: Add `rotation: number` to `DbPhoto` interface (after `album`)
- Line 67-78: Add `rotation: number` to `PhotoResponse` interface (after `album`)
- Line 172-185: In `toPhotoResponse()` function, add `rotation: photo.rotation` to return object (after `album`)
- Line 196-202: In SELECT query, add `rotation` to the column list (after `album`)

**File 2: `app/src/lib/database.types.ts`**
- Line 79-91: Add `rotation: number` to `photos.Row` interface (after `album`)
- Line 92-104: Add `rotation?: number` to `photos.Insert` interface (after `album`, optional)
- Line 105-117: Add `rotation?: number` to `photos.Update` interface (after `album`, optional)

**File 3: `app/src/utils/database.ts`**
- Line 39-51: Add `rotation: number` to `ApiPhotoResponse` interface (after `album`)
- Line 58-66: Add `rotation?: number` to `ApiPhotoInsert` interface (after `caption`, optional)
- Line 69-79: In `transformPhotoToApi()`, add `rotation: photo.rotation ?? 0` to return object (after `caption`)
- Line 100-114: In `transformApiPhoto()`, add `rotation: apiPhoto.rotation` to return object (after `album`)

**Acceptance Criteria:**
- [ ] All TypeScript interfaces include `rotation` field
- [ ] Database SELECT queries include `rotation` column
- [ ] Transform functions map `rotation` correctly
- [ ] Type check passes: `pnpm type-check`
- [ ] No runtime errors (no tests needed - pure type changes)

---

## Testing Strategy

No new tests required - this is a pure type system update. The database column already exists and defaults to 0, so existing tests continue to work.

**Verification:**
1. Type check must pass: `pnpm type-check` (API and app)
2. Build must succeed: `pnpm build` (both projects)
3. Visual inspection of API response in browser dev tools (should show `"rotation": 0` for existing photos)

## Verification Checklist

Before PR creation:
- [ ] Commit completed and reviewed
- [ ] Type check passes in API: `cd api && pnpm type-check`
- [ ] Type check passes in app: `cd app && pnpm type-check`
- [ ] Build succeeds: `pnpm build` (from root)
- [ ] Manual verification: Check API response includes `rotation` field

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking change if rotation field missing | Database has DEFAULT 0 constraint - all rows guaranteed to have value |
| Transform functions out of sync | Type system will catch missing field mappings |
| Frontend expects rotation but API doesn't return it | Single commit ensures all layers updated atomically |

## Open Questions

None - straightforward type update with no behavioral changes.

## Notes

- This is part of parent issue #117 (Photo Rotation)
- Default value is 0 degrees (no rotation)
- Valid values enforced by database CHECK constraint: 0, 90, 180, 270
- Frontend UI to set rotation will be implemented in subsequent issues
