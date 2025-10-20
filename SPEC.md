# Vacay Photo Map - MVP Specification

## Project Overview

A web application for viewing vacation photos on an interactive map with timeline visualization. Users can share trips via password-protected links. Single admin can upload and manage trips via WebAuthn authentication.

**Repository**: Monorepo structure
**Deployment**: Netlify
**Target**: Claude Code implementation using GitHub CLI for project setup

---

## Tech Stack

### Frontend
- Vue 3 (Composition API)
- Vite
- Vue Router
- Pinia (state management)
- TailwindCSS
- Leaflet + vue3-leaflet
- exifr (EXIF extraction)

### Backend & Services
- Supabase (database, auth)
- Cloudinary (image storage & CDN)
- Netlify (hosting)

### Development Tools
- TypeScript
- ESLint + Prettier
- Vitest (testing)

---

## Repository Structure

```
vacay-photo-map/
├── app/                          # Vue application
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   ├── stores/
│   │   ├── composables/
│   │   ├── utils/
│   │   ├── router/
│   │   └── assets/
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── netlify/
│   └── functions/              # Netlify Functions (if needed)
├── .github/
│   └── workflows/
│       └── deploy.yml
├── README.md
└── package.json                # Root package.json for monorepo scripts
```

---

## GitHub Project Setup Commands

### Create Repository and Project
```bash
# Create repository
gh repo create vacay-photo-map --public --clone

# Create GitHub Project
gh project create --owner @me --title "Vacay Photo Map MVP"

# Get project number (save for later use)
gh project list --owner @me
```

---

## Milestones & Issues

### Milestone 1: Project Setup & Infrastructure
**Goal**: Set up development environment, dependencies, and basic configuration

#### Issue 1.1: Initialize Monorepo Structure
**Labels**: `setup`, `infrastructure`
**Tasks**:
- [ ] Create monorepo folder structure
- [ ] Initialize root package.json with workspace configuration
- [ ] Set up Vite + Vue 3 + TypeScript in `/app`
- [ ] Configure TailwindCSS
- [ ] Set up ESLint + Prettier
- [ ] Add .gitignore and .env.example
- [ ] Create README with setup instructions

**Acceptance Criteria**:
- `npm install` works from root
- `npm run dev` starts Vue dev server
- TailwindCSS styling works
- TypeScript compilation works

---

#### Issue 1.2: Configure Supabase
**Labels**: `setup`, `backend`, `database`
**Tasks**:
- [ ] Create Supabase project
- [ ] Install @supabase/supabase-js
- [ ] Create `/app/src/lib/supabase.ts` with client configuration
- [ ] Set up environment variables for Supabase URL and anon key
- [ ] Create database schema (migrations in Milestone 2)

**Acceptance Criteria**:
- Supabase client initializes successfully
- Environment variables properly configured
- Connection test passes

---

#### Issue 1.3: Configure Cloudinary
**Labels**: `setup`, `backend`, `storage`
**Tasks**:
- [ ] Create Cloudinary account
- [ ] Install cloudinary package
- [ ] Create `/app/src/lib/cloudinary.ts` with unsigned upload configuration
- [ ] Set up unsigned upload preset in Cloudinary dashboard
- [ ] Configure environment variables for cloud name and upload preset

**Acceptance Criteria**:
- Can initialize Cloudinary client
- Unsigned upload preset configured
- Environment variables set

---

#### Issue 1.4: Set up Netlify Deployment
**Labels**: `setup`, `deployment`
**Tasks**:
- [ ] Create netlify.toml configuration
- [ ] Configure build settings for Vue app
- [ ] Set up environment variables in Netlify dashboard
- [ ] Create GitHub Actions workflow for deployment
- [ ] Configure custom domain (optional)

**Acceptance Criteria**:
- App deploys successfully to Netlify
- Environment variables accessible in production
- HTTPS enabled

---

### Milestone 2: Database Schema & Authentication
**Goal**: Create database structure and implement authentication system

