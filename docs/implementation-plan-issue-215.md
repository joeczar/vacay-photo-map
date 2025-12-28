# Implementation Plan: Migrate Frontend from Docker/nginx to Vercel

**Issue:** #215
**Branch:** `feature/issue-215-vercel-migration`
**Complexity:** Medium
**Total Commits:** 4 (code changes) + manual verification + 3 (cleanup after verification)

## Overview

Migrate the frontend from self-hosted Docker/nginx deployment to Vercel for automatic deployments, preview URLs, edge CDN, and zero server maintenance. The API remains self-hosted. This migration involves creating Vercel configuration, updating CORS to allow Vercel domains, testing on preview deployments, and cleaning up Docker infrastructure after verification.

## Prerequisites

- [ ] Vercel account with access to deploy from GitHub
- [ ] Ability to update DNS records for photos.joeczar.com
- [ ] Current Docker deployment is stable and can serve as rollback

## Architecture

### Current Architecture (Before)
```
User → Cloudflare Tunnel → Docker nginx → Static Files (Vite build)
                          → Docker Bun API → PostgreSQL
```

### New Architecture (After)
```
User → Vercel Edge CDN → Static Files (Vite build)
     → Cloudflare Tunnel → Docker Bun API → PostgreSQL
```

### Components
- **vercel.json** - Build config, rewrites, headers (root directory)
- **CORS Middleware** - Updated to allow Vercel preview/production domains
- **nginx.conf** - Archived (kept for reference, removed from Docker)
- **Dockerfile** - Archived (kept for reference, removed from active use)
- **docker-compose.prod.yml** - Frontend service removed

### Data Flow
```
Git Push → GitHub → Vercel Build → Edge Deployment → DNS (photos.joeczar.com)
                  → Preview URL (*.vercel.app)
```

## Atomic Commits

### Phase 1: Configuration & Code Changes

#### Commit 1: Add Vercel configuration
**Type:** feat
**Scope:** infra
**Files:**
- `vercel.json` - Create

**Changes:**
- Create `vercel.json` in root directory with:
  - Build command: `cd app && pnpm build`
  - Output directory: `app/dist`
  - Framework preset: vite (optional, auto-detected)
  - SPA rewrites: all routes to `/index.html`
  - Cache headers for static assets (1 year immutable for hashed files)
  - Security headers matching current nginx config:
    - `X-Frame-Options: SAMEORIGIN`
    - `X-Content-Type-Options: nosniff`
  - No-cache headers for HTML files

