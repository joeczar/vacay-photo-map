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
- Don't use shadcn for: Leaflet maps, EXIF utils, Supabase/Cloudinary clients

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
- **Supabase**: Type assertions needed (`as unknown as never` for inserts), RLS policies in `supabase-rls-fix.sql`
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
- Supabase: Use type helpers, assertions for inserts
- Photos: Warning icon if no GPS, map only shows valid coordinates
- Auth: Not implemented yet despite route guards

## Environment Variables

Required in `app/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`

## Agent Architecture

Uses orchestrator-worker pattern based on [Anthropic's multi-agent system](https://www.anthropic.com/engineering/multi-agent-research-system).

### Workflow Agents (Issue → PR lifecycle)

| Agent | Purpose | Trigger |
|-------|---------|---------|
| `workflow-orchestrator` | Coordinates full workflow | "Work on issue #X" |
| `researcher` | Gathers context, fetches docs | Before planning |
| `planner` | Creates implementation plans | After research |
| `implementer` | Builds features | After planning |
| `tester` | Writes and runs tests | After implementation |
| `reviewer` | Validates code quality | Before PR |

### Execution Modes

- **AUTO**: Continuous flow for simple issues ("Work on issue #X")
- **STEP**: Pause between phases for approval ("Step through issue #X")

### Utility Agents

| Agent | Purpose | Use When |
|-------|---------|----------|
| `doc-writer` | Technical documentation | Need deployment/API docs |
| `ui-polisher` | UI polish | Need responsive/animations |

### Direct Agent Use

```
"Research how auth works"     → researcher
"Write tests for uploads"     → tester
"Review my changes"           → reviewer
"Polish the mobile UI"        → ui-polisher
```

See `.claude/agents/README.md` for full documentation.