#### Issue 2.1: Design and Implement Database Schema
**Labels**: `database`, `backend`
**Tasks**:
- [ ] Create trips table with schema
- [ ] Create photos table with schema
- [ ] Create trip_passwords table for password protection
- [ ] Set up Row Level Security (RLS) policies
- [ ] Create database indexes for performance
- [ ] Write Supabase migration files

**Database Schema**:

```sql
-- trips table
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_public BOOLEAN DEFAULT false,
  slug TEXT UNIQUE NOT NULL
);

-- photos table
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  cloudinary_public_id TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  taken_at TIMESTAMPTZ NOT NULL,
  caption TEXT,
  album TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- trip_passwords table
CREATE TABLE trip_passwords (
  trip_id UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_photos_trip_id ON photos(trip_id);
CREATE INDEX idx_photos_taken_at ON photos(taken_at);
CREATE INDEX idx_trips_slug ON trips(slug);
```

**Acceptance Criteria**:
- All tables created successfully
- RLS policies prevent unauthorized access
- Indexes improve query performance
- Migration can be run and rolled back

---

#### Issue 2.2: Implement WebAuthn Admin Authentication
**Labels**: `auth`, `security`, `admin`
**Tasks**:
- [ ] Install @simplewebauthn/browser and @simplewebauthn/server
- [ ] Create admin_credentials table in Supabase for WebAuthn credentials
- [ ] Build registration flow UI component
- [ ] Build authentication flow UI component
- [ ] Create Netlify Function for WebAuthn verification
- [ ] Implement session management (JWT or Supabase auth)
- [ ] Add auth guard for admin routes

**Admin Credentials Schema**:
```sql
CREATE TABLE admin_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Acceptance Criteria**:
- Admin can register WebAuthn credential
- Admin can login with WebAuthn
- Session persists across page reloads
- Unauthorized users cannot access admin routes
- Works on Chrome, Firefox, Safari

---

#### Issue 2.3: Implement Trip Password Protection
**Labels**: `auth`, `security`, `feature`
**Tasks**:
- [ ] Create password verification utility function
- [ ] Build password prompt UI component (modal/page)
- [ ] Hash passwords using bcrypt or Web Crypto API
- [ ] Store password access in sessionStorage
- [ ] Create middleware to check password access
- [ ] Add UI to set password when creating trip (admin only)

**Acceptance Criteria**:
- Users prompted for password on protected trips
- Correct password grants access for session
- Incorrect password shows error message
- Password hashed before storage
- Admin can set/change trip password

---

### Milestone 3: Photo Upload System
**Goal**: Build complete photo upload workflow with EXIF extraction

#### Issue 3.1: Create Upload UI Components
**Labels**: `feature`, `upload`, `ui`
**Tasks**:
- [ ] Build AdminLayout component with navigation
- [ ] Create UploadView page component
- [ ] Build file input component with drag-and-drop
- [ ] Create image preview grid component
- [ ] Build upload progress indicator
- [ ] Add form for trip metadata (title, description, slug)

**Acceptance Criteria**:
- Can select multiple image files
- Drag and drop works
- Shows image previews before upload
- Displays upload progress
- Form validation works

---

#### Issue 3.2: Implement EXIF Extraction
**Labels**: `feature`, `upload`, `backend`
**Tasks**:
- [ ] Install exifr library
- [ ] Create EXIF extraction utility function
- [ ] Extract GPS coordinates (latitude, longitude)
- [ ] Extract timestamp (DateTimeOriginal)
- [ ] Handle missing EXIF data gracefully
- [ ] Create data validation functions
- [ ] Add user feedback for photos without location data

**EXIF Extraction Function**:
```typescript
interface PhotoMetadata {
  latitude?: number;
  longitude?: number;
  takenAt?: Date;
  make?: string;
  model?: string;
}