**Configuration Details:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd app && pnpm build",
  "outputDirectory": "app/dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    },
    {
      "source": "/(.*)\\.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

**Acceptance Criteria:**
- [ ] `vercel.json` created in root directory
- [ ] Build command points to app directory
- [ ] Output directory set to `app/dist`
- [ ] SPA fallback configured for all routes
- [ ] Cache headers match nginx configuration
- [ ] Security headers match nginx configuration
- [ ] File validates against Vercel JSON schema (if validated locally)

---

#### Commit 2: Update CORS to allow Vercel domains
**Type:** feat
**Scope:** api
**Files:**
- `api/src/middleware/cors.ts` - Modify

**Changes:**
- Add Vercel preview domain pattern to ALLOWED_ORIGINS
- Add production Vercel domain (if different from custom domain)
- Support wildcard for preview deployments: `*.vercel.app`
- Keep existing localhost and FRONTEND_URL origins

**Implementation:**
```typescript
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
  // Vercel production (if using vercel.app domain before custom domain)
  'https://vacay-photo-map.vercel.app',
  // Vercel preview deployments (pattern match in origin function)
].filter(Boolean) as string[]

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null
    if (ALLOWED_ORIGINS.includes(origin)) return origin

    // Allow Vercel preview deployments (*.vercel.app)
    if (origin.endsWith('.vercel.app')) return origin

    return null
  },
  // ... rest of config
})
```

**Acceptance Criteria:**
- [ ] Localhost origins preserved
- [ ] FRONTEND_URL origin preserved
- [ ] Vercel production domain added
- [ ] Vercel preview domains (*.vercel.app) allowed via pattern matching
- [ ] CORS logic handles undefined/null origin gracefully
- [ ] Tests pass: `pnpm test:api`
- [ ] Types pass: `pnpm type-check:api`

---

#### Commit 3: Update documentation for Vercel deployment
**Type:** docs
**Scope:** infra
**Files:**
- `CLAUDE.md` - Modify
- `README.md` - Modify (if exists)

**Changes:**
- Update "Development Modes" section to mention Vercel for production
- Add "Vercel Deployment" section with:
  - Environment variables needed in Vercel dashboard
  - Build configuration (auto-detected from vercel.json)
  - Custom domain setup instructions
  - Preview deployment workflow
- Update architecture diagram/description to show Vercel
- Note that API remains self-hosted
- Add troubleshooting section for common Vercel issues

**Environment Variables for Vercel Dashboard:**
```
VITE_API_URL=https://api.photos.joeczar.com
VITE_APP_URL=https://photos.joeczar.com
VITE_WEBAUTHN_RP_NAME=Vacay Photo Map
VITE_WEBAUTHN_RP_ID=photos.joeczar.com
VITE_CDN_URL=https://r2-cdn.joeczar.com (optional, if using R2)
```

**Acceptance Criteria:**
- [ ] CLAUDE.md updated with Vercel deployment section
- [ ] Environment variables documented
- [ ] Custom domain setup documented
- [ ] Preview deployment workflow documented
- [ ] README.md updated (if applicable)

---

#### Commit 4: Add migration guide for Vercel setup
**Type:** docs
**Scope:** infra
**Files:**
- `docs/vercel-migration-guide.md` - Create

**Changes:**
- Create step-by-step guide for manual Vercel configuration
- Include screenshots/descriptions of Vercel dashboard settings
- DNS configuration steps for custom domain
- Rollback procedure if issues arise
- Testing checklist for preview and production deployments

**Guide Sections:**
1. **Vercel Project Setup**
   - Connect GitHub repository
   - Import project settings
   - Configure build settings (should auto-detect from vercel.json)

2. **Environment Variables**
   - Add all VITE_* variables to Vercel dashboard
   - Separate preview and production environments if needed

3. **Domain Configuration**
   - Add custom domain: photos.joeczar.com
   - DNS records to create (A/CNAME)
   - SSL certificate (automatic via Vercel)

4. **Testing Checklist**
   - [ ] Preview deployment works (PR #215)
   - [ ] WebAuthn works on preview domain
   - [ ] Images load from API
   - [ ] Map markers render correctly
   - [ ] Dark mode toggle works
   - [ ] PWA manifest loads
   - [ ] Service worker registers

5. **Rollback Procedure**
   - Revert DNS to Cloudflare Tunnel
   - Restart Docker frontend container
   - No code changes needed (Docker still works)

**Acceptance Criteria:**
- [ ] Migration guide created in docs/
- [ ] All manual steps documented clearly
- [ ] DNS configuration included
- [ ] Testing checklist comprehensive
- [ ] Rollback procedure documented

---

### Phase 2: Manual Vercel Setup (Not a Commit)

**These steps are performed manually in Vercel dashboard after commits 1-4 are merged:**

1. **Connect Repository to Vercel**
   - Log in to Vercel dashboard
   - Click "Add New Project"
   - Import `vacay-photo-map` from GitHub
   - Select main branch for production

2. **Configure Build Settings**
   - Root Directory: `./` (monorepo root)
   - Framework Preset: Vite (should auto-detect)
   - Build Command: `cd app && pnpm build` (from vercel.json)
   - Output Directory: `app/dist` (from vercel.json)
   - Install Command: `pnpm install`
   - Node Version: 20.x

3. **Set Environment Variables**
   - Add variables for Production:
     - `VITE_API_URL=https://api.photos.joeczar.com`
     - `VITE_APP_URL=https://photos.joeczar.com`
     - `VITE_WEBAUTHN_RP_NAME=Vacay Photo Map`
     - `VITE_WEBAUTHN_RP_ID=photos.joeczar.com`
     - `VITE_CDN_URL=https://r2-cdn.joeczar.com` (if applicable)
   - Add variables for Preview (same values for now)

4. **Deploy Initial Preview**
   - Create PR from feature branch
   - Vercel auto-deploys preview
   - Test preview URL thoroughly (see testing checklist)

5. **Verify Preview Deployment**
   - [ ] Site loads on preview URL
   - [ ] Can navigate to all routes (/trips, /admin, etc.)
   - [ ] Images load from API
   - [ ] WebAuthn registration works (test with preview RP_ID)
   - [ ] Dark mode persists
   - [ ] PWA manifest loads
   - [ ] Console has no errors

**Note:** WebAuthn may not work on preview domains if RP_ID is set to production domain. This is expected. Test WebAuthn after custom domain is configured.

---

### Phase 3: DNS & Production Deployment (Not a Commit)

**After preview deployment is verified successful:**

1. **Add Custom Domain in Vercel**
   - Go to Project Settings → Domains
   - Add domain: `photos.joeczar.com`
   - Vercel provides DNS records (A or CNAME)

2. **Update DNS Records**
   - Current: `photos.joeczar.com` points to Cloudflare Tunnel
   - New: Point to Vercel (A record or CNAME to `cname.vercel-dns.com`)
   - TTL: Set low (300s) for easy rollback
   - Wait for propagation (1-10 minutes)

3. **Verify SSL Certificate**
   - Vercel auto-provisions SSL (Let's Encrypt)
   - Check HTTPS works: https://photos.joeczar.com
   - Check SSL grade: https://www.ssllabs.com/ssltest/

4. **Test Production Deployment**
   - [ ] Site loads on custom domain
   - [ ] WebAuthn works (RP_ID matches custom domain)
   - [ ] Existing user can log in
   - [ ] New user can register
   - [ ] Upload photo works
   - [ ] Map shows photos correctly
   - [ ] Dark mode works
   - [ ] PWA install prompt appears (mobile)
   - [ ] Service worker updates correctly

5. **Monitor for 24-48 Hours**
   - Watch Vercel analytics for errors
   - Check API logs for CORS errors
   - Monitor user reports (if any)
   - Keep Docker frontend running as backup

---

### Phase 4: Cleanup (After Verification)

**Only proceed with cleanup after production Vercel deployment is stable for 24-48 hours.**

#### Commit 5: Archive frontend Docker configuration
**Type:** chore
**Scope:** infra
**Files:**
- `app/Dockerfile` - Delete
- `app/nginx.conf` - Delete
- `docs/archived/frontend-docker/Dockerfile` - Create
- `docs/archived/frontend-docker/nginx.conf` - Create
- `docs/archived/frontend-docker/README.md` - Create

**Changes:**
- Move `app/Dockerfile` to `docs/archived/frontend-docker/Dockerfile`
- Move `app/nginx.conf` to `docs/archived/frontend-docker/nginx.conf`
- Create README in archive explaining:
  - Why files were archived
  - Date of Vercel migration
  - How to restore if needed
  - Reference to issue #215

**Acceptance Criteria:**
- [ ] Dockerfile moved to archive
- [ ] nginx.conf moved to archive
- [ ] Archive README created with context
- [ ] Original files deleted from app/

---

#### Commit 6: Remove frontend from docker-compose.prod.yml
**Type:** chore
**Scope:** infra
**Files:**
- `docker-compose.prod.yml` - Modify

**Changes:**
- Remove `frontend` service definition (lines 63-68)
- Remove `vacay-frontend` from watchtower command (line 82)
- Keep postgres, api, watchtower, uptime-kuma services
- Update comments to reflect frontend is now on Vercel

**Before:**
```yaml
  frontend:
    image: ghcr.io/joeczar/vacay-photo-map/frontend:latest
    container_name: vacay-frontend
    restart: unless-stopped
    networks:
      - proxy
```

**After:**
```yaml
# Frontend removed - now deployed on Vercel
# See docs/vercel-migration-guide.md
```

**Watchtower Before:**
```yaml
command: --interval 300 vacay-api vacay-frontend
```

**Watchtower After:**
```yaml
command: --interval 300 vacay-api
```

**Acceptance Criteria:**
- [ ] Frontend service removed from docker-compose.prod.yml
- [ ] Watchtower command updated
- [ ] Comments added explaining change
- [ ] File still valid docker-compose YAML
- [ ] Other services (postgres, api) unchanged

---

#### Commit 7: Archive frontend CI workflow
**Type:** chore
**Scope:** ci
**Files:**
- `.github/workflows/build-and-push-frontend.yml` - Delete
- `.github/workflows/archived/build-and-push-frontend.yml` - Create

**Changes:**
- Move workflow to `.github/workflows/archived/` directory
- Add comment at top of archived file explaining why it was archived
- Note: GitHub Actions ignores workflows not in `.github/workflows/` root

**Archived File Header:**
```yaml
# ARCHIVED: 2025-12-28
# Frontend deployment moved to Vercel (Issue #215)
# This workflow is no longer active but preserved for reference
# To restore Docker deployment, move this file back to .github/workflows/

name: Build and Push Frontend (ARCHIVED)
```

**Acceptance Criteria:**
- [ ] Workflow moved to archived/ subdirectory
- [ ] Archive comment added to file
- [ ] Workflow no longer triggers on push
- [ ] File preserved for reference/rollback

---

## Testing Strategy

### Unit Tests
No new unit tests required (infrastructure change only).

### Integration Tests
**Manual testing on preview deployment:**
- Authentication flow (WebAuthn)
- Photo upload and display
- Map rendering with markers
- Dark mode persistence
- PWA functionality

### End-to-End Testing
**Checklist for preview deployment:**
- [ ] Navigate to preview URL
- [ ] Register new user (creates passkey)
- [ ] Log out and log back in (uses passkey)
- [ ] Create trip with photos
- [ ] View trip on map
- [ ] Toggle dark mode
- [ ] Check responsive design (mobile/tablet)
- [ ] Test PWA install (mobile)
- [ ] Verify service worker in DevTools

**Checklist for production deployment:**
- [ ] Test on custom domain (photos.joeczar.com)
- [ ] Existing user can log in
- [ ] New user can register
- [ ] Upload photos to trip
- [ ] View existing trips
- [ ] Dark mode works
- [ ] PWA updates correctly
- [ ] Check Vercel analytics for errors
- [ ] Monitor API logs for CORS issues

### Performance Testing
**Compare metrics (before/after):**
- Lighthouse score (Performance, Accessibility, Best Practices, SEO)
- Time to First Byte (TTFB)
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Total Blocking Time (TBT)
- Cumulative Layout Shift (CLS)

**Vercel provides built-in analytics for:**
- Web Vitals
- Real User Monitoring (RUM)
- Edge function performance

---

## Verification Checklist

### Before Phase 1 (Code Changes)
- [ ] Current Docker deployment is stable
- [ ] Backup of current docker-compose.prod.yml
- [ ] Vercel account set up
- [ ] DNS access confirmed

### After Phase 1 (Commits 1-4)
- [ ] All commits completed and reviewed
- [ ] `vercel.json` validated
- [ ] CORS middleware updated
- [ ] Documentation updated
- [ ] Types pass: `pnpm type-check && pnpm type-check:api`
- [ ] Lint passes: `pnpm lint`

### After Phase 2 (Manual Vercel Setup)
- [ ] Preview deployment successful
- [ ] Preview URL loads correctly
- [ ] All routes work (SPA fallback)
- [ ] Static assets load
- [ ] No console errors

### After Phase 3 (Production Deployment)
- [ ] Custom domain resolves to Vercel
- [ ] SSL certificate active
- [ ] Production site loads
- [ ] WebAuthn works with custom domain
- [ ] Existing users can log in
- [ ] No CORS errors in API logs
- [ ] Vercel analytics showing traffic

### Before Phase 4 (Cleanup)
- [ ] Production stable for 24-48 hours
- [ ] No critical errors in Vercel logs
- [ ] No user reports of issues
- [ ] Docker frontend can still be started (rollback test)

### After Phase 4 (Commits 5-7)
- [ ] Docker files archived
- [ ] docker-compose.prod.yml updated
- [ ] CI workflow archived
- [ ] All commits merged to main
- [ ] PR created and reviewed

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **WebAuthn fails on Vercel domain** | Users cannot log in | Test preview deployment early; RP_ID should work with custom domain |
| **CORS errors from Vercel** | API calls fail | Update CORS before Vercel deployment; test preview URL thoroughly |
| **Build fails on Vercel** | Deployment blocked | Test build locally (`pnpm build`); verify vercel.json config |
| **DNS propagation issues** | Site unavailable during migration | Use low TTL before change; keep Docker running during transition |
| **Environment variables missing** | Site breaks in production | Document all required vars; verify in preview deployment |
| **PWA service worker conflicts** | Caching issues | Test service worker update flow; clear cache if needed |
| **Static asset 404s** | Images/CSS missing | Verify output directory in vercel.json; check build output |
| **Rollback needed** | Downtime during revert | Keep Docker setup intact until Phase 4; document rollback steps |

---

## Open Questions

1. **Should we keep netlify.toml?**
   - Current: Project has netlify.toml with similar config
   - Decision needed: Remove it, or keep for future Netlify option?
   - Recommendation: Remove to avoid confusion (Vercel is the target)

2. **Should preview deployments use different RP_ID?**
   - Current: RP_ID set to photos.joeczar.com (production)
   - Issue: WebAuthn may not work on *.vercel.app preview domains
   - Options:
     - A) Test without WebAuthn on preview (acceptable for UI testing)
     - B) Set up preview-specific environment with different RP_ID
   - Recommendation: Option A (preview for UI, production for auth testing)

3. **When to update API to enforce new CORS origins?**
   - Current: CORS allows *.vercel.app wildcard
   - Security: Wildcard less secure than explicit domains
   - Options:
     - A) Keep wildcard for flexibility with preview deployments
     - B) Tighten after migration (explicit Vercel production domain only)
   - Recommendation: Option A initially, revisit after migration stable

