# Dev Server Startup

**Applies to:** Starting development environment

## The Only Command

```bash
pnpm dev:docker
```

This single command starts:
- Docker Compose (Postgres database)
- Frontend (Vite at localhost:5173)
- API (Bun at localhost:4000)

## Never Do This

- ❌ `pnpm dev` alone
- ❌ `pnpm dev:api` alone
- ❌ `docker compose up` manually
- ❌ Multiple terminal commands

## Always Do This

- ✅ `pnpm dev:docker` - one command, everything starts
