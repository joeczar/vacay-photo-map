# Vacay Photo Map - Project Roadmap

## Overview
This document outlines the development roadmap for adding dark mode, authentication, and comments to the Vacay Photo Map application.

## Project Links
- **GitHub Project Board**: https://github.com/users/joeczar/projects/5
- **Repository**: https://github.com/joeczar/vacay-photo-map
- **Issues**: https://github.com/joeczar/vacay-photo-map/issues

## Milestones

### Milestone 1: Dark Mode
**Due Date**: January 9, 2025
**Issues**: #1-5 (5 issues)

Implement dark mode with system preference detection and user toggle.

**Key Features:**
- Dark mode store/composable with localStorage persistence
- Tailwind dark mode configuration
- Dark mode styles across all components
- Theme toggle UI component in header
- System preference detection

---

### Milestone 2: Authentication & WebAuthn
**Due Date**: January 16, 2025
**Issues**: #6-11 (6 issues)

Implement invite-only WebAuthn authentication system.

**Key Features:**
- Supabase Auth setup with WebAuthn/Passkey
- User profiles database schema
- Login and registration views
- Auth state management
- Header auth button with user menu
- Invite-only registration flow

**Database Schema:**
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  invited_by UUID REFERENCES auth.users(id),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Milestone 3: Comments System
**Due Date**: January 23, 2025
**Issues**: #12-16 (5 issues)

Add photo comments visible to all, postable by authenticated users.

**Key Features:**
- Comments database schema with RLS policies
- CommentList, CommentForm, and CommentItem components
- Integration into photo viewer
- Comment counts on thumbnails
- Edit/delete for own comments

**Database Schema:**
```sql
CREATE TABLE photo_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**RLS Policies:**
- Everyone can read comments
- Only authenticated users can create
- Users can edit/delete own comments

---

### Milestone 4: Invite System & Polish
**Due Date**: January 30, 2025
**Issues**: #17-22 (6 issues)

Admin invite management and UI polish.

**Key Features:**
- Invites database schema
- Admin invite management UI
- Invite registration flow
- Admin-only route protection
- Quick UI improvements from review
- Testing and bug fixes

**Database Schema:**
```sql
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);
```

**Polish Items:**
- Fix title repetition on home page
- Add loading spinners
- Improve "no location" warning visibility
- Add hover effects to photos
- Better photo grid layout

---

## Labels

- `dark-mode` - Dark mode related
- `authentication` - Auth related
- `comments` - Comments system
- `admin` - Admin features
- `polish` - UI/UX improvements
- `database` - Database schema changes

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@simplewebauthn/browser": "^9.0.0",
    "pinia": "^2.1.7"
  }
}
```

---

## Implementation Strategy

### Week 1: Dark Mode Foundation
Focus on Milestone 1 - Get dark mode working perfectly before moving to authentication.

### Week 2: Authentication Core
Set up Supabase Auth, create database schemas, and build login/register flows.

### Week 3: Comments System
Build comment functionality on top of the authentication system.

### Week 4: Invites & Polish
Complete the invite-only system and polish the UI.

---

## Success Criteria

### Dark Mode
- [x] Toggle works across all pages
- [x] System preference detected
- [x] User preference persists
- [x] All components readable in both modes

### Authentication
- [ ] Users can register with valid invite
- [ ] WebAuthn/Passkey login works
- [ ] Email magic link fallback works
- [ ] Auth state persists across sessions
- [ ] Admin users can manage system

### Comments
- [ ] Anyone can read comments
- [ ] Authenticated users can comment
- [ ] Users can edit/delete own comments
- [ ] Comments display in photo viewer
- [ ] Comment counts visible

### Invites & Admin
- [ ] Admins can create invites
- [ ] Invite links work correctly
- [ ] Used/expired invites handled properly
- [ ] Admin-only routes protected
- [ ] UI polished and professional

---

## Notes

- **Invite-Only System**: Only users with valid invite codes can register
- **WebAuthn**: Passkey authentication with email magic link fallback
- **Comment Visibility**: Everyone can see comments, only logged-in users can post
- **Admin Control**: First user (you) is admin, can invite others and manage system

---

**Last Updated**: November 2, 2025