4. **Should we set up Vercel preview environments per branch?**
   - Default: Every PR gets a preview deployment
   - Option: Limit to specific branches (main, develop)
   - Recommendation: Keep default (useful for testing features)

5. **Do we want Vercel Analytics or stick with Cloudflare?**
   - Vercel provides Web Vitals, RUM, edge metrics
   - Cloudflare provides DNS/CDN analytics
   - Recommendation: Enable both (non-conflicting)

---

## Implementation Timeline

**Estimated: 2-3 hours (plus waiting periods)**

- **Phase 1 (Code Changes):** 30 minutes
  - Commit 1: Create vercel.json (10 min)
  - Commit 2: Update CORS (10 min)
  - Commit 3: Update docs (5 min)
  - Commit 4: Migration guide (5 min)

- **Phase 2 (Manual Setup):** 20 minutes
  - Vercel project setup (5 min)
  - Environment variables (5 min)
  - Preview deployment (5 min)
  - Testing preview (5 min)

- **Phase 3 (Production):** 30 minutes + propagation time
  - Add custom domain (5 min)
  - Update DNS (5 min)
  - Wait for propagation (5-60 min)
  - Verify SSL (5 min)
  - Test production (10 min)

- **Monitoring Period:** 24-48 hours
  - Watch for errors
  - Monitor user reports
  - Keep Docker running

