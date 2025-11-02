# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## shadcn-vue Component System

**CRITICAL: Always use shadcn-vue components first!** This project uses shadcn-vue for UI components.

### Philosophy
- **Copy-paste, not a package** - Components live in `src/components/ui/`
- **Full ownership** - Customize any component directly in the codebase
- **Tailwind CSS** - Built on CSS variables for seamless theming
- **Accessible** - ARIA-compliant, keyboard navigation, focus management

### Adding Components
```bash
# Add a component
pnpm dlx shadcn-vue@latest add button

# Add multiple components
pnpm dlx shadcn-vue@latest add card dialog sheet
```

### Available Components
**Installed:** Button, Card, Badge, Skeleton, Sheet, Dialog, Separator, Progress, Avatar, DropdownMenu

**Not yet installed:** Alert, Toast, Tabs, Table, Input, Label, Select, Checkbox, etc.

### Component Usage Pattern
```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>My Card</CardTitle>
    </CardHeader>
    <CardContent>
      <Button>Click me</Button>
    </CardContent>
  </Card>
</template>
```

### Theme System
- CSS variables in `src/assets/main.css` (`:root` and `.dark`)
- Semantic tokens: `--background`, `--foreground`, `--primary`, `--muted`, etc.
- Dark mode: Uses existing `useDarkMode` composable with class strategy
- Theme configured in `components.json` (New York style, Slate base)

### Layout Components
- **MainLayout** - Full navigation header for Home/Admin pages
- **TripLayout** - Immersive view with floating Sheet menu for Trip pages

### When NOT to use shadcn
- Map components (Leaflet) - keep as-is
- EXIF/GPS utilities - pure logic functions
- Supabase/Cloudinary clients - external services

## Development Commands

All commands should be run from the **root directory** (not `app/`):

```bash
# Development
pnpm dev              # Start dev server at http://localhost:5173
pnpm build            # Production build (runs TypeScript check first)
pnpm preview          # Preview production build

# Code Quality
pnpm lint             # ESLint with auto-fix
pnpm format           # Prettier formatting
pnpm type-check       # TypeScript type checking without emit
pnpm test             # Run Vitest tests

# Database
# Run SQL migrations in Supabase dashboard SQL editor
# See app/supabase-rls-fix.sql for RLS policies
```

## Git Workflow

**Use atomic commits and feature branches for each issue:**

```bash
# Start work on an issue
git checkout -b feature/issue-5-dark-mode-testing  # Branch name: feature/issue-{number}-{brief-description}

# Make focused, atomic commits
git add -A
git commit -m "feat: add dark mode store with localStorage persistence

- Create useDarkMode composable
- Detect system preference on mount
- Save user preference to localStorage

Implements #5"

# When issue is complete, push and create PR
git push origin feature/issue-5-dark-mode-testing
gh pr create --title "feat: Dark mode testing (#5)" --body "Closes #5"

# Merge and delete branch after PR approval
```

**Commit Message Guidelines:**
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Reference issue number in commit body: `Implements #5` or `Closes #5`
- Keep commits atomic (one logical change per commit)
- Add Claude Code attribution footer for AI-assisted work:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

## Architecture Overview

### Data Flow

**Photo Upload Flow:**
```
User selects photos → extractExif() extracts GPS/metadata → uploadToCloudinary()
→ createTrip() in database → createPhotos() with GPS coordinates → redirect to trip view
```

**Trip Display Flow:**
```
Load trip by slug → getTripBySlug() fetches trip + photos → TripView renders map with markers
→ Leaflet displays photos at GPS coordinates → Photo viewer on click
```

### Key Architectural Patterns

**1. EXIF/GPS Extraction (Critical!)**
- Location: `app/src/utils/exif.ts`
- **Must have `xmp: true`** - iOS and edited photos store GPS in XMP format, not standard EXIF
- Without XMP enabled, GPS extraction fails on ~95% of iPhone photos
- Uses `exifr` library which auto-converts DMS coordinates to decimal degrees
- Validates coordinates: range checks, null island (0,0) detection

**2. Supabase Integration**
- Client: `app/src/lib/supabase.ts` - initialized with anon key
- Types: `app/src/lib/database.types.ts` - generated from Supabase schema
- Database functions: `app/src/utils/database.ts`
  - Type assertions required due to Supabase v2.39 type inference limitations
  - Pattern: `as unknown as never` for inserts, explicit types for reads
- RLS policies control data access (see `app/supabase-rls-fix.sql`)

**3. Cloudinary Image Handling**
- Client: `app/src/lib/cloudinary.ts`
- **Upload happens BEFORE EXIF extraction is saved** - EXIF is extracted client-side first
- Original images preserve EXIF metadata automatically
- Thumbnails strip metadata (expected behavior for transformations)
- Uses unsigned upload preset (configured in Cloudinary dashboard)

