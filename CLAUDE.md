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

**Dev tunnel (mobile testing):**
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
- Production at `https://photos-api.joeczar.com` (via Cloudflare Tunnel)
- Docker Compose stack with Postgres, API, Watchtower

**Environment Variables (Vercel Dashboard):**
```
VITE_API_URL=https://photos-api.joeczar.com
VITE_APP_URL=https://photos.joeczar.com
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
- **Auth**: Password + bcrypt (via Bun.password) + JWT, enforced on admin routes

**Schema:**
- Current: `user_profiles`, `trips`, `photos`, `trip_access`, `invites`
- Note: `authenticators` table dropped in migration 001 (WebAuthn deprecated)

## Project Context

Milestones in GitHub Issues. See GitHub project board for current priorities.

## File Organization

- Views: Full page components
- Components: Reusable UI (shadcn in `ui/`)
- Utils: Pure functions
- Lib: Service clients
- Composables: Vue composables (will be created)

## Database Migrations

**Schema changes go in numbered migrations, not schema.sql.**

- Migration files: `api/migrations/NNN-description.sql`
- Migration tool: `postgres-migrations` library
- Run migrations: `bun scripts/migrate.ts` (or `pnpm migrate` from api/)
- Tracking table: `migrations` (created automatically)

**Creating a new migration:**
1. Find next number: `ls api/migrations/ | tail -1` (e.g., 007)
2. Create file: `api/migrations/008-add-new-column.sql`
3. Write idempotent SQL (use DO blocks, IF NOT EXISTS)
4. Test locally: `pnpm migrate` (from api/)
5. Commit and deploy
   - Production: Migrations run automatically via docker-entrypoint.sh
   - Local dev: Run `pnpm migrate` manually after pulling changes

**DO NOT:**
- Edit `api/src/db/schema.sql` (deprecated, reference only)
- Edit old migrations (create new one to fix)
- Delete migrations (breaks version tracking)
- Run SQL manually in production (use migrations)

**Philosophy:** Roll forward, never rollback. If a migration causes issues, create a new migration to fix it.

## Common Gotchas

- **GPS**: Always `xmp: true` in exifr, validate coordinates, null island check
- **Photos**: Warning icon if no GPS, map only shows valid coordinates
- **R2 Fallback**: If R2 not configured, photos save to local `PHOTOS_DIR` (default: `/data/photos`)
- **Database User**: RLS INSERT policies expect user `vacay` - don't change without updating policies
- **Password Reset**: Admin-only via POST `/api/auth/admin/reset-password` (no self-service recovery)

## Environment Variables

**App (`app/.env`):**
- `VITE_API_URL` - API endpoint (http://localhost:4000 for local dev)
- `VITE_APP_URL` - Frontend URL for redirects (http://localhost:5173 for local dev)
- `VITE_CDN_URL` - Optional CDN for images

**API (`api/.env`):**
- Required: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`
- Optional: `R2_*` vars for Cloudflare R2 storage
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
│   │ For frontend changes: Playwright verification
│   │   - Navigate to affected pages
│   │   - Verify UI renders correctly
│   │   - Test user flows end-to-end
│   │ You review and approve or request changes
│   │ I commit (you approve the commit)
│   └───────────────────────────────────────────
└───────────────────────────────────────────────

FINALIZATION (MANDATORY - DO NOT SKIP) ─────────
│ ⚠️  HARD GATE: Complete ALL steps before PR creation
│
│ [ ] 1. Spawn `tester` agent → reviews test quality
│        - Verifies tests use shared infrastructure
│        - Checks for hardcoded values
│        - Ensures adequate coverage
│
│ [ ] 2. Spawn `reviewer` agent → validates quality
│        - Schema alignment
│        - API patterns
│        - Auth flows
│
│ [ ] 3. Run `/pr-review-toolkit:review-pr`
│        - Comprehensive code review
│
│ [ ] 4. ONLY THEN: `gh pr create`
│
│ See .claude/rules/pr-workflow.md for details
└───────────────────────────────────────────────
```

### Worker Agents

| Agent | Purpose |
|-------|---------|
| `researcher` | Gathers codebase context, fetches library docs |
| `planner` | Creates atomic commit plan in `/docs/` |
| `implementer` | Implements ONE commit, returns diff |
| `tester` | Writes and runs tests |
| `reviewer` | Validates code quality (schema, API, auth) |
| `doc-writer` | Technical documentation (utility) |
| `ui-polisher` | UI polish work (utility) |

### Review Tools

Two complementary review stages:

| Tool | Purpose | Checks |
|------|---------|--------|
| Custom `reviewer` | Project-specific validation | Schema alignment, API integration, auth flows, unused code |
| `pr-review-toolkit` | Comprehensive PR review | Code quality, test coverage, comments, types, silent failures |

**When to use:**
- `reviewer` agent: Before every PR (catches project-specific issues)
- `/pr-review-toolkit:review-pr`: For thorough review (6 specialized agents)
- Individual toolkit agents: For focused analysis (e.g., `pr-test-analyzer` for test coverage)

### Direct Agent Use

```
"Research how auth works"     → researcher
"Write tests for uploads"     → tester
"Review my changes"           → reviewer (project-specific)
"Review PR for quality"       → /pr-review-toolkit:review-pr (comprehensive)
```

See `.claude/agents/README.md` for full documentation.