- **Phase 4 (Cleanup):** 20 minutes
  - Commit 5: Archive Docker files (5 min)
  - Commit 6: Update docker-compose (5 min)
  - Commit 7: Archive CI workflow (5 min)
  - Final verification (5 min)

---

## Success Criteria

- [ ] Frontend deployed on Vercel (https://photos.joeczar.com)
- [ ] All routes work (SPA fallback)
- [ ] WebAuthn works on custom domain
- [ ] Images load from self-hosted API
- [ ] Dark mode persists
- [ ] PWA installs correctly
- [ ] Preview deployments work for PRs
- [ ] No CORS errors in API logs
- [ ] Docker infrastructure cleaned up
- [ ] Documentation updated
- [ ] Team can deploy via git push (no manual intervention)

---

## Rollback Plan

**If issues arise after DNS change:**

1. **Immediate Rollback (< 5 minutes):**
   ```bash
   # On server
   docker compose -p vacay-prod -f docker-compose.prod.yml up -d frontend

   # Update DNS to point back to Cloudflare Tunnel
   # Revert DNS A/CNAME record to previous value
   ```

2. **Verify Rollback:**
   - [ ] Site loads on photos.joeczar.com
   - [ ] Docker nginx serving files
   - [ ] Users can access site

3. **Post-Rollback Investigation:**
   - Check Vercel logs for build errors
   - Check API logs for CORS issues
   - Review environment variables
   - Test locally with `pnpm build && pnpm preview`

4. **Code Rollback (if needed):**
   ```bash
   git revert <commit-hash>  # Revert CORS changes if causing issues
   ```

---

## Notes

- **Keep Docker setup until Phase 4** - Don't delete anything until Vercel is verified stable
- **Test preview deployment thoroughly** - This is your safety net before production
- **Monitor Vercel analytics** - Built-in monitoring for errors and performance
- **Document any issues** - Update migration guide with lessons learned
- **Consider Vercel CLI** - Useful for local testing and debugging (`vercel dev`)
- **Preview deployments are free** - Unlimited preview URLs for testing

---

## References

- Issue #215: https://github.com/joeczar/vacay-photo-map/issues/215
- Vercel Documentation: https://vercel.com/docs
- Vercel CLI: https://vercel.com/docs/cli
- vercel.json Schema: https://vercel.com/docs/projects/project-configuration
- Current nginx config: `app/nginx.conf`
- Current Dockerfile: `app/Dockerfile`
- Current CI workflow: `.github/workflows/build-and-push-frontend.yml`
