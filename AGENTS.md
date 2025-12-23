# Repository Guidelines

## Project Structure & Module Organization
- Frontend lives in `app` (Vue 3 + Vite, TypeScript); core code in `app/src` with feature folders for components, views, composables, stores, utils, and router. Static assets stay in `app/public` and `app/src/assets`.
- Backend lives in `api` (Bun + Hono) with routes and middleware under `api/src`. Keep new API handlers co-located with related middleware and tests.
- Shared docs and schemas: `docs/` for setup guides, `api/src/db/schema.sql` for database schema, `netlify.toml` for deploy settings.

## Build, Test, and Development Commands
- `pnpm install` — install workspace deps (requires Node 18+ and pnpm 9+). Bun is needed for API scripts.
- `pnpm dev` / `pnpm build` / `pnpm preview` — run, build, and preview the Vue app.
- `pnpm dev:api` — start the Bun API with hot reload; `pnpm type-check:api` for TS checks.
- `pnpm lint` / `pnpm format` — ESLint + Prettier for the app; prefer auto-fix before commits.
- `pnpm test` — Vitest for the app (happy-dom); `pnpm test:api` — Bun test suite.

## Coding Style & Naming Conventions
- Prettier enforces no semicolons, 2-space indent, single quotes, 100-char line width, no trailing commas.
- ESLint config extends Vue/TypeScript/Prettier; avoid console/debugger in production code.
- Components in PascalCase (`TripMap.vue`), composables start with `use`, stores and utilities in camelCase files. Keep props/events typed and narrow.

## Testing Guidelines
- Place app specs as `*.test.ts` beside the code (examples in `app/src/composables` and `app/src/views`). Use happy-dom for DOM-heavy components.
- API tests live under `api/src` (see `routes/health.test.ts`). Prefer request-level tests through Hono handlers.
- Cover new logic paths (auth, upload, map rendering) and add regression tests when fixing bugs.

## Commit & Pull Request Guidelines
- Follow conventional commit prefixes seen in history: `feat`, `fix`, `chore`, `test`, etc. Keep scopes short (e.g., `feat(app): add trip playback`).
- Before opening a PR: ensure lint, type-check, and tests pass; include a brief summary, linked issue (if any), and relevant screenshots or request logs for UI/API changes.

## Security & Configuration Tips
- Copy `app/.env.example` to `app/.env` and `api/.env.example` to `api/.env`; never commit secrets. Keep JWT secrets and RP settings scoped to environment.
- Run `pnpm migrate:api` to apply database migrations. Use `docker-compose up` for local PostgreSQL. Confirm `netlify.toml` env vars in deployment.
