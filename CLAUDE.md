# CLAUDE.md

## ⚠️ Dev Server Startup - READ FIRST

**ALWAYS use this single command to start the dev environment:**
```bash
pnpm dev:docker
```

This starts Postgres, frontend (5173), and API (4000) together. **NEVER run `pnpm dev` or `pnpm dev:api` separately.**

---

## Testing Policy

**CRITICAL: Test every change before committing.**


1. Make changes
2. Verify in browser with Playwright or create tests if important
3. Run `pnpm test` and `pnpm type-check`
4. Commit only if everything works

Use Playwright MCP tools to test UI. Test all states, dark mode, interactions, and responsive behavior.

Try TDD if you have a difficult feature

## shadcn-vue

**Always use shadcn-vue components first.** New York style, Slate base, CSS variables for theming.

- Add components: `pnpm dlx shadcn-vue@latest add [component]`
- Don't use shadcn for: Leaflet maps, EXIF utils

## Development

Run from root: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm type-check`

### Starting Dev Environment

**IMPORTANT: Use this single command to start everything:**
```bash
pnpm dev:docker   # Starts postgres + frontend + API all at once
```

This runs concurrently: docker compose, frontend (localhost:5173), API (localhost:4000).

### Development Modes

**Local development (manual, if needed):**
```bash
docker compose -p vacay-dev up -d postgres  # Start local database
pnpm dev       # Frontend at localhost:5173
pnpm dev:api   # API at localhost:4000
```

**Dev tunnel (mobile/WebAuthn testing):**
```bash
# Cloudflare Tunnel provides public HTTPS URLs for testing on real devices
# Frontend: https://photos-dev.joeczar.com → localhost:5173
# API: https://photos-dev-api.joeczar.com → localhost:4000

docker compose -p vacay-dev up -d postgres  # Start local database
pnpm dev       # Frontend
pnpm dev:api   # API

# Navigate to https://photos-dev.joeczar.com for mobile testing
```

**Note:** Dev tunnel requires Cloudflare Tunnel configured on server. Environment files (`app/.env`, `api/.env`) are already configured for this setup.

### Remote Development (Tailscale + Prod DB)

Develop locally against production database without touching your local `.env`:

**1. Server setup (one-time):**
```bash
# Add to server's .env.production
POSTGRES_HOST=0.0.0.0

# Restart postgres
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres
```

**2. Local setup (one-time):**
```bash
cp api/.env.prod.example api/.env.prod
# Edit api/.env.prod with your Tailscale IP and prod credentials
```

**3. Run:**
```bash
pnpm dev:prod  # Uses api/.env.prod automatically
```

**Port Configuration:**
- Local dev database: `localhost:5433` (avoids conflicts with existing PostgreSQL)
- Dev API server: `localhost:4000` (avoids conflicts with production API on 3000)
- Production database: `5432` (standard PostgreSQL port)
- All can run simultaneously without interference

**Database project naming:**
```bash
# CRITICAL: Use project name to avoid conflicts with production docker compose
docker compose -p vacay-dev up -d postgres  # Development database
docker compose -p vacay-prod up -d postgres # Production database (different project)
```

**First user registration:** Navigate to localhost:5173/register (or https://photos-dev.joeczar.com/register for dev tunnel) - first user becomes admin.

### Dev Server Management

Claude Code hooks automatically manage dev server lifecycle:

- **SessionStart**: Ensures postgres is running
- **Stop**: Cleans up orphaned vite/bun processes on exit

**Manual commands:**
```bash
.claude/hooks/check-dev-status.sh  # Check what's running
.claude/hooks/cleanup-dev.sh       # Force cleanup orphaned processes
```

The `dev-server` skill (`.claude/skills/dev-server/`) provides Claude with commands for starting, stopping, and troubleshooting dev servers.

### Production Deployment

**Frontend:** Vercel (automatic deployments from `main` branch)
- Preview deployments for every PR
- Production at `https://photos.joeczar.com`
- Configuration in `vercel.json`

**API:** Self-hosted Docker (Bun + Hono)
- Production at `https://photos.joeczar.com` (via Cloudflare Tunnel)
- Docker Compose stack with Postgres, API, Watchtower

**Environment Variables (Vercel Dashboard):**
```
VITE_API_URL=https://photos.joeczar.com
VITE_APP_URL=https://photos.joeczar.com
VITE_WEBAUTHN_RP_NAME=Vacay Photo Map
VITE_WEBAUTHN_RP_ID=photos.joeczar.com
VITE_CDN_URL=https://images.joeczar.com
```

## Git Workflow

- Branch: `feature/issue-{number}-{description}`
- Commits: Conventional (`feat:`, `fix:`, etc.), atomic, reference issue number
- Create PR with `gh pr create`
- Check for Review Comments after pr creation (can take some time) resolve them if relevant

## Architecture