**4. Vue Router Structure**
```typescript
/ (HomeView)           - List all public trips
/admin (AdminView)     - Upload new trips (will require auth in future)
/trip/:slug (TripView) - View single trip with map and photos
```
- Route guards exist but are placeholders (auth not implemented yet)
- All routes lazy-loaded except HomeView

### Database Schema

**Current Tables:**
```sql
trips (id, title, description, slug, is_public, cover_photo_url, created_at, updated_at)
photos (id, trip_id, url, thumbnail_url, latitude, longitude, taken_at, caption, cloudinary_public_id)
```

**Upcoming Tables (from PROJECT_ROADMAP.md):**
```sql
user_profiles (id→auth.users, display_name, invited_by, is_admin, created_at)
photo_comments (id, photo_id, user_id, comment, created_at, updated_at)
invites (id, email, invited_by, used, created_at, expires_at)
```

### State Management

**Current:** No Pinia stores yet (planned for auth in Milestone 2)

**Upcoming (from roadmap):**
- Dark mode store/composable (Milestone 1)
- Auth store (Milestone 2)
- Uses Vue 3 Composition API with `<script setup>`

### Important Gotchas

**GPS Extraction:**
- Always enable `xmp: true` in exifr options
- Cloudinary is NOT involved in GPS extraction (happens before upload)
- GPS validation: check ranges and null island (0,0)

**Supabase Types:**
- Use type helpers: `TablesInsert<'trips'>`, `TablesRow<'photos'>`, etc.
- Type assertions needed for inserts: `as unknown as never`
- Example in `database.ts` shows the pattern

**Route Meta:**
- `requiresAuth` is set but not enforced yet
- Auth guard at `router/index.ts:27` is a TODO

**Photo Display:**
- Photos without GPS show yellow warning icon
- Map only displays photos with valid lat/lng
- Route line connects photos chronologically

## Project Roadmap Context

Active development follows milestones tracked in GitHub Issues and PROJECT_ROADMAP.md:

**Milestone 1 (Due Jan 9):** Dark mode with system preference + toggle
- Issues #1-5: Dark mode store, Tailwind config, component styles, toggle UI, testing

**Milestone 2 (Due Jan 16):** WebAuthn auth + invite-only registration
- Issues #6-11: Supabase Auth setup, user schema, login/register views, auth store, header button

**Milestone 3 (Due Jan 23):** Comments system (public read, auth write)
- Issues #12-16: Comments schema, CommentList/Form/Item components, photo viewer integration

**Milestone 4 (Due Jan 30):** Admin invite management + UI polish
- Issues #17-22: Invites schema, admin UI, registration flow, route protection, polish, testing

**GitHub Links:**
- Project Board: https://github.com/users/joeczar/projects/5
- All Issues: https://github.com/joeczar/vacay-photo-map/issues
- Milestones: https://github.com/joeczar/vacay-photo-map/milestones

Each issue contains detailed task lists, acceptance criteria, and code examples (especially database schemas).

## Environment Variables

Required in `app/.env`:
```
VITE_SUPABASE_URL           # Supabase project URL
VITE_SUPABASE_ANON_KEY      # Supabase anon key
VITE_CLOUDINARY_CLOUD_NAME  # Cloudinary cloud name
VITE_CLOUDINARY_UPLOAD_PRESET # Unsigned upload preset
```

## File Organization Conventions

- **Views** (`app/src/views/`): Full page components with routing
- **Components** (`app/src/components/`): Reusable UI components (will be created)
- **Utils** (`app/src/utils/`): Pure functions (EXIF, database, etc.)
- **Lib** (`app/src/lib/`): External service clients (Supabase, Cloudinary)
- **Stores** (`app/src/stores/`): Pinia stores (not yet created)
- **Composables** (`app/src/composables/`): Vue composables (not yet created)

## Common Tasks

**Add new database table:**
1. Update `app/src/lib/database.types.ts` with new table types
2. Create migration SQL in `app/supabase-rls-fix.sql` or new file
3. Run SQL in Supabase dashboard
4. Add RLS policies
5. Create database functions in `app/src/utils/database.ts`

**Add authentication:**
- Follow Milestone 2 in PROJECT_ROADMAP.md
- Use `@simplewebauthn/browser` for WebAuthn
- Create auth store/composable
- Update route guard in `router/index.ts`

**Debug GPS extraction:**
- Check browser console for EXIF extraction logs (emoji prefixed)
- Verify `xmp: true` is set in exifr options
- Test with `exifr.gps(file)` directly for faster debugging
- Remember: 95% of photos should have GPS if taken with location services on