async function extractExif(file: File): Promise<PhotoMetadata>
```

**Acceptance Criteria**:
- Extracts GPS coordinates when available
- Extracts timestamp accurately
- Handles photos without EXIF data
- Shows warning for photos missing location
- Works in all major browsers

---

#### Issue 3.3: Implement Cloudinary Upload
**Labels**: `feature`, `upload`, `backend`
**Tasks**:
- [ ] Create Cloudinary upload utility function
- [ ] Implement unsigned upload to Cloudinary
- [ ] Generate thumbnail transformations
- [ ] Handle upload errors and retries
- [ ] Implement batch upload with concurrency control
- [ ] Store Cloudinary public IDs and URLs

**Upload Function Signature**:
```typescript
interface UploadResult {
  publicId: string;
  url: string;
  thumbnailUrl: string;
}

async function uploadToCloudinary(
  file: File, 
  onProgress: (percent: number) => void
): Promise<UploadResult>
```

**Acceptance Criteria**:
- Photos upload successfully to Cloudinary
- Thumbnails generated automatically
- Upload progress tracked accurately
- Errors handled gracefully with retry logic
- Returns URLs and public IDs

---

#### Issue 3.4: Save Trip and Photos to Database
**Labels**: `feature`, `upload`, `database`
**Tasks**:
- [ ] Create trip creation API utility
- [ ] Create photo batch insert API utility
- [ ] Implement transaction for trip + photos creation
- [ ] Generate unique slug from trip title
- [ ] Set cover photo (first photo with location)
- [ ] Validate all data before insertion
- [ ] Handle database errors

**Acceptance Criteria**:
- Trip created with metadata
- All photos inserted with EXIF data
- Transaction rolls back on error
- Unique slug generated
- Cover photo set automatically

---

#### Issue 3.5: Complete Upload Flow Integration
**Labels**: `feature`, `upload`, `integration`
**Tasks**:
- [ ] Wire up all upload components
- [ ] Implement multi-step upload process
- [ ] Show success message with trip URL
- [ ] Add option to upload more photos to existing trip
- [ ] Implement cancel upload functionality
- [ ] Add loading states throughout flow

**Upload Flow Steps**:
1. Admin login (WebAuthn)
2. Select photos (file picker or drag-drop)
3. Extract EXIF from all photos
4. Enter trip metadata
5. Upload photos to Cloudinary (with progress)
6. Save trip and photos to Supabase
7. Show success with shareable link

**Acceptance Criteria**:
- Complete upload flow works end-to-end
- User receives immediate feedback at each step
- Can cancel upload at any point
- Success shows shareable trip URL
- All error cases handled gracefully

---

### Milestone 4: Map View & Photo Display
**Goal**: Display trips on interactive map with photo markers

#### Issue 4.1: Set up Leaflet Map
**Labels**: `feature`, `map`, `ui`
**Tasks**:
- [ ] Install leaflet and vue3-leaflet
- [ ] Create MapView component
- [ ] Configure map with OpenStreetMap tiles
- [ ] Set initial view and zoom based on photo locations
- [ ] Add map controls (zoom, fullscreen)
- [ ] Make map responsive

**Acceptance Criteria**:
- Map renders correctly
- Map centers on photo locations
- Zoom controls work
- Responsive on mobile devices
- Uses free tile provider

---

#### Issue 4.2: Implement Photo Markers
**Labels**: `feature`, `map`, `ui`
**Tasks**:
- [ ] Create custom marker component
- [ ] Place markers at photo GPS coordinates
- [ ] Implement marker clustering for dense areas
- [ ] Add marker icons (camera or thumbnail)
- [ ] Handle photos without location data
- [ ] Optimize marker rendering for performance

**Acceptance Criteria**:
- Markers appear at correct locations
- Markers cluster when zoomed out
- Custom marker styling applied
- Click marker to select photo
- Performance good with 100+ photos

---

#### Issue 4.3: Build Photo Lightbox
**Labels**: `feature`, `ui`, `gallery`
**Tasks**:
- [ ] Create Lightbox component for full-size photo viewing
- [ ] Implement image lazy loading
- [ ] Add navigation (prev/next)
- [ ] Show photo metadata (date, location, caption)
- [ ] Add keyboard shortcuts (arrows, escape)
- [ ] Make lightbox mobile-friendly with swipe gestures

**Acceptance Criteria**:
- Opens when marker clicked
- Shows full-resolution photo
- Navigate between photos easily
- Displays metadata
- Closes on escape or backdrop click
- Touch gestures work on mobile

---

#### Issue 4.4: Create Trip Detail Page
**Labels**: `feature`, `ui`, `page`
**Tasks**:
- [ ] Create TripView component
- [ ] Fetch trip data by slug from Supabase
- [ ] Display trip header (title, description, cover photo)
- [ ] Show trip statistics (photo count, date range, locations)
- [ ] Integrate MapView with trip photos
- [ ] Add loading and error states
- [ ] Implement password check (if protected)

**Trip Header Design**:
- Hero section with cover photo
- Trip title and description
- Date range of trip
- Number of photos
- Number of locations visited

**Acceptance Criteria**:
- Trip loads by slug from URL
- Shows trip metadata
- Map displays with photo markers
- 404 for non-existent trips
- Password prompt for protected trips
- Loading states during data fetch

---

#### Issue 4.5: Implement Trip List/Home Page
**Labels**: `feature`, `ui`, `page`
**Tasks**:
- [ ] Create HomeView component
- [ ] Fetch all public trips from Supabase
- [ ] Display trip cards with cover photo
- [ ] Add trip metadata (title, date, photo count)
- [ ] Implement responsive grid layout
- [ ] Add search/filter functionality (optional for MVP)

**Acceptance Criteria**:
- Shows all public trips
- Trip cards are clickable
- Responsive grid layout
- Shows trip preview information
- Loads efficiently

---

### Milestone 5: Timeline Feature
**Goal**: Add chronological timeline view for trip photos

#### Issue 5.1: Create Timeline Component
**Labels**: `feature`, `timeline`, `ui`
**Tasks**:
- [ ] Design timeline UI layout
- [ ] Create horizontal scrollable timeline
- [ ] Group photos by day
- [ ] Display date markers
- [ ] Show thumbnail for each photo
- [ ] Make timeline scrollable and responsive

**Timeline Design**:
```
[Day 1 - Aug 15] ━━━━ [Day 2 - Aug 16] ━━━━ [Day 3 - Aug 17]
    📷 📷 📷           📷 📷 📷 📷           📷 📷
