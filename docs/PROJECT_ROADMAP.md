# Vacay Photo Map - Project Roadmap

## Overview
This document tracks the development progress of Vacay Photo Map, a self-hosted photo map application with WebAuthn authentication and Cloudflare R2 storage.

## Project Links
- **GitHub Project Board**: https://github.com/users/joeczar/projects/5
- **Repository**: https://github.com/joeczar/vacay-photo-map
- **Issues**: https://github.com/joeczar/vacay-photo-map/issues

## Current Status

**Latest Version:** 1.0.0 (Core Features Complete)
**Tech Stack:** Vue 3 + Bun + Hono + PostgreSQL + WebAuthn + Cloudflare R2

## Completed Milestones

### Milestone 1: Dark Mode ✅
**Completed**: December 2024

Implemented dark mode with system preference detection and smooth transitions.

**Delivered:**
- Dark mode composable with localStorage persistence
- Tailwind dark mode configuration with CSS variables
- Dark mode styles across all components (map, forms, admin UI)
- Theme toggle in header
- System preference detection on load

---

### Milestone 2: Self-Hosted Backend & Authentication ✅
**Completed**: December 2024

Built self-hosted Bun + Hono API with WebAuthn authentication.

**Delivered:**
- PostgreSQL database with migrations and seeding
- WebAuthn/Passkey authentication (passwordless)
- JWT-based session management
- User profiles and authenticators tables
- Login and registration views
- Protected admin routes
- First-user bootstrap (auto-admin)

**Database Schema:**
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  webauthn_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id),
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  transports TEXT[]
);
```

### Milestone 3: Photo Upload & Storage ✅
**Completed**: December 2024

Implemented photo upload with Cloudflare R2 storage and local fallback.

**Delivered:**
- Self-hosted photo upload endpoint
- Cloudflare R2 integration (S3-compatible)
- Sharp image processing (thumbnails)
- Local filesystem fallback
- Photo serving endpoint (`/api/photos/:key`)
- EXIF extraction with GPS validation
- Draft trip management
- Photo deletion with cleanup

**Technical Details:**
- Multipart/form-data upload handling
- Automatic thumbnail generation (800px wide)
- R2 fallback to local `PHOTOS_DIR`
- Trip drafts (unpublished until finalized)

---

### Milestone 4: Trip Management & Protection ✅
**Completed**: December 2024

Built comprehensive trip management with token-based access control.

**Delivered:**
- Full CRUD operations for trips
- Public/private trip toggle
- Token-protected sharing system
- Admin management UI
- Trip list view
- Trip detail view with map
- Photo grid display
- Cover photo selection
- Slug generation

**Security Features:**
- Bcrypt-hashed access tokens
- Admin bypass for all trips
- Token validation on fetch
- Regenerate token to revoke access

---

## Planned Milestones

### Milestone 5: Admin Spaces MVP
**Status**: Planned
**Target**: Q1 2025
**Issues**: [#117](https://github.com/joeczar/vacay-photo-map/issues/117), [#118](https://github.com/joeczar/vacay-photo-map/issues/118), [#119](https://github.com/joeczar/vacay-photo-map/issues/119)

The admin area reimagined as three distinct "spaces" for different modes of work:

| Space | Purpose | Aesthetic |
|-------|---------|-----------|
| **Gallery** | View collection, manage trips | Photographer's studio — cool, clean |
| **Darkroom** | Process photos — rotate, crop | Darkroom — warm red glow |
| **Workshop** | Design trips — descriptions, sections, themes | Woodworker's bench — warm wood |

**MVP Features:**

*Darkroom:*
- [ ] Photo rotation (metadata + CSS transform)
- [ ] Contact sheet view for batch review

*Workshop:*
- [ ] Photo descriptions/captions
- [ ] Trip sections/chapters
- [ ] Section management UI

**Design Reference:** See `docs/ADMIN_SPACES_DESIGN.md`

---

### Milestone 6: Comments System
**Status**: Planned
**Target**: Q2 2025

Add photo comments visible to all, postable by authenticated users.

**Planned Features:**
- Comments database schema with RLS policies
- Comment display in photo viewer
- Comment form for authenticated users
- Edit/delete for own comments
- Comment counts on photo thumbnails

**Database Schema:**
```sql
CREATE TABLE photo_comments (
  id UUID PRIMARY KEY,
  photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Milestone 7: Invite System
**Status**: Planned
**Target**: Q2 2025

Admin invite management for controlled user registration.

**Planned Features:**
- Invites database schema
- Admin invite management UI
- Invite-based registration flow
- Email invite links
- Expiration handling

**Database Schema:**
```sql
CREATE TABLE invites (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES user_profiles(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Milestone 8: Polish & Enhancements
**Status**: Ongoing

Continuous improvements and refinements.

**Items:**
- Mobile responsiveness improvements
- Loading states and spinners
- Error handling and user feedback
- Performance optimizations
- Accessibility enhancements
- PWA features (offline support)

## Success Criteria

### ✅ Core Features (Complete)
- [x] Dark mode toggle works across all pages
- [x] System preference detected
- [x] User preference persists
- [x] WebAuthn/Passkey authentication works
- [x] Auth state persists across sessions
- [x] Admin routes protected
- [x] First user becomes admin automatically
- [x] Photo upload with R2/local storage
- [x] Trip CRUD operations
- [x] Public/private trip toggle
- [x] Token-protected sharing
- [x] Map view with photo markers
- [x] Photo grid display
- [x] Draft trip management

### 🔄 In Progress
- [ ] Mobile responsiveness optimization
- [ ] Comprehensive test coverage
- [ ] Performance monitoring

### 📋 Planned Features

*Admin Spaces MVP (Milestone 5):*
- [ ] Photo rotation (Darkroom)
- [ ] Photo descriptions (Workshop)
- [ ] Trip sections/chapters (Workshop)

*Future:*
- [ ] Photo comments (Milestone 6)
- [ ] Invite system (Milestone 7)
- [ ] Photo cropping
- [ ] Presentation styles (postcard, polaroid)
- [ ] Trip theming (color schemes)
- [ ] Animated trip playthrough

---

## Technical Debt & Known Issues

### High Priority
- None currently blocking features

### Medium Priority
- Improve error messages for WebAuthn failures
- Add retry logic for R2 uploads
- Optimize thumbnail generation for large batches

### Low Priority
- Refactor auth composable to use Pinia store
- Extract shared trip components
- Add E2E tests with Playwright

---

## Deployment Status

### Production Environment
- **Frontend**: Ready for Netlify deployment
- **API**: Ready for self-hosted deployment
- **Database**: PostgreSQL 15+ required
- **Storage**: R2 recommended, local fallback available

### Environment Requirements
- Bun 1.0+ runtime
- Node 20+ for frontend build
- PostgreSQL 15+ database
- Cloudflare R2 (optional but recommended)

---

## Notes

- **Authentication**: Passwordless WebAuthn only (no email/password fallback)
- **Storage**: R2 is optional - local filesystem works fine for development
- **Admin**: First registered user automatically becomes admin
- **Trip Protection**: Tokens are bcrypt-hashed, secure for sharing
- **Testing**: Comprehensive API test coverage, frontend tests in progress

---

**Last Updated**: December 23, 2025