**Data Flow:**
- Upload: User selects → extractExif (with `xmp: true`) → upload to API → Sharp processing → R2/local storage → createTrip → createPhotos
- Display: getTripBySlug (API) → TripView → Leaflet map with markers → photos served from /api/photos/:key

**Critical Details:**
- **EXIF**: Must use `xmp: true` or GPS fails on 95% of iPhone photos
- **API**: Bun + Hono backend at `api/`, PostgreSQL database via `postgres` package
- **Storage**: Cloudflare R2 (primary) with local filesystem fallback
- **Image Processing**: Sharp generates thumbnails (800px wide) server-side
- **Routes**: `/`, `/admin`, `/login`, `/register`, `/trips`, `/trip/:slug`
- **Auth**: WebAuthn/passkeys + JWT, enforced on admin routes

**Schema:**
- Current: `user_profiles`, `authenticators`, `trips`, `photos`
- Upcoming: `photo_comments`, `invites` (see PROJECT_ROADMAP.md)

## Project Context

Milestones in GitHub Issues. Current: Milestone 1 (dark mode). Next: WebAuthn auth, comments, admin invites.

## File Organization

- Views: Full page components
- Components: Reusable UI (shadcn in `ui/`)
- Utils: Pure functions
- Lib: Service clients
- Composables: Vue composables (will be created)

## Common Gotchas

- **GPS**: Always `xmp: true` in exifr, validate coordinates, null island check
- **Photos**: Warning icon if no GPS, map only shows valid coordinates
- **R2 Fallback**: If R2 not configured, photos save to local `PHOTOS_DIR` (default: `/data/photos`)
- **WebAuthn RP_ID**: Must match domain (localhost for dev, your-domain.com for prod)
- **Database User**: RLS INSERT policies expect user `vacay` - don't change without updating policies

## Environment Variables

**App (`app/.env`):**
- `VITE_API_URL` - API endpoint
  - Local dev: `http://localhost:4000`
  - Dev tunnel: `https://photos-dev-api.joeczar.com`
- `VITE_APP_URL` - Frontend URL for redirects
  - Local dev: `http://localhost:5173`
  - Dev tunnel: `https://photos-dev.joeczar.com`
- `VITE_WEBAUTHN_RP_NAME` - Display name for passkeys
- `VITE_WEBAUTHN_RP_ID` - Domain for WebAuthn
  - Local dev: `localhost`
  - Dev tunnel: `photos-dev.joeczar.com`

**API (`api/.env`):**
- Required: `DATABASE_URL`, `JWT_SECRET`, `RP_ID`, `RP_NAME`, `RP_ORIGIN`, `FRONTEND_URL`
  - `RP_ID` matches `VITE_WEBAUTHN_RP_ID` (localhost or photos-dev.joeczar.com)
  - `RP_ORIGIN` matches `VITE_APP_URL`
  - `FRONTEND_URL` matches `VITE_APP_URL`
- Optional: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- See `api/.env.example` for full list

## Agent Workflow

**I (Claude) am the orchestrator.** Worker agents handle focused tasks and return to me.

Use `/work-on-issue {number}` to start the workflow.

### The Gated Workflow

```
USER: /work-on-issue 60

GATE 1 ─────────────────────────────────────────
│ I fetch the issue with `gh issue view`
│ I show you the FULL issue (verbatim)
│ You review and say "proceed" or give feedback
└───────────────────────────────────────────────

RESEARCH (sequential) ──────────────────────────
│ I spawn `researcher` agent → returns findings
│ (planner needs research results - NOT parallel)
└───────────────────────────────────────────────

PLANNING + GATE 2 ──────────────────────────────
│ I spawn `planner` agent with research findings
│ Planner writes plan to /docs/
│ (You review at the file write permission prompt)
└───────────────────────────────────────────────

IMPLEMENTATION (per commit) ────────────────────
│ For each atomic commit in the plan:
│   I spawn `implementer` agent → returns diff
│
│   GATE 3 ─────────────────────────────────────
│   │ I show you the diff
│   │ You review and approve or request changes
│   │ I commit (you approve the commit)
│   └───────────────────────────────────────────
└───────────────────────────────────────────────

FINALIZATION ───────────────────────────────────
│ I spawn `tester` agent → writes/runs tests
│ I spawn `reviewer` agent → validates quality
│ I create PR with `gh pr create`
└───────────────────────────────────────────────
```

### Worker Agents

| Agent | Purpose |
|-------|---------|
| `researcher` | Gathers codebase context, fetches library docs |
| `planner` | Creates atomic commit plan in `/docs/` |
| `implementer` | Implements ONE commit, returns diff |
| `tester` | Writes and runs tests |
| `reviewer` | Validates code quality before PR |
| `doc-writer` | Technical documentation (utility) |
| `ui-polisher` | UI polish work (utility) |

### Direct Agent Use

```
"Research how auth works"     → researcher
"Write tests for uploads"     → tester
"Review my changes"           → reviewer
```

See `.claude/agents/README.md` for full documentation.
