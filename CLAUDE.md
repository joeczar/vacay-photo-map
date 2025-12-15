# CLAUDE.md

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
- Don't use shadcn for: Leaflet maps, EXIF utils, Cloudinary client

## Development

Run from root: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm type-check`

## Git Workflow

- Branch: `feature/issue-{number}-{description}`
- Commits: Conventional (`feat:`, `fix:`, etc.), atomic, reference issue number
- Create PR with `gh pr create`
- Check for Review Comments after pr creation (can take some time) resolve them if relevant

## Architecture

**Data Flow:**
- Upload: User selects → extractExif (with `xmp: true`) → uploadToCloudinary → createTrip → createPhotos
- Display: getTripBySlug → TripView → Leaflet map with markers

**Critical Details:**
- **EXIF**: Must use `xmp: true` or GPS fails on 95% of iPhone photos
- **API**: Hono backend at `api/`, PostgreSQL database via `postgres` package
- **Cloudinary**: EXIF extracted before upload, originals preserve metadata
- **Routes**: `/`, `/admin`, `/trip/:slug` - auth guards not enforced yet

**Schema:**
- Current: `trips`, `photos`
- Upcoming: `user_profiles`, `photo_comments`, `invites` (see PROJECT_ROADMAP.md)

## Project Context

Milestones in GitHub Issues. Current: Milestone 1 (dark mode). Next: WebAuthn auth, comments, admin invites.

## File Organization

- Views: Full page components
- Components: Reusable UI (shadcn in `ui/`)
- Utils: Pure functions
- Lib: Service clients
- Composables: Vue composables (will be created)

## Common Gotchas

- GPS: Always `xmp: true`, validate coordinates, null island check
- Photos: Warning icon if no GPS, map only shows valid coordinates
- Auth: Not implemented yet despite route guards

## Environment Variables

Required in `app/.env`: `VITE_API_URL`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`
Required in `api/.env`: `DATABASE_URL`, `JWT_SECRET`, `RP_ID`, `RP_ORIGIN`

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