```

**Acceptance Criteria**:
- Photos grouped by day
- Horizontal scrollable layout
- Date labels visible
- Thumbnails clickable
- Works on mobile with touch scroll

---

#### Issue 5.2: Sync Timeline with Map
**Labels**: `feature`, `timeline`, `integration`
**Tasks**:
- [ ] Implement state management for selected photo
- [ ] Click timeline photo → map centers on location
- [ ] Click map marker → timeline scrolls to photo
- [ ] Highlight selected photo in both views
- [ ] Add smooth scroll/pan animations

**Acceptance Criteria**:
- Timeline and map stay in sync
- Clicking photo centers map
- Clicking marker highlights timeline photo
- Smooth animations between views
- State managed properly

---

#### Issue 5.3: Add Timeline Playback Mode
**Labels**: `feature`, `timeline`, `enhancement`
**Tasks**:
- [ ] Add play button to timeline
- [ ] Implement auto-advance through photos
- [ ] Adjust playback speed control
- [ ] Pause/resume functionality
- [ ] Auto-pan map during playback
- [ ] Loop option

**Acceptance Criteria**:
- Play button starts timeline animation
- Map follows timeline playback
- Speed adjustable
- Can pause and resume
- Smooth experience

---

#### Issue 5.4: Integrate Timeline into Trip View
**Labels**: `feature`, `timeline`, `integration`
**Tasks**:
- [ ] Add timeline below map in TripView
- [ ] Create toggle between map-only and map+timeline views
- [ ] Ensure responsive layout with timeline
- [ ] Add collapse/expand timeline functionality
- [ ] Persist timeline state in URL or sessionStorage

**Acceptance Criteria**:
- Timeline appears below map
- Can toggle timeline visibility
- Layout responsive with timeline
- Timeline state persists
- Good UX on mobile

---

### Milestone 6: Polish & Deployment
**Goal**: Final polish, testing, and production deployment

#### Issue 6.1: Implement Route Planning
**Labels**: `feature`, `map`, `enhancement`
**Tasks**:
- [ ] Draw lines connecting photos chronologically
- [ ] Use OpenRouteService API for actual routes (optional)
- [ ] Add route distance calculations
- [ ] Color-code route by day
- [ ] Make route toggleable on/off

**Acceptance Criteria**:
- Lines connect photos in time order
- Route visible on map
- Can toggle route visibility
- Route color indicates time progression

---

#### Issue 6.2: Add Sharing Features
**Labels**: `feature`, `sharing`, `ui`
**Tasks**:
- [ ] Create share button with copy link functionality
- [ ] Generate Open Graph meta tags for social sharing
- [ ] Add embed code generator (iframe)
- [ ] Create QR code for trip URL
- [ ] Add social media share buttons (optional)

**Acceptance Criteria**:
- Copy link button works
- Social media previews look good
- Embed code generated
- QR code displays correctly

---

#### Issue 6.3: Performance Optimization
**Labels**: `optimization`, `performance`
**Tasks**:
- [ ] Implement lazy loading for photos
- [ ] Optimize Cloudinary transformations
- [ ] Add service worker for caching (optional)
- [ ] Minimize bundle size (code splitting)
- [ ] Optimize database queries
- [ ] Add image preloading for lightbox navigation

**Acceptance Criteria**:
- Lighthouse score > 90
- Fast initial page load
- Smooth photo navigation
- Efficient data fetching
- Good performance on mobile

---

#### Issue 6.4: Error Handling & Edge Cases
**Labels**: `bug`, `testing`, `polish`
**Tasks**:
- [ ] Add global error boundary
- [ ] Handle network errors gracefully
- [ ] Show user-friendly error messages
- [ ] Add retry logic for failed requests
- [ ] Handle photos without GPS data
- [ ] Test with large trips (500+ photos)

**Acceptance Criteria**:
- No uncaught errors
- Graceful degradation
- Clear error messages
- Retry works for transient failures
- Handles edge cases

---

#### Issue 6.5: Testing & Documentation
**Labels**: `testing`, `documentation`
**Tasks**:
- [ ] Write unit tests for utility functions
- [ ] Write integration tests for upload flow
- [ ] Write E2E tests for critical paths
- [ ] Update README with deployment instructions
- [ ] Document environment variables
- [ ] Create user guide for uploading trips

**Test Coverage Goals**:
- Utils: 80%+
- Components: 60%+
- Critical flows: 100%

**Acceptance Criteria**:
- Tests pass
- README complete
- Environment variables documented
- User guide written

---

#### Issue 6.6: Final Production Deployment
**Labels**: `deployment`, `production`
**Tasks**:
- [ ] Run full test suite
- [ ] Verify environment variables in Netlify
- [ ] Test WebAuthn in production
- [ ] Verify Cloudinary uploads work
- [ ] Test password protection
- [ ] Set up monitoring/error tracking (optional)
- [ ] Create backup strategy for database

**Acceptance Criteria**:
- App deployed to production
- All features work in production
- WebAuthn works in production
- No console errors
- Performance acceptable
- Backup strategy in place

---

## Future Enhancements (Post-MVP)

**Note to Claude Code**: These are NOT part of MVP but good to document for future reference

### Phase 2 Features
- [ ] Multiple admin accounts
- [ ] Passwordless authentication (magic link) for viewers to comment
- [ ] Photo comments and reactions
- [ ] Album/folder organization within trips
- [ ] Download entire trip as ZIP
- [ ] Search across all trips
- [ ] Advanced filters (date range, location, albums)
- [ ] Trip collaboration (multiple uploaders)
- [ ] Private vs public trip settings
- [ ] Analytics (view counts, popular photos)

### Technical Improvements
- [ ] Progressive Web App (PWA) with offline support
- [ ] Real-time collaboration using Supabase Realtime
- [ ] Server-side rendering with Nuxt 3
- [ ] Image optimization pipeline
- [ ] Multi-language support (i18n)
- [ ] Dark mode
- [ ] Accessibility audit and improvements

---

## Environment Variables

Create `.env` file in `/app` directory:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Cloudinary
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset

# App
VITE_APP_URL=http://localhost:5173
```

For Netlify production, set these in Netlify dashboard.

---

## Success Criteria

**MVP is complete when**:
1. ✅ Admin can login with WebAuthn
2. ✅ Admin can upload photos with automatic EXIF extraction
3. ✅ Trip is created with metadata and photos
4. ✅ Trip page shows map with photo markers
5. ✅ Clicking marker opens photo in lightbox
6. ✅ Timeline view shows photos chronologically
7. ✅ Timeline and map stay synchronized
8. ✅ Trip can be password protected
9. ✅ Visitors can view trip with password
10. ✅ Trip is shareable via URL
11. ✅ App is deployed on Netlify
12. ✅ Responsive design works on mobile

---

## GitHub CLI Commands for Project Setup

```bash
# Create all milestones
gh api graphql -f query='
  mutation {
    createProjectV2(input: {ownerId: "YOUR_OWNER_ID", title: "Vacay Photo Map MVP"}) {
      projectV2 { id }
    }
  }
'

# Create milestone 1
gh api repos/:owner/:repo/milestones -f title="Project Setup & Infrastructure" -f description="Set up development environment, dependencies, and basic configuration"

# Create milestone 2
gh api repos/:owner/:repo/milestones -f title="Database Schema & Authentication" -f description="Create database structure and implement authentication system"

# Create milestone 3
gh api repos/:owner/:repo/milestones -f title="Photo Upload System" -f description="Build complete photo upload workflow with EXIF extraction"

# Create milestone 4
gh api repos/:owner/:repo/milestones -f title="Map View & Photo Display" -f description="Display trips on interactive map with photo markers"

# Create milestone 5
gh api repos/:owner/:repo/milestones -f title="Timeline Feature" -f description="Add chronological timeline view for trip photos"

# Create milestone 6
gh api repos/:owner/:repo/milestones -f title="Polish & Deployment" -f description="Final polish, testing, and production deployment"

# Create issues (example for Issue 1.1)
gh issue create \
  --title "Initialize Monorepo Structure" \
  --body "$(cat <<EOF
**Tasks**:
- [ ] Create monorepo folder structure
- [ ] Initialize root package.json with workspace configuration
- [ ] Set up Vite + Vue 3 + TypeScript in /app
- [ ] Configure TailwindCSS
- [ ] Set up ESLint + Prettier
- [ ] Add .gitignore and .env.example
- [ ] Create README with setup instructions

**Acceptance Criteria**:
- npm install works from root
- npm run dev starts Vue dev server
- TailwindCSS styling works
- TypeScript compilation works
EOF
)" \
  --label "setup,infrastructure" \
  --milestone 1

# Repeat for all issues...
```

---

## Getting Started for Claude Code

1. **Create the GitHub repository and project**:
   ```bash
   gh repo create vacay-photo-map --public --clone
   cd vacay-photo-map
   ```

2. **Create milestones using the GitHub API**

3. **Create all issues with proper labels and milestone assignments**

4. **Begin with Milestone 1, Issue 1.1**: Initialize Monorepo Structure

5. **After each issue completion**: Close issue and move to next in sequence

---

## Notes for Claude Code

- Each issue should be completed in order within its milestone
- Run playwright mcp & tests after completing each feature issue
- Commit frequently with descriptive messages
- Reference issue numbers in commits (e.g., "feat: add upload UI #3.1")
- Update README as you go
- Ask for clarification if requirements are ambiguous
- Prioritize working code over perfect code in MVP
- Document any deviations from spec in issue comments

---

**Spec Version**: 1.0
**Last Updated**: 2025-10-20
**Author**: Human + Claude